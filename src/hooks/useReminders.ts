/**
 * 이벤트 리마인더 훅 (v3 - 모듈 레벨 공유 상태)
 * - expo-notifications 기반 로컬 알림 예약
 * - 모듈 레벨 공유 상태 → 모든 화면에서 즉시 동기화
 * - 저장 직렬화 (race condition 방지)
 * - Expo Go / 네이티브 빌드 양쪽 지원
 * - Android 채널 자동 설정
 * - 타임존 안전한 날짜 파싱
 * - v2→v3 자동 마이그레이션
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, AppStateStatus, Platform } from 'react-native';
import Constants from 'expo-constants';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';
import { Event } from '../types';

// ==================== 상수 ====================
const REMINDERS_KEY = '@event_reminders_v3';
const LEGACY_REMINDERS_KEY = '@event_reminders_v2';
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

async function ensureAndroidChannel(): Promise<boolean> {
  if (_channelReady || Platform.OS !== 'android' || isExpoGo) {
    _channelReady = true;
    return true;
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
    return true;
  } catch {
    return false;
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

// ==================== 모듈 레벨 공유 상태 ====================
let _reminders: EventReminder[] = [];
let _loaded = false;
let _loading = false;
let _loadRetryCount = 0;
let _loadPromise: Promise<void> | null = null;
const MAX_LOAD_RETRIES = 3;
const _listeners = new Set<(reminders: EventReminder[]) => void>();

// 저장 직렬화
let _isSaving = false;
let _pendingSave = false;
let _appStateSubscription: { remove: () => void } | null = null;

// ==================== AppState 백그라운드 저장 ====================
function _setupAppStateListener() {
  // Hot Reload 시 이전 리스너 정리 (누수 방지)
  if (_appStateSubscription) {
    _appStateSubscription.remove();
    _appStateSubscription = null;
  }
  _appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'background' || nextState === 'inactive') {
      // 앱이 백그라운드로 갈 때 즉시 저장
      _saveToStorage().catch(() => {});
    } else if (nextState === 'active' && _loaded) {
      // 포그라운드 복귀 시 저장소 검증
      _verifyStoredData().catch(() => {});
    }
  });
}

async function _verifyStoredData(): Promise<void> {
  try {
    const stored = await safeGetItem(REMINDERS_KEY);
    if (!stored && _reminders.length > 0) {
      await _saveToStorage();
    }
  } catch { /* 무시 */ }
}

function _notify() {
  _listeners.forEach(fn => fn([..._reminders]));
}

async function _loadFromStorage(): Promise<void> {
  if (_loadPromise) return _loadPromise;
  if (_loading) return;
  _loading = true;
  _loadPromise = _doLoadFromStorage();
  try {
    await _loadPromise;
  } finally {
    _loadPromise = null;
  }
}

