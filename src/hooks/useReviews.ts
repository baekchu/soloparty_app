/**
 * 파티 후기 & 체크인 시스템 (v4)
 *
 * 3단계 검증 흐름:
 * 1. 참가 예약: 파티 상세에서 "참가 예약" 버튼 → 예약 기록 저장
 * 2. 체크인 (예약 필수):
 *    - 시간대 검증: 이벤트 시작 1시간 전 ~ 종료 후 1시간
 *    - GPS 검증: 좌표 있으면 500m 이내 필수
 *    - 하루 최대 3개 이벤트
 * 3. 후기 작성 (체크인 필수):
 *    - 이벤트당 1개, 별점(1~5) + 한줄평(최대 100자)
 *
 * 모듈 레벨 공유 → 여러 화면에서 동기화
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import * as Location from 'expo-location';
import { AppState, AppStateStatus } from 'react-native';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';
import { safeJSONParse } from '../utils/storage';
import { Event } from '../types';

// ==================== 상수 ====================
const RESERVATIONS_KEY = '@event_reservations_v1';
const CHECKINS_KEY = '@event_checkins_v3';
const REVIEWS_KEY = '@event_reviews_v2';
const MAX_RESERVATIONS = 100; // 최대 예약 보관 수 (30일 이내)
const MAX_REVIEWS = 200;
const CHECKIN_RADIUS_KM = 0.5; // GPS 체크인 반경 500m (기존 2km → 강화)
const CHECKIN_BEFORE_HOURS = 1; // 이벤트 시작 1시간 전 (기존 2시간 → 축소)
const CHECKIN_AFTER_HOURS = 1; // 이벤트 종료 1시간 후 (기존 3시간 → 축소)
const GPS_TIMEOUT_MS = 20000; // GPS 타임아웃 20초
const GPS_MAX_ACCURACY_M = 500; // GPS 정확도 허용 최대 500m (기존 5000m → 강화)
const MAX_DAILY_CHECKINS = 3; // 하루 최대 체크인 수

// ==================== 타입 ====================
export interface EventReservation {
  eventId: string;
  eventTitle: string;
  date: string;
  reservedAt: number;
}

export interface EventCheckIn {
  eventId: string;
  eventTitle: string;
  date: string;
  checkedInAt: number;
  location?: { latitude: number; longitude: number };
  verifiedBy: ('time' | 'gps')[]; // 어떤 검증을 통과했는지
}

export interface EventReview {
  eventId: string;
  eventTitle: string;
  date: string;
  rating: number; // 1-5
  comment: string;
  createdAt: number;
  organizer?: string; // 주최자명 (호스트 프로필 조회용)
}

// ==================== 유틸 ====================
function parseLocalDate(dateStr: string): Date | null {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const d = new Date(
    parseInt(parts[0], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[2], 10),
  );
  return isNaN(d.getTime()) ? null : d;
}

function parseEventTime(dateStr: string, timeStr?: string): { start: Date; end: Date } | null {
  const d = parseLocalDate(dateStr);
  if (!d) return null;

  if (!timeStr) {
    // 시간 미정: 당일 09:00 ~ 23:59 (기존 06:00 → 09:00으로 축소)
    const start = new Date(d);
    start.setHours(9, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  let hours = 18, minutes = 0;

  // "19:00", "19:30"
  const match24 = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (match24) {
    hours = parseInt(match24[1], 10);
    minutes = parseInt(match24[2], 10);
  } else {
    // "오후 7시 30분", "오전 11시", "7시"
    const matchKor = timeStr.match(/(?:(?:오전|오후)\s*)?(\d{1,2})시(?:\s*(\d{1,2})분)?/);
    if (matchKor) {
      hours = parseInt(matchKor[1], 10);
      if (timeStr.includes('오후') && hours < 12) hours += 12;
      if (timeStr.includes('오전') && hours === 12) hours = 0;
      minutes = matchKor[2] ? parseInt(matchKor[2], 10) : 0;
    }
  }

  const start = new Date(d);
  start.setHours(hours, minutes, 0, 0);
  const end = new Date(start.getTime() + 2 * 3600000); // 기본 2시간 이벤트
  return { start, end };
}

function getDistanceKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isToday(dateStr: string): boolean {
  const d = parseLocalDate(dateStr);
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function isPast(dateStr: string): boolean {
  const d = parseLocalDate(dateStr);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(23, 59, 59, 999);
  return d.getTime() < today.getTime();
}

// ==================== 모듈 레벨 공유 상태 ====================
let _reservations: EventReservation[] = [];
let _checkIns: EventCheckIn[] = [];
let _reviews: EventReview[] = [];
let _loaded = false;
let _loading = false;
let _reviewSubmitting = false; // submitReview 동시 실행 방지 mutex
let _checkInSubmitting = false; // doCheckIn 동시 실행 방지 mutex
const _listeners = new Set<() => void>();
let _appStateSubscription: { remove: () => void } | null = null;
let _cleanupScheduled = false; // cleanup 중복 실행 방지

function _setupAppStateListener() {
  // Hot Reload 시 이전 리스너 정리 (누수 방지)
  if (_appStateSubscription) {
    _appStateSubscription.remove();
    _appStateSubscription = null;
  }
  _appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'background' || nextState === 'inactive') {
      _saveReservations().catch(() => {});
      _saveCheckIns().catch(() => {});
      _saveReviews().catch(() => {});
    }
  });
}

// 모든 인스턴스가 unmount될 때 AppState listener 정리
function _cleanupAppStateListener() {
  if (_listeners.size === 0 && _appStateSubscription) {
    _appStateSubscription.remove();
    _appStateSubscription = null;
  }
}

function _notify() {
  _listeners.forEach(fn => fn());
}

async function _loadFromStorage(): Promise<void> {
  if (_loaded || _loading) return;
  _loading = true;
  try {
    // 예약 + 체크인 + 후기 병렬 로드 + v2 마이그레이션
    const [storedReservations, storedCheckIns, storedReviews, legacyCheckIns] = await Promise.all([
      safeGetItem(RESERVATIONS_KEY),
      safeGetItem(CHECKINS_KEY),
      safeGetItem(REVIEWS_KEY),
      safeGetItem('@event_checkins_v2'), // v2→v3 마이그레이션
    ]);

    // 예약 로드
    if (storedReservations && storedReservations.length < 200000) {
      try {
        const parsed = safeJSONParse<unknown[] | null>(storedReservations, null);
        if (Array.isArray(parsed)) {
          const cutoff = Date.now() - 30 * 86400000;
          _reservations = parsed.filter(
            (r: any) =>
              r?.eventId && typeof r.eventId === 'string' &&
              r?.date && typeof r.date === 'string' &&
              typeof r.reservedAt === 'number' && r.reservedAt > cutoff,
          );
          if (_reservations.length < parsed.length) {
            safeSetItem(RESERVATIONS_KEY, JSON.stringify(_reservations)).catch(() => {});
          }
        }
      } catch { /* 파싱 실패 */ }
    }

    // v3 데이터가 없으면 v2에서 마이그레이션
    const rawCheckIns = storedCheckIns || legacyCheckIns;

    if (rawCheckIns && rawCheckIns.length < 200000) {
      try {
        const parsed = safeJSONParse<unknown[] | null>(rawCheckIns, null);
        if (Array.isArray(parsed)) {
          const cutoff = Date.now() - 30 * 86400000;
          _checkIns = parsed.filter(
            (c: any) =>
              c?.eventId && typeof c.eventId === 'string' &&
              c?.date && typeof c.date === 'string' &&
              typeof c.checkedInAt === 'number' && c.checkedInAt > cutoff &&
              Array.isArray(c.verifiedBy),
          );
          if (_checkIns.length < parsed.length) {
            safeSetItem(CHECKINS_KEY, JSON.stringify(_checkIns)).catch(() => {});
          }
        }
      } catch { /* 파싱 실패 */ }
    }

    if (storedReviews && storedReviews.length < 500000) {
      try {
        const parsed = safeJSONParse<unknown[] | null>(storedReviews, null);
        if (Array.isArray(parsed)) {
          _reviews = parsed.filter(
            (r: any) =>
              r?.eventId && typeof r.eventId === 'string' &&
              r?.date && typeof r.date === 'string' &&
              typeof r.rating === 'number' && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5 &&
              typeof r.comment === 'string' &&
              typeof r.createdAt === 'number' && r.createdAt > 0,
          );
        }
      } catch { /* 파싱 실패 */ }
    }
  } catch { /* 스토리지 로드 실패 */ }
  _loaded = true;
  _loading = false;
  _setupAppStateListener();
  _notify();
}

