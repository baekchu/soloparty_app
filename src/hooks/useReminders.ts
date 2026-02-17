/**
 * 이벤트 리마인더 훅 (v2 - 오류 방지 강화)
 * - expo-notifications 기반 로컬 알림 예약
 * - Expo Go / 네이티브 빌드 양쪽 지원
 * - Android 채널 자동 설정
 * - 타임존 안전한 날짜 파싱
 * - stale closure 방지 (ref 패턴)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';
import { Event } from '../types';

// ==================== 상수 ====================
const REMINDERS_KEY = '@event_reminders_v2';
const MAX_REMINDERS = 50;
const isExpoGo = Constants.appOwnership === 'expo';

// ==================== 타입 ====================
interface EventReminder {
  eventId: string;
  eventTitle: string;
  date: string;
  time?: string;
  location?: string;
  notificationId: string;
  triggerAt: number; // 알림 울리는 시간 (epoch ms)
  createdAt: number;
}

// ==================== 초기화 (전역 1회) ====================
let _handlerSet = false;
let _channelReady = false;

function ensureNotificationHandler() {
  if (_handlerSet || isExpoGo) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    _handlerSet = true;
  } catch {
    // 핸들러 설정 실패 무시
  }
}

async function ensureAndroidChannel(): Promise<void> {
  if (_channelReady || Platform.OS !== 'android' || isExpoGo) {
    _channelReady = true;
    return;
  }
  try {
    await Notifications.setNotificationChannelAsync('event-reminders', {
      name: '파티 알림',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#ec4899',
      sound: 'default',
    });
    _channelReady = true;
  } catch {
    // 채널 설정 실패 무시
  }
}

// ==================== 날짜/시간 파싱 (타임존 안전) ====================
function parseEventDateTime(dateStr: string, timeStr?: string): Date | null {
  try {
    // YYYY-MM-DD → 로컬 타임존 (new Date('2025-01-15')는 UTC로 파싱되므로 직접 분리)
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed
    const day = parseInt(parts[2], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

    const d = new Date(year, month, day);
    if (isNaN(d.getTime())) return null;

    if (timeStr) {
      // "19:00", "19:30" 형식
      const match24 = timeStr.match(/(\d{1,2}):(\d{2})/);
      if (match24) {
        d.setHours(parseInt(match24[1], 10), parseInt(match24[2], 10), 0, 0);
        return d;
      }

      // "오후 7시 30분", "오후 7시", "오전 11시", "7시" 형식
      const matchKor = timeStr.match(/(?:(?:오전|오후)\s*)?(\d{1,2})시(?:\s*(\d{1,2})분)?/);
      if (matchKor) {
        let hours = parseInt(matchKor[1], 10);
        if (timeStr.includes('오후') && hours < 12) hours += 12;
        if (timeStr.includes('오전') && hours === 12) hours = 0;
        const minutes = matchKor[2] ? parseInt(matchKor[2], 10) : 0;
        d.setHours(hours, minutes, 0, 0);
        return d;
      }

      // "PM 7:00", "7 PM", "11 AM" 형식
      const matchEn = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
      if (matchEn) {
        let hours = parseInt(matchEn[1], 10);
        const minutes = matchEn[2] ? parseInt(matchEn[2], 10) : 0;
        if (matchEn[3].toUpperCase() === 'PM' && hours < 12) hours += 12;
        if (matchEn[3].toUpperCase() === 'AM' && hours === 12) hours = 0;
        d.setHours(hours, minutes, 0, 0);
        return d;
      }
    }

    // 시간 정보 없으면 오후 6시 기본값 (대부분 파티는 저녁)
    d.setHours(18, 0, 0, 0);
    return d;
  } catch {
    return null;
  }
}

function parseDate(dateStr: string): Date | null {
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const d = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10),
    );
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function formatReminderTime(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours < 12 ? '오전' : '오후';
  const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${month}/${day} ${period} ${displayHour}시${minutes > 0 ? ` ${minutes}분` : ''}`;
}

// ==================== 훅 ====================
export default function useReminders() {
  const [reminders, setReminders] = useState<EventReminder[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const isMountedRef = useRef(true);
  // stale closure 방지: ref로 최신 reminders 추적
  const remindersRef = useRef<EventReminder[]>([]);
  remindersRef.current = reminders;

  // 초기 로드 (1회)
  useEffect(() => {
    isMountedRef.current = true;
    ensureNotificationHandler();

    const init = async () => {
      if (!isExpoGo) {
        await ensureAndroidChannel();
      }
      await loadRemindersFromStorage();
    };
    init();

    return () => {
      isMountedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 로드 ----
  const loadRemindersFromStorage = async () => {
    try {
      const stored = await safeGetItem(REMINDERS_KEY);
      if (!stored || stored.length > 200000) {
        if (isMountedRef.current) setIsLoaded(true);
        return;
      }

      let parsed: any[];
      try {
        parsed = JSON.parse(stored);
      } catch {
        if (isMountedRef.current) setIsLoaded(true);
        return;
      }
      if (!Array.isArray(parsed)) {
        if (isMountedRef.current) setIsLoaded(true);
        return;
      }

      const now = Date.now();
      const valid: EventReminder[] = [];
      const expiredIds: string[] = [];

      for (const r of parsed) {
        if (!r?.eventId || !r?.date || !r?.notificationId) continue;

        // 이벤트 날짜가 하루 이상 지남 → 만료
        const eventDate = parseDate(r.date);
        if (eventDate) {
          eventDate.setHours(23, 59, 59, 999);
          if (eventDate.getTime() < now) {
            expiredIds.push(r.notificationId);
            continue;
          }
        }
        valid.push(r);
      }

      // 만료된 알림 조용히 취소
      if (!isExpoGo) {
        for (const nid of expiredIds) {
          try {
            await Notifications.cancelScheduledNotificationAsync(nid);
          } catch { /* 무시 */ }
        }
      }

      if (isMountedRef.current) {
        setReminders(valid);
        remindersRef.current = valid;
      }

      if (expiredIds.length > 0) {
        try {
          await safeSetItem(REMINDERS_KEY, JSON.stringify(valid));
        } catch { /* 무시 */ }
      }
    } catch {
      // 전체 로드 실패
    } finally {
      if (isMountedRef.current) setIsLoaded(true);
    }
  };

  // ---- 저장 ----
  const saveReminders = useCallback(async (updated: EventReminder[]) => {
    try {
      await safeSetItem(REMINDERS_KEY, JSON.stringify(updated));
    } catch { /* 저장 실패 무시 */ }
  }, []);

  // ---- 리마인더 확인 ----
  const hasReminder = useCallback((eventId: string | undefined, date: string): boolean => {
    if (!eventId) return false;
    return remindersRef.current.some(r => r.eventId === eventId && r.date === date);
  }, [reminders]); // reminders 의존 → 리렌더 트리거용

  // ---- 알림 등록 ----
  const scheduleReminder = useCallback(async (
    event: Event,
    date: string,
  ): Promise<{ success: boolean; message: string }> => {
    const eventId = event.id;
    if (!eventId) {
      return { success: false, message: '이벤트 ID가 없습니다.' };
    }

    // Expo Go 환경 체크
    if (isExpoGo) {
      return {
        success: false,
        message: 'Expo Go에서는 예약 알림을 사용할 수 없습니다.\n앱 빌드 후 이용해주세요.',
      };
    }

    // ref로 최신 상태 읽기 (stale closure 방지)
    const current = remindersRef.current;

    if (current.some(r => r.eventId === eventId && r.date === date)) {
      return { success: false, message: '이미 알림이 등록되어 있습니다.' };
    }

    if (current.length >= MAX_REMINDERS) {
      return { success: false, message: `최대 ${MAX_REMINDERS}개까지 등록 가능합니다.` };
    }

    // 이벤트 시간 파싱
    const eventDateTime = parseEventDateTime(date, event.time);
    if (!eventDateTime) {
      return { success: false, message: '날짜 정보를 파싱할 수 없습니다.' };
    }

    const now = new Date();
    const eventMs = eventDateTime.getTime();

    // 이벤트가 이미 완전히 지남 (1시간 이상)
    if (eventMs < now.getTime() - 3600000) {
      return { success: false, message: '이미 지난 이벤트입니다.' };
    }

    // 알림 시간 결정: 1시간 전 → 당일 아침 9시 → 5초 후 즉시
    let triggerDate: Date;
    const oneHourBefore = new Date(eventMs - 3600000);

    if (oneHourBefore.getTime() > now.getTime()) {
      triggerDate = oneHourBefore;
    } else {
      const eventDate = parseDate(date);
      if (eventDate) {
        const morning = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), 9, 0, 0);
        if (morning.getTime() > now.getTime()) {
          triggerDate = morning;
        } else {
          // 아침 9시도 지남 → 5초 후 즉시 알림
          triggerDate = new Date(now.getTime() + 5000);
        }
      } else {
        triggerDate = new Date(now.getTime() + 5000);
      }
    }

    try {
      // 알림 권한 확인/요청
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
        if (newStatus !== 'granted') {
          return {
            success: false,
            message: '알림 권한을 허용해주세요.\n설정 > 앱 > 솔로파티에서 변경할 수 있습니다.',
          };
        }
      }

      // Android 채널 확인
      await ensureAndroidChannel();

      // 알림 예약
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '🎉 파티가 곧 시작돼요!',
          body: `${event.title}${event.time ? `\n⏰ ${event.time}` : ''}${event.location ? `\n📍 ${event.location}` : ''}`,
          data: { eventId, date, type: 'event_reminder' },
          sound: true,
          ...(Platform.OS === 'android' ? { channelId: 'event-reminders' } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });

      const newReminder: EventReminder = {
        eventId,
        eventTitle: event.title,
        date,
        time: event.time,
        location: event.location,
        notificationId,
        triggerAt: triggerDate.getTime(),
        createdAt: Date.now(),
      };

      const updated = [...current, newReminder];
      if (isMountedRef.current) {
        setReminders(updated);
        remindersRef.current = updated;
      }
      await saveReminders(updated);

      const timeStr = formatReminderTime(triggerDate);
      return { success: true, message: `${timeStr}에 알림이 울립니다!` };
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg.includes('not available') || msg.includes('not supported')) {
        return { success: false, message: '이 기기에서는 예약 알림을 지원하지 않습니다.' };
      }
      return { success: false, message: '알림 등록에 실패했습니다.\n다시 시도해주세요.' };
    }
  }, [saveReminders]); // reminders를 ref로 읽으므로 의존성 불필요

  // ---- 알림 취소 ----
  const cancelReminder = useCallback(async (
    eventId: string | undefined,
    date: string,
  ): Promise<boolean> => {
    if (!eventId) return false;

    const current = remindersRef.current;
    const reminder = current.find(r => r.eventId === eventId && r.date === date);
    if (!reminder) return false;

    // 알림 취소 (이미 발송된 경우 무시)
    if (!isExpoGo) {
      try {
        await Notifications.cancelScheduledNotificationAsync(reminder.notificationId);
      } catch {
        // 이미 발송/만료된 알림 → 무시
      }
    }

    const updated = current.filter(r => !(r.eventId === eventId && r.date === date));
    if (isMountedRef.current) {
      setReminders(updated);
      remindersRef.current = updated;
    }
    await saveReminders(updated);
    return true;
  }, [saveReminders]);

  return {
    reminders,
    isLoaded,
    hasReminder,
    scheduleReminder,
    cancelReminder,
  };
}
