/**
 * 이벤트 찜/즐겨찾기 훅 (v3 - 안정성 강화)
 * - 모듈 레벨 공유 상태 → 모든 화면에서 즉시 동기화
 * - AsyncStorage + SecureStore 이중 저장 (데이터 손실 방지)
 * - 저장 직렬화 (race condition 방지)
 * - 자동 복구 시스템
 * - 타임존 안전 날짜 파싱
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';
import { secureLog } from '../utils/secureStorage';
import { Event } from '../types';

const BOOKMARKS_KEY = '@event_bookmarks_v3';
const BOOKMARKS_SECURE_KEY = 'sp_bookmarks_v3';
const LEGACY_KEYS = ['@event_bookmarks_v2', '@event_bookmarks_v1', '@event_bookmarks'];
const MAX_BOOKMARKS = 200;
const SAVE_DEBOUNCE_MS = 300;
const EXPIRY_DAYS = 90; // 만료 기간 (90일 — 너무 짧으면 재시작 시 데이터 사라짐)

interface BookmarkedEvent {
  event: Event;
  date: string;
  bookmarkedAt: number;
}

// ==================== 모듈 레벨 공유 상태 ====================
// 여러 화면에서 useBookmarks()를 호출해도 동일한 데이터를 공유
let _bookmarks: BookmarkedEvent[] = [];
let _loaded = false;
let _loading = false;
let _loadRetryCount = 0;
const MAX_LOAD_RETRIES = 3;
const _listeners = new Set<(bookmarks: BookmarkedEvent[]) => void>();

// 저장 직렬화를 위한 변수
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
let _isSaving = false;
let _pendingSave = false;
let _appStateSubscription: { remove: () => void } | null = null;

// ==================== AppState 백그라운드 저장 ====================
// 앱이 백그라운드로 갈 때 반드시 저장 완료 보장
function _setupAppStateListener() {
  // Hot Reload 시 이전 리스너 정리 (누수 방지)
  if (_appStateSubscription) {
    _appStateSubscription.remove();
    _appStateSubscription = null;
  }
  _appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'background' || nextState === 'inactive') {
      // 앱이 백그라운드로 갈 때 대기 중인 저장 즉시 실행
      if (_saveTimer) {
        clearTimeout(_saveTimer);
        _saveTimer = null;
      }
      _saveToStorage().catch(() => {});
    } else if (nextState === 'active' && _loaded) {
      // 포그라운드 복귀 시 데이터 검증 (다른 프로세스에서 변경됐을 수 있음)
      _verifyStoredData().catch(() => {});
    }
  });
}

// 저장된 데이터 검증 (포그라운드 복귀 시)
async function _verifyStoredData(): Promise<void> {
  try {
    const stored = await safeGetItem(BOOKMARKS_KEY);
    if (!stored && _bookmarks.length > 0) {
      // 저장소는 비었는데 메모리에는 데이터 있음 → 재저장
      secureLog.warn('⚠️ 찜 데이터 저장소 유실 감지, 재저장...');
      await _saveToStorage();
    }
  } catch {
    // 검증 실패는 무시
  }
}

function _notify() {
  _listeners.forEach(fn => fn([..._bookmarks]));
}

function parseLocalDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  const date = new Date(y, m, d);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * AsyncStorage + SecureStore 이중 로드 (가장 최신 데이터 사용)
 */
