/**
 * 이벤트 찜/즐겨찾기 훅 (v2)
 * - 모듈 레벨 공유 상태 → 모든 화면에서 즉시 동기화
 * - AsyncStorage 기반 영구 저장
 * - 타임존 안전 날짜 파싱
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';
import { Event } from '../types';

const BOOKMARKS_KEY = '@event_bookmarks_v2';
const MAX_BOOKMARKS = 200;

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
const _listeners = new Set<(bookmarks: BookmarkedEvent[]) => void>();

function _notify() {
  _listeners.forEach(fn => fn([..._bookmarks]));
}

function parseLocalDate(dateStr: string): Date | null {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  return isNaN(d.getTime()) ? null : d;
}

async function _loadFromStorage(): Promise<void> {
  if (_loaded || _loading) return;
  _loading = true;
  try {
    const stored = await safeGetItem(BOOKMARKS_KEY);
    if (stored && stored.length < 500000) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const now = Date.now();
          const sevenDaysMs = 7 * 86400000;
          const valid = parsed.filter((b: BookmarkedEvent) => {
            if (!b?.event?.title || !b?.date) return false;
            const eventDate = parseLocalDate(b.date);
            if (!eventDate) return false;
            eventDate.setHours(23, 59, 59, 999);
            return (eventDate.getTime() + sevenDaysMs) > now;
          });
          _bookmarks = valid;
          if (valid.length < parsed.length) {
            await safeSetItem(BOOKMARKS_KEY, JSON.stringify(valid));
          }
        }
      } catch { /* 파싱 실패 */ }
    }
  } catch { /* 로드 실패 */ }
  _loaded = true;
  _loading = false;
  _notify();
}

async function _saveToStorage(): Promise<void> {
  try {
    await safeSetItem(BOOKMARKS_KEY, JSON.stringify(_bookmarks));
  } catch { /* 저장 실패 무시 */ }
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
    };
  }, []);

  const isBookmarked = useCallback((eventId: string | undefined, date: string): boolean => {
    if (!eventId) return false;
    return _bookmarks.some(b => b.event.id === eventId && b.date === date);
  }, [bookmarks]); // bookmarks 의존 → 리렌더 트리거용

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
    await _saveToStorage();
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
  };
}
