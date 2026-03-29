/**
 * 파티 후기 & 체크인 시스템 (v2)
 *
 * 체크인 검증 흐름:
 * 1. 시간대 검증: 이벤트 시작 2시간 전 ~ 종료 후 3시간까지만 체크인 가능
 *    (시간 미정이면 당일 06:00~23:59)
 * 2. GPS 근접 검증: 이벤트에 좌표가 있으면 반경 2km 이내에서만 체크인
 *    (좌표 없으면 시간대 검증만)
 * 3. 1회 제한: 이미 체크인한 이벤트는 재체크인 불가
 *
 * 후기 작성 조건:
 * - 체크인 완료된 이벤트만 작성 가능
 * - 이벤트당 후기 1개만
 * - 별점(1~5) + 한줄평(최대 100자)
 *
 * 모듈 레벨 공유 → 여러 화면에서 동기화
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import * as Location from 'expo-location';
import { AppState, AppStateStatus } from 'react-native';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';
import { Event } from '../types';

// ==================== 상수 ====================
const CHECKINS_KEY = '@event_checkins_v2';
const REVIEWS_KEY = '@event_reviews_v2';
const MAX_REVIEWS = 200;
const CHECKIN_RADIUS_KM = 2; // GPS 체크인 반경 (km)
const CHECKIN_BEFORE_HOURS = 2; // 이벤트 시작 전 허용 시간
const CHECKIN_AFTER_HOURS = 3; // 이벤트 종료 후 허용 시간
const GPS_TIMEOUT_MS = 30000; // GPS 타임아웃 30초 (실내 대응)

// ==================== 타입 ====================
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
    // 시간 미정: 당일 06:00 ~ 23:59
    const start = new Date(d);
    start.setHours(6, 0, 0, 0);
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
      _saveCheckIns().catch(() => {});
      _saveReviews().catch(() => {});
    }
  });
}

// 모든 인스턴스가 unmount될 때 AppState listener 정리
function _cleanupAppStateListener() {
  if (_cleanupScheduled) return;
  _cleanupScheduled = true;
  // 약간의 지연 후 리스너 수 확인 (마지막 인스턴스인지)
  setTimeout(() => {
    if (_listeners.size === 0 && _appStateSubscription) {
      _appStateSubscription.remove();
      _appStateSubscription = null;
    }
    _cleanupScheduled = false;
  }, 100);
}

function _notify() {
  _listeners.forEach(fn => fn());
}

async function _loadFromStorage(): Promise<void> {
  if (_loaded || _loading) return;
  _loading = true;
  try {
    // 체크인 + 후기 병렬 로드 (순차 2회 → 동시 1회)
    const [storedCheckIns, storedReviews] = await Promise.all([
      safeGetItem(CHECKINS_KEY),
      safeGetItem(REVIEWS_KEY),
    ]);

    if (storedCheckIns && storedCheckIns.length < 200000) {
      try {
        const parsed = JSON.parse(storedCheckIns);
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
        const parsed = JSON.parse(storedReviews);
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
  } catch { /* 전체 로드 실패 */ }
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

async function _saveCheckIns(): Promise<void> {
  try { await safeSetItem(CHECKINS_KEY, JSON.stringify(_checkIns)); } catch {}
}

async function _saveReviews(): Promise<void> {
  try { await safeSetItem(REVIEWS_KEY, JSON.stringify(_reviews)); } catch {}
}