async function _loadFromStorage(): Promise<void> {
  if (_loading) return;
  _loading = true;

  try {
    let parsed: BookmarkedEvent[] | null = null;

    // 1. AsyncStorage에서 로드
    try {
      const stored = await safeGetItem(BOOKMARKS_KEY);
      if (stored && stored.length < 500000) {
        const data = JSON.parse(stored);
        if (Array.isArray(data)) {
          parsed = data;
        }
      }
    } catch {
      secureLog.warn('AsyncStorage 찜 로드 실패');
    }

    // 2. SecureStore에서 로드 (폴백/검증)
    try {
      const secureStored = await SecureStore.getItemAsync(BOOKMARKS_SECURE_KEY);
      if (secureStored) {
        const secureData = JSON.parse(secureStored);
        if (Array.isArray(secureData)) {
          // SecureStore는 축소 형태 {eventId, date, title}로 저장됨 → BookmarkedEvent로 변환
          const normalized: BookmarkedEvent[] = secureData
            .filter((b: any) => b && (b.event?.title || b.title) && b.date)
            .map((b: any) => {
              // 이미 전체 형태인 경우 유지
              if (b.event && typeof b.event === 'object') return b as BookmarkedEvent;
              // 축소 형태 {eventId, date, title} → 전체 형태로 변환
              return {
                event: { id: b.eventId || '', title: b.title || '', date: b.date } as Event,
                date: b.date,
                bookmarkedAt: b.bookmarkedAt || Date.now(),
              } as BookmarkedEvent;
            });

          // AsyncStorage에 데이터가 없고 SecureStore에만 있으면 복구로 사용
          if (!parsed || parsed.length === 0) {
            if (normalized.length > 0) {
              parsed = normalized;
              secureLog.info(`SecureStore에서 찜 복구: ${normalized.length}개`);
            }
          }
        }
      }
    } catch {
      // SecureStore 실패는 무시 (보조 저장소)
    }

    // 3. v3에 데이터 없으면 레거시 키에서 마이그레이션 시도
    if (!parsed || parsed.length === 0) {
      for (const legacyKey of LEGACY_KEYS) {
        try {
          const legacyStored = await safeGetItem(legacyKey);
          if (legacyStored && legacyStored.length < 500000) {
            const legacyData = JSON.parse(legacyStored);
            if (Array.isArray(legacyData) && legacyData.length > 0) {
              // 레거시 데이터 형식 호환: bookmarkedAt이 없으면 추가
              parsed = legacyData.map((b: any) => ({
                ...b,
                bookmarkedAt: b.bookmarkedAt || Date.now(),
              }));
              secureLog.info(`레거시 찜 마이그레이션 성공 (${legacyKey}): ${parsed!.length}개`);
              // 마이그레이션 후 레거시 키 정리 (비동기, 실패 무시)
              safeSetItem(legacyKey, '[]').catch(() => {});
              break; // 첫 번째 성공한 레거시에서 중단
            }
          }
        } catch {
          // 레거시 키 로드 실패 → 다음 키 시도
        }
      }
    }

    if (!parsed || parsed.length === 0) {
      if (!parsed) {
        // 모든 저장소 실패
        if (_loadRetryCount < MAX_LOAD_RETRIES) {
          _loadRetryCount++;
          _loading = false;
          setTimeout(() => _loadFromStorage(), 500);
          return;
        }
      }
      // 최대 재시도 초과 또는 실제로 빈 데이터 - 빈 배열로 시작
      parsed = parsed || [];
    }

    // 만료된 북마크 정리 (이벤트 날짜 + EXPIRY_DAYS일 지난 것)
    const now = Date.now();
    const expiryMs = EXPIRY_DAYS * 86400000;
    const valid = parsed.filter((b: BookmarkedEvent) => {
      // 필수 필드 검증만 (title, date)
      if (!b?.event?.title || !b?.date) return false;
      const eventDate = parseLocalDate(b.date);
      // 날짜 파싱 실패 시에도 보존 (삭제보다 보존이 안전)
      if (!eventDate) return true;
      eventDate.setHours(23, 59, 59, 999);
      return (eventDate.getTime() + expiryMs) > now;
    });

    _bookmarks = valid;
    _loaded = true;
    _loadRetryCount = 0;

    // 정리된 데이터 다시 저장 (만료 항목 제거 반영 또는 마이그레이션 데이터 저장)
    if (valid.length < (parsed?.length ?? 0) || valid.length > 0) {
      _debouncedSave();
    }

    // AppState 리스너 설정 (최초 로드 완료 후)
    _setupAppStateListener();
  } catch (e) {
    secureLog.warn('찜 로드 전체 실패');
    if (_loadRetryCount < MAX_LOAD_RETRIES) {
      _loadRetryCount++;
      _loading = false;
      setTimeout(() => _loadFromStorage(), 500);
      return;
    }
    _loaded = true; // 재시도 소진 후 빈 상태로 진행
  }

  _loading = false;
  _notify();
}

/**
 * 이중 저장 (AsyncStorage + SecureStore)
 * - 직렬화: 동시 저장 방지
 * - 저장 시점의 _bookmarks 스냅샷 사용
 * - 저장 후 검증 (read-back verification)
 */
