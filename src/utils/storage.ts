import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventsByDate, Event } from '../types';
import { safeGetItem, safeSetItem, safeRemoveItem, safeMultiGet, safeMultiSet } from './asyncStorageManager';

// GitHub Gist Raw URL
const GIST_RAW_URL = 'https://gist.githubusercontent.com/baekchu/f805cac22604ff764916280710db490e/raw/gistfile1.txt';

const CACHE_KEY = '@events_cache';
const CACHE_TIMESTAMP_KEY = '@events_cache_timestamp';
const CACHE_DURATION = 180000; // 3분 캐시 (성능 최적화)
const FETCH_TIMEOUT = 10000; // 10초 타임아웃

// ==================== 간소화된 JSON 처리 ====================

// 간단한 JSON 정제 (필수 작업만)
const cleanJSON = (text: string): string => {
  return text
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // 제어 문자 제거
    .replace(/,\s*([}\]])/g, '$1') // 후행 콤마 제거
    .trim();
};

// 최적화된 fetch
const fetchData = async (url: string): Promise<EventsByDate> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  
  try {
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const text = await response.text();
    
    // 2단계 파싱만 (간소화)
    try {
      return JSON.parse(text);
    } catch {
      return JSON.parse(cleanJSON(text));
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// ==================== 데이터 검증 (간소화) ====================

const validateEvents = (data: any): data is EventsByDate => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  
  try {
    for (const [date, events] of Object.entries(data)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
      if (!Array.isArray(events)) return false;
      
      for (const event of events as any[]) {
        if (!event?.title || typeof event.title !== 'string') return false;
      }
    }
    return true;
  } catch {
    return false;
  }
};

// ==================== 데이터 정제 (간소화) ====================

const sanitizeEvent = (event: Event): Event => {
  const cleanString = (str: string | undefined, maxLen: number = 200): string | undefined => {
    if (!str) return undefined;
    return str
      .trim()
      .replace(/[<>]/g, '')
      .substring(0, maxLen);
  };

  const cleanUrl = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    const trimmed = url.trim();
    return /^(https?:|mailto:)/.test(trimmed) ? trimmed.substring(0, 500) : undefined;
  };

  return {
    id: event.id?.substring(0, 50),
    title: cleanString(event.title, 100) || '',
    time: cleanString(event.time, 50),
    description: cleanString(event.description, 200),
    location: cleanString(event.location, 100),
    region: cleanString(event.region, 50),
    link: cleanUrl(event.link),
    coordinates: event.coordinates,
  };
};

// ==================== 캐시 관리 (최적화) ====================

// AsyncStorage 초기화는 asyncStorageManager에서 처리

const loadFromCache = async (): Promise<EventsByDate | null> => {
  if (CACHE_DURATION <= 0) return null;
  
  try {
    const results = await safeMultiGet([CACHE_KEY, CACHE_TIMESTAMP_KEY]);
    const cached = results[0][1];
    const timestamp = results[1][1];
    
    if (!cached || !timestamp) return null;
    
    const age = Date.now() - parseInt(timestamp, 10);
    if (age < 0 || age >= CACHE_DURATION) return null;
    
    const events = JSON.parse(cached);
    return validateEvents(events) ? events : null;
  } catch {
    return null;
  }
};

const saveToCache = async (events: EventsByDate): Promise<void> => {
  try {
    if (!events || typeof events !== 'object') return;
    
    const jsonString = JSON.stringify(events);
    if (jsonString.length > 1024 * 1024) return; // 1MB 초과 방지
    
    await safeMultiSet([
      [CACHE_KEY, jsonString],
      [CACHE_TIMESTAMP_KEY, Date.now().toString()]
    ]);
  } catch {
    // 캐시 저장 실패는 무시
  }
};

// ==================== 공개 API ====================

export const loadEvents = async (forceRefresh: boolean = false): Promise<EventsByDate> => {
  // 캐시 먼저 확인
  if (!forceRefresh) {
    const cached = await loadFromCache();
    if (cached) {
      console.log('✅ 캐시 사용');
      return cached;
    }
  }
  
  try {
    console.log('🔄 데이터 로딩...');
    const url = `${GIST_RAW_URL}?_=${Date.now()}`;
    const rawData = await fetchData(url);
    
    if (!validateEvents(rawData)) {
      console.warn('⚠️ 데이터 검증 실패');
      throw new Error('Invalid data');
    }
    
    // 데이터 정제
    const processed: EventsByDate = {};
    for (const [date, eventList] of Object.entries(rawData)) {
      const sanitized = (eventList as Event[])
        .map((e, i) => sanitizeEvent({ ...e, id: e.id || `${date}-${i}` }))
        .filter(e => e.title);
      
      if (sanitized.length > 0) {
        processed[date] = sanitized;
      }
    }
    
    console.log('✅ 로딩 완료:', Object.keys(processed).length, '일');
    
    // 캐시 저장
    await saveToCache(processed);
    
    return processed;
  } catch (error) {
    console.warn('⚠️ 네트워크 오류, 캐시 복구 시도');
    
    // 캐시 복구 시도
    const cached = await loadFromCache();
    if (cached) {
      console.log('✅ 캐시 복구');
      return cached;
    }
    
    console.warn('❌ 빈 데이터 반환');
    return {};
  }
};

export const saveEvents = async (events: EventsByDate): Promise<void> => {
  if (!validateEvents(events)) {
    throw new Error('Invalid events');
  }
  
  const sanitized: EventsByDate = {};
  for (const [date, eventList] of Object.entries(events)) {
    sanitized[date] = eventList.map(sanitizeEvent);
  }
  
  await saveToCache(sanitized);
};

// 캐시 삭제 (디버깅용)
export const clearCache = async (): Promise<void> => {
  try {
    await safeRemoveItem(CACHE_KEY);
    await safeRemoveItem(CACHE_TIMESTAMP_KEY);
    console.log('🗑️ 캐시 삭제 완료');
  } catch {
    // 무시
  }
};