// ==================== 훅 ====================
export default function useReviews() {
  const [checkIns, setCheckIns] = useState<EventCheckIn[]>([]);
  const [reviews, setReviews] = useState<EventReview[]>([]);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const listener = () => {
      if (isMountedRef.current) {
        setCheckIns([..._checkIns]);
        setReviews([..._reviews]);
      }
    };
    _listeners.add(listener);

    if (!_loaded && !_loading) {
      _loadFromStorage();
    } else if (_loaded) {
      setCheckIns([..._checkIns]);
      setReviews([..._reviews]);
    }

    return () => {
      isMountedRef.current = false;
      _listeners.delete(listener);
      _cleanupAppStateListener(); // 마지막 인스턴스 unmount 시 정리
    };
  }, []);

  // ==================== 체크인 ====================

  /** 체크인 가능 여부 (버튼 표시용) */
  const canCheckIn = useCallback((eventId: string | undefined, date: string): boolean => {
    if (!eventId) return false;
    if (_checkIns.some(c => c.eventId === eventId && c.date === date)) return false;
    // 당일만 (시간대 검증은 실제 체크인 시 수행)
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

    // 당일 확인
    if (!isToday(date)) {
      if (isPast(date)) {
        return { success: false, message: '이미 지난 이벤트는 체크인할 수 없습니다.' };
      }
      return { success: false, message: '파티 당일에만 체크인할 수 있습니다.' };
    }

    const verifiedBy: ('time' | 'gps')[] = [];
    const now = new Date();

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

    // ---- GPS 근접 검증 (좌표가 있는 이벤트만) ----
    let userLocation: { latitude: number; longitude: number } | undefined;

    if (event.coordinates?.latitude && event.coordinates?.longitude) {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        let permGranted = status === 'granted';

        if (!permGranted) {
          const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
          permGranted = newStatus === 'granted';
        }

        if (permGranted) {
          const gpsTimeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('GPS timeout')), GPS_TIMEOUT_MS)
          );
          const loc = await Promise.race([
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Low, // 2km 반경이므로 LOW면 충분 (배터리 절약)
            }),
            gpsTimeout,
          ]) as Location.LocationObject;
          
          // GPS 정확도 검증 (accuracy가 5000m 이상이면 신뢰할 수 없음)
          const gpsAccuracy = loc.coords.accuracy ?? Infinity;
          if (gpsAccuracy > 5000) {
            // 정확도가 너무 낮으면 GPS 검증 건너뛰고 시간대 검증만으로 진행
          } else {
            userLocation = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };

            const dist = getDistanceKm(
              loc.coords.latitude, loc.coords.longitude,
              event.coordinates.latitude, event.coordinates.longitude,
            );

            if (dist > CHECKIN_RADIUS_KM) {
              return {
                success: false,
                message: `파티 장소 근처에서 체크인해주세요.\n현재 약 ${dist.toFixed(1)}km 떨어져 있습니다.\n(${CHECKIN_RADIUS_KM}km 이내 필요)`,
              };
            }
            verifiedBy.push('gps');
          }
        }
        // 위치 권한 거부 시 시간대 검증만으로 진행
      } catch {
        // GPS 오류 시 시간대 검증만으로 진행
      }
    }

    // 최소 1가지 검증 통과 필요
    if (verifiedBy.length === 0 && eventTime) {
      // parseEventTime은 성공했는데 verifiedBy에 'time'이 없을 수 없음
      // 방어 코드
      verifiedBy.push('time');
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

    const verifyMsg = verifiedBy.includes('gps')
      ? '📍 위치 인증 완료!'
      : '⏰ 시간대 인증 완료!';
    return {
      success: true,
      message: `체크인 완료! ${verifyMsg}\n파티가 끝나면 후기를 남겨주세요 🎉`,
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
      // XSS/인젝션 방지: HTML 태그 + 제어문자 + 제로폭 문자 제거
      const trimmedComment = comment
        .replace(/<[^>]*>/g, '')           // HTML 태그 제거
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // 제어 문자 제거
        .replace(/[\u200B-\u200D\uFEFF]/g, '')  // 제로폭 문자 제거
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

  /** 주최자별 후기 조회 (호스트 프로필용) */
  const getReviewsByOrganizer = useCallback((organizer: string): EventReview[] => {
    if (!organizer) return [];
    const normalized = organizer.trim().toLowerCase();
    return allReviewsSorted.filter(
      r => r.organizer?.trim().toLowerCase() === normalized
    );
  }, [allReviewsSorted]);

  return {
    checkIns,
    reviews,
    isLoaded: _loaded,
    isLoading: _loading,
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