async function _saveToStorage(): Promise<void> {
  if (_isSaving) {
    _pendingSave = true;
    return;
  }

  _isSaving = true;

  try {
    // 저장 시점에 스냅샷 캡처 (race condition 방지)
    const snapshot = JSON.stringify(_bookmarks);

    // 1) AsyncStorage 저장
    const asyncSaved = await safeSetItem(BOOKMARKS_KEY, snapshot);

    // 2) 저장 검증 — 실제로 기록됐는지 확인
    if (asyncSaved) {
      const verification = await safeGetItem(BOOKMARKS_KEY);
      if (!verification || verification.length !== snapshot.length) {
        secureLog.warn('⚠️ 찜 저장 검증 실패, 재시도...');
        await safeSetItem(BOOKMARKS_KEY, snapshot);
      }
    } else {
      // 첫 시도 실패 → 재시도
      secureLog.warn('찜 AsyncStorage 저장 실패, 재시도...');
      await safeSetItem(BOOKMARKS_KEY, snapshot);
    }

    // 3) SecureStore 백업 저장 (2KB 제한 대응 — 최신 10개만 축소 저장)
    try {
      const SECURE_MAX = 10;
      const essentialBookmarks = _bookmarks.slice(0, SECURE_MAX).map(b => ({
        eventId: b.event.id || '',
        date: b.date,
        title: (b.event.title || '').slice(0, 30),
      }));
      const secureSnapshot = JSON.stringify(essentialBookmarks);
      // SecureStore 2KB 제한 — 초과 시 건너뛰기
      if (secureSnapshot.length <= 2048) {
        SecureStore.setItemAsync(BOOKMARKS_SECURE_KEY, secureSnapshot).catch(() => {});
      }
    } catch {
      // SecureStore 백업 실패 무시 (AsyncStorage가 주 저장소)
    }
  } catch (e) {
    secureLog.warn('찜 저장 실패');
  } finally {
    _isSaving = false;

    // 대기 중인 저장이 있으면 실행
    if (_pendingSave) {
      _pendingSave = false;
      _saveToStorage();
    }
  }
}

/**
 * 디바운스된 저장 (빈번한 토글 시 마지막 상태만 저장)
 */
function _debouncedSave(): void {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
  }
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    _saveToStorage();
  }, SAVE_DEBOUNCE_MS);
}

/**
 * 즉시 저장 (토글 시 사용 - 디바운스 + 즉시 저장 보장)
 */
async function _immediateSave(): Promise<void> {
  // 디바운스 타이머가 있으면 취소
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  await _saveToStorage();
}

/**
 * 강제 리로드 (문제 발생 시)
 */
async function _forceReload(): Promise<void> {
  _loaded = false;
  _loading = false;
  _loadRetryCount = 0;
  await _loadFromStorage();
}

// ==================== 훅 ====================
export default function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<BookmarkedEvent[]>([..._bookmarks]);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    // 이 인스턴스를 구독자로 등록
    const listener = (updated: BookmarkedEvent[]) => {
      if (isMountedRef.current) {
        setBookmarks(updated);
      }
    };
    _listeners.add(listener);

    // 아직 로드 안 됐으면 로드
    if (!_loaded && !_loading) {
      _loadFromStorage();
    } else if (_loaded) {
      // 이미 로드됐으면 현재 상태로 동기화
      setBookmarks([..._bookmarks]);
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

  const isBookmarked = useCallback((eventId: string | undefined, date: string): boolean => {
    if (!eventId) return false;
    return _bookmarks.some(b => b.event.id === eventId && b.date === date);
  }, []); // 모듈 레벨 상태 사용 — deps 불필요 (→ 리렌더 최적화)

  const toggleBookmark = useCallback(async (event: Event, date: string): Promise<boolean> => {
    const eventId = event.id;
    if (!eventId) return false;

    const exists = _bookmarks.some(b => b.event.id === eventId && b.date === date);

    if (exists) {
      _bookmarks = _bookmarks.filter(b => !(b.event.id === eventId && b.date === date));
    } else {
      if (_bookmarks.length >= MAX_BOOKMARKS) {
        // 가장 오래된 것 제거
        _bookmarks = [..._bookmarks.slice(1), { event, date, bookmarkedAt: Date.now() }];
      } else {
        _bookmarks = [..._bookmarks, { event, date, bookmarkedAt: Date.now() }];
      }
    }

    _notify(); // 모든 인스턴스에 즉시 전파
    await _immediateSave(); // 즉시 저장 (데이터 손실 방지)
    return !exists; // true = 추가, false = 제거
  }, []);

  // 날짜순 정렬 (useMemo로 최적화 — 매 렌더마다 재정렬 방지)
  const sortedBookmarks = useMemo(() => 
    [...bookmarks].sort((a, b) => {
      const dateA = parseLocalDate(a.date)?.getTime() || 0;
      const dateB = parseLocalDate(b.date)?.getTime() || 0;
      return dateA - dateB;
    }), [bookmarks]);

  return {
    bookmarks: sortedBookmarks,
    isLoaded: _loaded,
    isBookmarked,
    toggleBookmark,
    bookmarkCount: bookmarks.length,
    forceReload: _forceReload,
  };
}
