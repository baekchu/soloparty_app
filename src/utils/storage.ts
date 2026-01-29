import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventsByDate, Event } from '../types';
import { safeGetItem, safeSetItem, safeRemoveItem, safeMultiGet, safeMultiSet } from './asyncStorageManager';
import { secureLog } from './secureStorage';
import { env } from '../config/env';

// 환경 변수에서 Gist URL 로드 (보안 강화)
const GIST_RAW_URL = env.GIST_RAW_URL;

const CACHE_KEY = '@events_cache';
const CACHE_TIMESTAMP_KEY = '@events_cache_timestamp';
const CACHE_DURATION = 180000; // 3분 캐시 (성능 최적화)
const FETCH_TIMEOUT = 10000; // 10초 타임아웃
const MAX_JSON_SIZE = 5 * 1024 * 1024; // 5MB 최대 JSON 크기 (DoS 방지)

// ==================== 보안 강화 JSON 처리 ====================

/**
 * 안전한 JSON 파싱 (보안 강화)
 * - 크기 제한으로 DoS 공격 방지
 * - 에러 처리로 앱 크래시 방지
 */
const safeJSONParse = <T>(text: string, fallback: T): T => {
  try {
    if (!text || typeof text !== 'string') return fallback;
    if (text.length > MAX_JSON_SIZE) {
      secureLog.warn('⚠️ JSON 크기 초과');
      return fallback;
    }
    
    // 빈 문자열이나 공백만 있는 경우
    if (text.trim().length === 0) return fallback;
    
    return JSON.parse(text) as T;
  } catch (error) {
    secureLog.warn('⚠️ JSON 파싱 실패');
    return fallback;
  }
};

// 간단한 JSON 정제 (필수 작업만)
const cleanJSON = (text: string): string => {
  if (!text || typeof text !== 'string') return '{}';
  return text
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // 제어 문자 제거
    .replace(/,\s*([}\]])/g, '$1') // 후행 콤마 제거
    .trim();
};

// 최적화된 fetch (에러 처리 개선)
const fetchData = async (url: string): Promise<EventsByDate> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  
  try {
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const text = await response.text();
    
    // 보안: 응답 크기 검증
    if (text.length > MAX_JSON_SIZE) {
      secureLog.warn('⚠️ 응답 크기 초과');
      throw new Error('Response too large');
    }
    
    // 2단계 파싱만 (간소화) - 안전한 파싱 사용
    const parsed = safeJSONParse<EventsByDate>(text, {});
    if (Object.keys(parsed).length > 0) {
      return parsed;
    }
    // 정제 후 재시도
    return safeJSONParse<EventsByDate>(cleanJSON(text), {});
  } catch (error: any) {
    if (error.name === 'AbortError') {
      secureLog.warn('⚠️ 네트워크 타임아웃');
    } else {
      secureLog.warn('⚠️ 네트워크 오류');
    }
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

// 지역명 정규화 ("서울시" → "서울", "남양주시" → "남양주" 등)
const normalizeRegion = (region: string | undefined): string | undefined => {
  if (!region) return undefined;
  
  let normalized = region.trim();
  
  // 순서 중요: 긴 패턴부터 먼저 제거
  // "특별시", "광역시" 제거 (예: 부산광역시 → 부산, 서울특별시 → 서울)
  normalized = normalized.replace(/(특별|광역)시$/, '');
  
  // "시" 접미사 제거 (예: 남양주시 → 남양주, 천안시 → 천안)
  normalized = normalized.replace(/시$/, '');
  
  // "도" 접미사 제거 (예: 경기도 → 경기)
  normalized = normalized.replace(/도$/, '');
  
  return normalized.trim() || undefined;
};


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
  
  const cleanNumber = (num: unknown): number | undefined => {
    if (typeof num !== 'number' || isNaN(num)) return undefined;
    return Math.max(0, Math.floor(num));
  };
  
  const cleanTags = (tags: unknown): string[] | undefined => {
    if (!Array.isArray(tags)) return undefined;
    return tags
      .filter((t): t is string => typeof t === 'string')
      .map(t => t.trim().replace(/[<>]/g, '').substring(0, 30))
      .filter(t => t.length > 0)
      .slice(0, 10);
  };

  return {
    id: event.id?.substring(0, 50),
    title: cleanString(event.title, 100) || '',
    time: cleanString(event.time, 50),
    description: cleanString(event.description, 200),
    detailDescription: cleanString(event.detailDescription, 2000), // 상세 설명
    location: cleanString(event.location, 100),
    venue: cleanString(event.venue, 100), // 장소명
    address: cleanString(event.address, 200), // 상세 주소
    region: normalizeRegion(cleanString(event.region, 50)),
    link: cleanUrl(event.link),
    coordinates: event.coordinates,
    // 참석자 정보
    maleCapacity: cleanNumber(event.maleCapacity),
    femaleCapacity: cleanNumber(event.femaleCapacity),
    maleCount: cleanNumber(event.maleCount),
    femaleCount: cleanNumber(event.femaleCount),
    // 추가 정보
    price: cleanNumber(event.price),
    ageRange: cleanString(event.ageRange, 20),
    organizer: cleanString(event.organizer, 100),
    contact: cleanString(event.contact, 100),
    tags: cleanTags(event.tags),
  };
};