async function _doLoadFromStorage(): Promise<void> {

  try {
    ensureNotificationHandler();
    if (!isExpoGo) {
      await ensureAndroidChannel();
    }

    let parsed: EventReminder[] | null = null;

    // 1. v3 키에서 로드
    try {
      const stored = await safeGetItem(REMINDERS_KEY);
      if (stored && stored.length < 200000) {
        const data = JSON.parse(stored);
        if (Array.isArray(data)) {
          parsed = data;
        }
      }
    } catch { /* 무시 */ }

    // 2. v3에 없으면 레거시 v2 키에서 마이그레이션
    if (!parsed || parsed.length === 0) {
      try {
        const legacyStored = await safeGetItem(LEGACY_REMINDERS_KEY);
        if (legacyStored && legacyStored.length < 200000) {
          const legacyData = JSON.parse(legacyStored);
          if (Array.isArray(legacyData) && legacyData.length > 0) {
            parsed = legacyData;
            // 마이그레이션 후 레거시 키 정리
            safeSetItem(LEGACY_REMINDERS_KEY, '[]').catch(() => {});
          }
        }
      } catch { /* 마이그레이션 실패 무시 */ }
    }

    if (!parsed) {
      if (_loadRetryCount < MAX_LOAD_RETRIES) {
        _loadRetryCount++;
        _loading = false;
        setTimeout(() => _loadFromStorage(), 500);
        return;
      }
      parsed = [];
    }

    // 만료된 리마인더 정리
    const now = Date.now();
    const valid: EventReminder[] = [];
    const expiredIds: string[] = [];

    for (const r of parsed) {
      if (!r?.eventId || !r?.date || !r?.notificationId) continue;

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

    // 만료된 알림 병렬 취소 (순차 await 대비 50-150ms 절약)
    if (!isExpoGo && expiredIds.length > 0) {
      await Promise.all(
        expiredIds.map(nid =>
          Notifications.cancelScheduledNotificationAsync(nid).catch(() => {})
        )
      );
    }

    _reminders = valid;
    _loaded = true;
    _loadRetryCount = 0;

    // 정리된 데이터 또는 마이그레이션 데이터 저장
    if (expiredIds.length > 0 || valid.length > 0) {
      _saveToStorage();
    }

    // AppState 리스너 설정 (최초 로드 완료 후)
    _setupAppStateListener();
  } catch {
    if (_loadRetryCount < MAX_LOAD_RETRIES) {
      _loadRetryCount++;
      _loading = false;
      setTimeout(() => _loadFromStorage(), 500);
      return;
    }
    _loaded = true;
  }

  _loading = false;
  _notify(); // 성공/실패 무관하게 항상 구독자 알림 (무한 로딩 방지)
}

async function _saveToStorage(): Promise<void> {
  if (_isSaving) {
    _pendingSave = true;
    return;
  }

  _isSaving = true;

  try {
    const snapshot = JSON.stringify(_reminders);
    const saved = await safeSetItem(REMINDERS_KEY, snapshot);

    // 저장 검증 (read-back)
    if (saved) {
      const verification = await safeGetItem(REMINDERS_KEY);
      if (!verification || verification.length !== snapshot.length) {
        await safeSetItem(REMINDERS_KEY, snapshot);
      }
    } else {
      await safeSetItem(REMINDERS_KEY, snapshot);
    }
  } catch {
    // 저장 실패 무시
  } finally {
    _isSaving = false;

    if (_pendingSave) {
      _pendingSave = false;
      _saveToStorage();
    }
  }
}

// ==================== 훅 ====================
export default function useReminders() {
  const [reminders, setReminders] = useState<EventReminder[]>([..._reminders]);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const listener = (updated: EventReminder[]) => {
      if (isMountedRef.current) {
        setReminders(updated);
      }
    };
    _listeners.add(listener);

    if (!_loaded && !_loading) {
      _loadFromStorage();
    } else if (_loaded) {
      setReminders([..._reminders]);
    }

    return () => {
      isMountedRef.current = false;
      _listeners.delete(listener);
      
      // 모든 인스턴스 언마운트 시 AppState 리스너 정리 (메모리 누수 방지)
      if (_listeners.size === 0 && _appStateSubscription) {
        _appStateSubscription.remove();
        _appStateSubscription = null;
      }
    };
  }, []);

  // ---- 리마인더 확인 ----
  const hasReminder = useCallback((eventId: string | undefined, date: string): boolean => {
    if (!eventId) return false;
    return _reminders.some(r => r.eventId === eventId && r.date === date);
  }, []); // 모듈 레벨 상태 직접 접근 → deps 불필요 (함수 재생성 방지)

  // ---- 알림 등록 ----
  const scheduleReminder = useCallback(async (
    event: Event,
    date: string,
  ): Promise<{ success: boolean; message: string }> => {
    const eventId = event.id;
    if (!eventId) {
      return { success: false, message: '이벤트 ID가 없습니다.' };
    }

    if (isExpoGo) {
      return {
        success: false,
        message: 'Expo Go에서는 예약 알림을 사용할 수 없습니다.\n앱 빌드 후 이용해주세요.',
      };
    }

    // 모듈 레벨 상태에서 읽기 (항상 최신)
    if (_reminders.some(r => r.eventId === eventId && r.date === date)) {
      return { success: false, message: '이미 알림이 등록되어 있습니다.' };
    }

    if (_reminders.length >= MAX_REMINDERS) {
      return { success: false, message: `최대 ${MAX_REMINDERS}개까지 등록 가능합니다.` };
    }

    const eventDateTime = parseEventDateTime(date, event.time);
    if (!eventDateTime) {
      return { success: false, message: '날짜 정보를 파싱할 수 없습니다.' };
    }

    const now = new Date();
    const eventMs = eventDateTime.getTime();

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
          triggerDate = new Date(now.getTime() + 5000);
        }
      } else {
        triggerDate = new Date(now.getTime() + 5000);
      }
    }

    try {
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

      await ensureAndroidChannel();

      // 보안: 알림 내용 RTL/LTR 방향 제어 문자 및 제로폭 문자 제거
      const sanitizeNotifText = (t: string | undefined, max: number) =>
        String(t || '')
          .replace(/[\u202A-\u202E\u2066-\u2069\u200E\u200F\u200B-\u200D\uFEFF]/g, '')
          .slice(0, max);
      const safeTitle = sanitizeNotifText(event.title, 100);
      const safeLocation = sanitizeNotifText(event.location, 100);

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '🎉 파티가 곧 시작돼요!',
          body: `${safeTitle}${event.time ? `\n⏰ ${event.time}` : ''}${safeLocation ? `\n📍 ${safeLocation}` : ''}`,
          data: { eventId, date, type: 'event_reminder' },
          sound: true,
          ...(Platform.OS === 'android' && _channelReady ? { channelId: 'event-reminders' } : {}),
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

      _reminders = [..._reminders, newReminder];
      _notify(); // 모든 인스턴스에 즉시 전파
      await _saveToStorage(); // 즉시 저장

      const timeStr = formatReminderTime(triggerDate);
      return { success: true, message: `${timeStr}에 알림이 울립니다!` };
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg.includes('not available') || msg.includes('not supported')) {
        return { success: false, message: '이 기기에서는 예약 알림을 지원하지 않습니다.' };
      }
      return { success: false, message: '알림 등록에 실패했습니다.\n다시 시도해주세요.' };
    }
  }, []);

  // ---- 알림 취소 ----
  const cancelReminder = useCallback(async (
    eventId: string | undefined,
    date: string,
  ): Promise<boolean> => {
    if (!eventId) return false;

    const reminder = _reminders.find(r => r.eventId === eventId && r.date === date);
    if (!reminder) return false;

    if (!isExpoGo) {
      try {
        await Notifications.cancelScheduledNotificationAsync(reminder.notificationId);
      } catch {
        // 이미 발송/만료된 알림 → 무시
      }
    }

    _reminders = _reminders.filter(r => !(r.eventId === eventId && r.date === date));
    _notify(); // 모든 인스턴스에 즉시 전파
    await _saveToStorage(); // 즉시 저장
    return true;
  }, []);

  return {
    reminders,
    isLoaded: _loaded,
    hasReminder,
    scheduleReminder,
    cancelReminder,
  };
}