/** EventDetailScreen 이동 전 데이터를 미리 로드 (CalendarScreen에서 호출) */
export function preWarmReviews(): void {
  if (!_loaded && !_loading) {
    _loadFromStorage().catch(() => {});
  }
}

async function _saveReservations(): Promise<void> {
  try { await safeSetItem(RESERVATIONS_KEY, JSON.stringify(_reservations)); } catch {}
}

async function _saveCheckIns(): Promise<void> {
  try { await safeSetItem(CHECKINS_KEY, JSON.stringify(_checkIns)); } catch {}
}

async function _saveReviews(): Promise<void> {
  try { await safeSetItem(REVIEWS_KEY, JSON.stringify(_reviews)); } catch {}
}

// ==================== 훅 ====================
export default function useReviews() {
  const [reservations, setReservations] = useState<EventReservation[]>([]);
  const [checkIns, setCheckIns] = useState<EventCheckIn[]>([]);
  const [reviews, setReviews] = useState<EventReview[]>([]);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const listener = () => {
      if (isMountedRef.current) {
        setReservations([..._reservations]);
        setCheckIns([..._checkIns]);
        setReviews([..._reviews]);
      }
    };
    _listeners.add(listener);

    if (!_loaded && !_loading) {
      _loadFromStorage();
    } else if (_loaded) {
      setReservations([..._reservations]);
      setCheckIns([..._checkIns]);
      setReviews([..._reviews]);
    }

    return () => {
      isMountedRef.current = false;
      _listeners.delete(listener);
      _cleanupAppStateListener(); // 마지막 인스턴스 unmount 시 정리
    };
  }, []);

  // ==================== 참가 예약 ====================

  /** 예약 가능 여부 (미래 이벤트 + 미예약) */
  const canReserve = useCallback((eventId: string | undefined, date: string): boolean => {
    if (!eventId) return false;
    if (isPast(date)) return false;
    return !_reservations.some(r => r.eventId === eventId && r.date === date);
  }, []);

  /** 예약 완료 여부 */
  const isReserved = useCallback((eventId: string | undefined, date: string): boolean => {
    if (!eventId) return false;
    return _reservations.some(r => r.eventId === eventId && r.date === date);
  }, []);

  /** 예약 실행 */
  const doReserve = useCallback(async (
    event: Event,
    date: string,
  ): Promise<{ success: boolean; message: string }> => {
    if (!event.id) {
      return { success: false, message: '이벤트 정보가 올바르지 않습니다.' };
    }
    if (!_loaded) {
      return { success: false, message: '데이터를 불러오는 중입니다.' };
    }
    if (_reservations.some(r => r.eventId === event.id && r.date === date)) {
      return { success: false, message: '이미 예약한 파티입니다.' };
    }
    if (isPast(date)) {
      return { success: false, message: '이미 지난 파티는 예약할 수 없습니다.' };
    }

    // 최대 초과 시 오래된 것 제거
    if (_reservations.length >= MAX_RESERVATIONS) {
      const sorted = [..._reservations].sort((a, b) => a.reservedAt - b.reservedAt);
      sorted.shift();
      _reservations = sorted;
    }

    const newReservation: EventReservation = {
      eventId: event.id,
      eventTitle: event.title,
      date,
      reservedAt: Date.now(),
    };

    _reservations = [..._reservations, newReservation];
    _notify();
    await _saveReservations();

    return {
      success: true,
      message: '참가 예약 완료! 🎉\n파티 당일에 체크인해주세요.',
    };
  }, []);

  /** 예약 취소 */
  const cancelReservation = useCallback(async (
    eventId: string | undefined,
    date: string,
  ): Promise<{ success: boolean; message: string }> => {
    if (!eventId) return { success: false, message: '이벤트 정보가 올바르지 않습니다.' };
    // 이미 체크인한 경우 취소 불가
    if (_checkIns.some(c => c.eventId === eventId && c.date === date)) {
      return { success: false, message: '이미 체크인한 파티는 예약을 취소할 수 없습니다.' };
    }
    _reservations = _reservations.filter(r => !(r.eventId === eventId && r.date === date));
    _notify();
    await _saveReservations();
    return { success: true, message: '예약이 취소되었습니다.' };
  }, []);

  // ==================== 체크인 ====================

  /** 체크인 가능 여부 (예약 필수 + 당일 + 미체크인) */
  const canCheckIn = useCallback((eventId: string | undefined, date: string): boolean => {
    if (!eventId) return false;
    if (_checkIns.some(c => c.eventId === eventId && c.date === date)) return false;
    if (!_reservations.some(r => r.eventId === eventId && r.date === date)) return false;
    return isToday(date);
  }, []);

  /** 체크인 완료 여부 */
  const isCheckedIn = useCallback((eventId: string | undefined, date: string): boolean => {
    if (!eventId) return false;
    return _checkIns.some(c => c.eventId === eventId && c.date === date);
  }, []);

  /** 체크인 실행 (시간대 + GPS 검증) */
  const doCheckIn = useCallback(async (
    event: Event,
    date: string,
  ): Promise<{ success: boolean; message: string }> => {
    // 동시 실행 방지 뮤텍스 (GPS 호출 중 중복 체크인 방지)
    if (_checkInSubmitting) {
      return { success: false, message: '처리 중입니다. 잠시 후 다시 시도해주세요.' };
    }
    _checkInSubmitting = true;
    try {
    if (!event.id) {
      return { success: false, message: '이벤트 정보가 올바르지 않습니다.' };
    }

    // 데이터 로드 전 체크인 방지
    if (!_loaded) {
      return { success: false, message: '데이터를 불러오는 중입니다. 잠시 후 다시 시도해주세요.' };
    }

    // 이미 체크인
    if (_checkIns.some(c => c.eventId === event.id && c.date === date)) {
      return { success: false, message: '이미 체크인했습니다.' };
    }

    // 예약 필수
    if (!_reservations.some(r => r.eventId === event.id && r.date === date)) {
      return { success: false, message: '참가 예약을 먼저 해주세요.\n예약 후 파티 당일에 체크인할 수 있습니다.' };
    }

    // 당일 확인
    if (!isToday(date)) {
      if (isPast(date)) {
        return { success: false, message: '이미 지난 이벤트는 체크인할 수 없습니다.' };
      }
      return { success: false, message: '파티 당일에만 체크인할 수 있습니다.' };
    }

    const verifiedBy: ('time' | 'gps')[] = [];
    const now = new Date();

    // ---- 일일 체크인 제한 ----
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayCheckInCount = _checkIns.filter(c => c.date === todayStr).length;
    if (todayCheckInCount >= MAX_DAILY_CHECKINS) {
      return {
        success: false,
        message: `하루 최대 ${MAX_DAILY_CHECKINS}개 파티까지 체크인할 수 있습니다.\n오늘 이미 ${todayCheckInCount}개 체크인했습니다.`,
      };
    }

    // ---- 시간대 검증 ----
    const eventTime = parseEventTime(date, event.time);
    if (eventTime) {
      const allowStart = new Date(eventTime.start.getTime() - CHECKIN_BEFORE_HOURS * 3600000);
      const allowEnd = new Date(eventTime.end.getTime() + CHECKIN_AFTER_HOURS * 3600000);

      if (now < allowStart) {
        const hoursUntil = Math.ceil((allowStart.getTime() - now.getTime()) / 3600000);
        return {
          success: false,
          message: `아직 체크인할 수 없습니다.\n파티 시작 ${CHECKIN_BEFORE_HOURS}시간 전부터 가능합니다.\n(약 ${hoursUntil}시간 후)`,
        };
      }
      if (now > allowEnd) {
        return { success: false, message: '체크인 시간이 지났습니다.' };
      }
      verifiedBy.push('time');
    }

    // ---- GPS 근접 검증 (좌표가 있는 이벤트: 필수) ----
    let userLocation: { latitude: number; longitude: number } | undefined;
    const hasCoordinates = !!(event.coordinates?.latitude && event.coordinates?.longitude);

    if (hasCoordinates) {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        let permGranted = status === 'granted';

        if (!permGranted) {
          const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
          permGranted = newStatus === 'granted';
        }

        if (!permGranted) {
          return {
            success: false,
            message: '이 파티는 위치 인증이 필요합니다.\n설정에서 위치 권한을 허용해주세요.',
          };
        }

        let gpsTimeoutId: ReturnType<typeof setTimeout>;
        const gpsTimeout = new Promise<never>((_, reject) => {
          gpsTimeoutId = setTimeout(() => reject(new Error('GPS timeout')), GPS_TIMEOUT_MS);
        });
        const loc = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced, // 500m 반경이므로 Balanced 정확도 필요
          }),
          gpsTimeout,
        ]) as Location.LocationObject;
        clearTimeout(gpsTimeoutId!);
          
        // GPS 정확도 검증
        const gpsAccuracy = loc.coords.accuracy ?? Infinity;
        if (gpsAccuracy > GPS_MAX_ACCURACY_M) {
          return {
            success: false,
            message: `GPS 정확도가 부족합니다.\n실외에서 다시 시도해주세요.\n(현재 정확도: ~${Math.round(gpsAccuracy)}m, 필요: ${GPS_MAX_ACCURACY_M}m 이내)`,
          };
        }

        userLocation = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };

        const dist = getDistanceKm(
          loc.coords.latitude, loc.coords.longitude,
          event.coordinates!.latitude, event.coordinates!.longitude,
        );

        if (dist > CHECKIN_RADIUS_KM) {
          return {
            success: false,
            message: `파티 장소 근처에서 체크인해주세요.\n현재 약 ${dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`} 떨어져 있습니다.\n(${Math.round(CHECKIN_RADIUS_KM * 1000)}m 이내 필요)`,
          };
        }
        verifiedBy.push('gps');
      } catch {
        return {
          success: false,
          message: '위치를 확인할 수 없습니다.\nGPS 신호가 잡히는 곳에서 다시 시도해주세요.',
        };
      }
    }

    // 최소 1가지 검증 통과 필요 (시간 또는 GPS)
    if (verifiedBy.length === 0) {
      return { success: false, message: '체크인 검증에 실패했습니다.\n파티 시간에 맞춰 다시 시도해주세요.' };
    }

    // 체크인 저장
    const newCheckIn: EventCheckIn = {
      eventId: event.id,
      eventTitle: event.title,
      date,
      checkedInAt: Date.now(),
      location: userLocation,
      verifiedBy,
    };

    _checkIns = [..._checkIns, newCheckIn];
    _notify();
    await _saveCheckIns();

    const verifyMsgs: string[] = [];
    if (verifiedBy.includes('gps')) verifyMsgs.push('📍 위치 인증');
    if (verifiedBy.includes('time')) verifyMsgs.push('⏰ 시간 인증');
    const remainToday = MAX_DAILY_CHECKINS - todayCheckInCount - 1;
    return {
      success: true,
      message: `체크인 완료! ${verifyMsgs.join(' + ')} 완료!\n오늘 남은 체크인: ${remainToday}회\n파티가 끝나면 후기를 남겨주세요 🎉`,
    };
    } finally {
      _checkInSubmitting = false;
    }
  }, []);

  // ==================== 후기 ====================

  /** 후기 작성 가능 여부 */
  const canWriteReview = useCallback((eventId: string | undefined, date: string): boolean => {
    if (!eventId) return false;
    if (!_checkIns.some(c => c.eventId === eventId && c.date === date)) return false;
    if (_reviews.some(r => r.eventId === eventId && r.date === date)) return false;
    return true;
  }, []);

  /** 후기 존재 여부 */
  const hasReview = useCallback((eventId: string | undefined, date: string): boolean => {
    if (!eventId) return false;
    return _reviews.some(r => r.eventId === eventId && r.date === date);
  }, []);

  /** 후기 가져오기 */
  const getReview = useCallback((eventId: string | undefined, date: string): EventReview | null => {
    if (!eventId) return null;
    return _reviews.find(r => r.eventId === eventId && r.date === date) ?? null;
  }, []);

  /** 후기 작성 */
  const submitReview = useCallback(async (
    event: Event,
    date: string,
    rating: number,
    comment: string,
  ): Promise<{ success: boolean; message: string }> => {
    // 동시 실행 방지 (MAX_REVIEWS 경계 이중 삭제 방지)
    if (_reviewSubmitting) {
      return { success: false, message: '처리 중입니다. 잠시 후 다시 시도해주세요.' };
    }
    _reviewSubmitting = true;
    
    try {
      if (!event.id) {
        return { success: false, message: '이벤트 정보가 올바르지 않습니다.' };
      }

      if (!_checkIns.some(c => c.eventId === event.id && c.date === date)) {
        return { success: false, message: '체크인을 먼저 해주세요.\n파티 당일에 체크인할 수 있습니다.' };
      }

      if (_reviews.some(r => r.eventId === event.id && r.date === date)) {
        return { success: false, message: '이미 후기를 작성했습니다.' };
      }

      // 별점 검증 강화 (NaN, Infinity, 소수점, 범위 체크)
      const safeRating = Number(rating);
      if (!Number.isFinite(safeRating) || safeRating < 1 || safeRating > 5 || !Number.isInteger(safeRating)) {
        return { success: false, message: '별점은 1~5 사이 정수여야 합니다.' };
      }
      // XSS/인젝션 방지: HTML 태그 + 제어문자 + 제로폭 문자 + RTL/LTR 방향 제어 문자 제거
      const trimmedComment = comment
        .replace(/<[^>]*>/g, '')           // HTML 태그 제거
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // 제어 문자 제거
        .replace(/[\u200B-\u200D\uFEFF]/g, '')  // 제로폭 문자 제거
        .replace(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g, '') // RTL/LTR 방향 제어 문자 제거
        .trim()
        .slice(0, 100);
      if (trimmedComment.length === 0) {
        return { success: false, message: '한줄평을 입력해주세요.' };
      }

      // 최대 초과 시 가장 오래된 제거
      if (_reviews.length >= MAX_REVIEWS) {
        const sorted = [..._reviews].sort((a, b) => a.createdAt - b.createdAt);
        sorted.shift();
        _reviews = sorted;
      }

      const newReview: EventReview = {
        eventId: event.id,
        eventTitle: event.title,
        date,
        rating: safeRating,
        comment: trimmedComment,
        createdAt: Date.now(),
        organizer: event.organizer?.trim().slice(0, 50) || undefined,
      };

      _reviews = [..._reviews, newReview];
      _notify();
      await _saveReviews();

      return { success: true, message: '후기가 등록되었습니다! 감사합니다 ✨' };
    } finally {
      _reviewSubmitting = false;
    }
  }, []);

  /** 모든 후기 (최신순) — useMemo로 불필요한 재정렬 방지 */
  const allReviewsSorted = useMemo(() => 
    [..._reviews].sort((a, b) => b.createdAt - a.createdAt),
    [reviews] // reviews state 변경 시에만 재정렬
  );
  const getAllReviews = useCallback((): EventReview[] => allReviewsSorted, [allReviewsSorted]);

  /** 주최자별 후기 조회 (호스트 프로필용) — 결과 캐시 */
  const _organizerCacheRef = useRef(new Map<string, EventReview[]>());
  const _reviewsVersionRef = useRef(0);
  useEffect(() => {
    _reviewsVersionRef.current++;
    _organizerCacheRef.current.clear();
  }, [allReviewsSorted]);
  const getReviewsByOrganizer = useCallback((organizer: string): EventReview[] => {
    if (!organizer) return [];
    const normalized = organizer.trim().toLowerCase();
    const cached = _organizerCacheRef.current.get(normalized);
    if (cached) return cached;
    const result = allReviewsSorted.filter(
      r => r.organizer?.trim().toLowerCase() === normalized
    );
    _organizerCacheRef.current.set(normalized, result);
    return result;
  }, [allReviewsSorted]);

  return {
    reservations,
    checkIns,
    reviews,
    isLoaded: _loaded,
    isLoading: _loading,
    canReserve,
    isReserved,
    doReserve,
    cancelReservation,
    canCheckIn,
    isCheckedIn,
    doCheckIn,
    canWriteReview,
    hasReview,
    getReview,
    submitReview,
    getAllReviews,
    getReviewsByOrganizer,
  };
}