// ==================== 캐시 관리 (최적화) ====================

// AsyncStorage 초기화는 asyncStorageManager에서 처리

const loadFromCache = async (): Promise<EventsByDate | null> => {
  // 캠시 비활성화 시 바로 반환
  if (CACHE_DURATION <= 0) return null;
  
  try {
    const results = await safeMultiGet([CACHE_KEY, CACHE_TIMESTAMP_KEY]);
    const cached = results[0][1];
    const timestamp = results[1][1];
    
    if (!cached || !timestamp) return null;
    
    const timestampNum = parseInt(timestamp, 10);
    if (isNaN(timestampNum) || timestampNum <= 0) return null;
    
    const age = Date.now() - timestampNum;
    // 음수나 만료된 캠시 거부
    if (age < 0 || age >= CACHE_DURATION) {
      secureLog.info('⌛ 캀시 만료');
      return null;
    }
    
    const events = safeJSONParse<EventsByDate>(cached, {});
    if (!validateEvents(events)) {
      secureLog.warn('⚠️ 캀시 데이터 검증 실패');
      return null;
    }
    
    return events;
  } catch (error) {
    secureLog.warn('⚠️ 캀시 로드 실패:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
};

const saveToCache = async (events: EventsByDate): Promise<void> => {
  try {
    if (!events || typeof events !== 'object' || Object.keys(events).length === 0) {
      secureLog.warn('⚠️ 빈 데이터는 캀시하지 않음');
      return;
    }
    
    const jsonString = JSON.stringify(events);
    const sizeInBytes = new Blob([jsonString]).size;
    
    // 1MB 초과 방지
    if (sizeInBytes > 1024 * 1024) {
      secureLog.warn('⚠️ 캀시 데이터 크기 초과, 저장 스킵');
      return;
    }
    
    await safeMultiSet([
      [CACHE_KEY, jsonString],
      [CACHE_TIMESTAMP_KEY, Date.now().toString()]
    ]);
    
    secureLog.info('✅ 캀시 저장 완료');
  } catch (error) {
    // 캠시 저장 실패는 치명적이지 않음
    secureLog.warn('⚠️ 캀시 저장 실패');
  }
};

// ==================== 공개 API ====================

export const loadEvents = async (forceRefresh: boolean = false): Promise<EventsByDate> => {
  // 캐시 먼저 확인
  if (!forceRefresh) {
    const cached = await loadFromCache();
    if (cached) {
      secureLog.info('✅ 캐시 사용');
      return cached;
    }
  }
  
  try {
    secureLog.info('🔄 데이터 로딩...');
    const url = `${GIST_RAW_URL}?_=${Date.now()}`;
    const rawData = await fetchData(url);
    
    if (!validateEvents(rawData)) {
      secureLog.warn('⚠️ 데이터 검증 실패');
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
    
    secureLog.info('✅ 로딩 완료');
    
    // 캠시 저장
    await saveToCache(processed);
    
    return processed;
  } catch (error) {
    secureLog.warn('⚠️ 네트워크 오류, 캀시 복구 시도');
    
    // 캐시 복구 시도
    const cached = await loadFromCache();
    if (cached) {
      secureLog.info('✅ 캐시 복구');
      return cached;
    }
    
    secureLog.warn('❌ 빈 데이터 반환');
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
    secureLog.info('🗑️ 캐시 삭제 완료');
  } catch {
    // 무시
  }
};
