import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventsByDate, Event } from '../types';

// GitHub Gist Raw URL
const GIST_RAW_URL = 'https://gist.githubusercontent.com/baekchu/f805cac22604ff764916280710db490e/raw/gistfile1.txt';

const CACHE_KEY = '@events_cache';
const CACHE_TIMESTAMP_KEY = '@events_cache_timestamp';
const CACHE_DURATION = 300000; // 5분 캐시 (안정성과 성능 균형)
const FETCH_TIMEOUT = 15000; // 15초 타임아웃 (네트워크 안정성)

// JSON 복구: 잘못된 이스케이프 시퀀스 및 제어 문자 처리
const repairJSON = (text: string): string => {
  // 1. 모든 제어 문자 제거 (0x00-0x1F)
  text = text.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ');
  
  // 2. 개행, 탭, 캐리지 리턴 정제
  text = text.replace(/\r\n/g, ' ').replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ');
  
  // 3. 여러 공백을 하나로
  text = text.replace(/\s+/g, ' ');
  
  // 4. 속성 값 직후의 잘못된 따옴표 제거: "값""  -> "값"
  text = text.replace(/""\s*,/g, '",');
  text = text.replace(/""\s*}/g, '"}');
  text = text.replace(/"\s*"\s*,/g, '",');
  text = text.replace(/"\s*"\s*}/g, '"}');
  
  // 5. 콜론 뒤 공백 정규화: "key" : "value" -> "key":"value"
  text = text.replace(/"\s*:\s*/g, '":"');
  text = text.replace(/:\s*"/g, ':"');
  text = text.replace(/"\s*,/g, '",');
  
  // 6. 배열/객체 정리
  text = text.replace(/,\s*}/g, '}');
  text = text.replace(/,\s*]/g, ']');
  text = text.replace(/{\s+/g, '{');
  text = text.replace(/\s+}/g, '}');
  text = text.replace(/\[\s+/g, '[');
  text = text.replace(/\s+]/g, ']');
  
  return text;
};

// 간단한 fetch (CORS 문제 방지)
const simpleFetch = async (url: string): Promise<any> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    
    // JSON 복구 후 파싱 (최대 4회 시도)
    let data: any;
    try {
      const repairedText = repairJSON(text);
      data = JSON.parse(repairedText);
    } catch (parseError: any) {
      try {
        // 2차: 더 공격적인 정제
        let aggressiveText = text
          .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // 제어 문자 완전 제거
          .replace(/\r\n|\n|\r/g, '') // 개행 완전 제거
          .replace(/\t/g, '') // 탭 완전 제거
          .replace(/""\s*,/g, '",') // 이중 따옴표 수정
          .replace(/""\s*}/g, '"}')
          .replace(/,\s*([}\]])/g, '$1'); // 마지막 콤마 제거
        data = JSON.parse(aggressiveText);
      } catch (secondError: any) {
        try {
          // 3차: 속성별 복구
          let manualText = text
            .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
            .replace(/:\s*\n\s*/g, ':') // 콜론 뒤 개행 제거
            .replace(/,\s*\n\s*/g, ',') // 콤마 뒤 개행 제거
            .replace(/"\s*\n\s*"/g, '","') // 따옴표 사이 개행 제거
            .replace(/"([^"]*?)""\s*([,}])/g, '"$1"$2') // 이중 따옴표 직전 수정
            .replace(/,\s*([}\]])/g, '$1');
          data = JSON.parse(manualText);
        } catch (thirdError: any) {
          // 4차: JSON 구조만 추출
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            let finalText = jsonMatch[0]
              .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
              .replace(/"\s*"\s*([,}])/g, '"$1')
              .replace(/,\s*\}/g, '}')
              .replace(/,\s*\]/g, ']');
            data = JSON.parse(finalText);
          } else {
            throw parseError;
          }
        }
      }
    }
    
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// 데이터 검증 (강화된 버전)
const validateEvents = (data: any): data is EventsByDate => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  
  // 최대 100개 날짜만 허용 (정합성 검사)
  const entries = Object.entries(data);
  if (entries.length > 100) {
    return false;
  }
  
  for (const [date, events] of entries) {
    // 날짜 형식 검증 (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return false;
    }
    
    if (!Array.isArray(events)) {
      return false;
    }
    
    // 최대 10개 이벤트/날짜
    if (events.length > 10) {
      return false;
    }
    
    for (const event of events as any[]) {
      // 필수 필드: title
      if (!event?.title || typeof event.title !== 'string' || event.title.trim().length === 0) {
        return false;
      }
      
      // 제목 길이 제한 (XSS 방지)
      if (event.title.length > 100) {
        return false;
      }
    }
  }
  
  return true;
};

// XSS 방지 및 데이터 정제 (강화된 버전)
const sanitizeEvent = (event: Event): Event => {
  const sanitizeString = (str: string | undefined): string | undefined => {
    if (!str) return undefined;
    return str
      .trim()
      .replace(/[<>]/g, '') // HTML 태그 제거
      .replace(/javascript:/gi, '') // XSS: javascript: 프로토콜 제거
      .replace(/on\w+=/gi, '') // XSS: 이벤트 핸들러 제거
      .substring(0, 200); // 길이 제한
  };

  const sanitizeUrl = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    const trimmed = url.trim();
    
    // whitelist: https://, http://, mailto:
    if (!/^(https?:|mailto:)/.test(trimmed)) {
      return undefined;
    }
    
    // URL 길이 제한
    if (trimmed.length > 2048) {
      return undefined;
    }
    
    return trimmed;
  };

  return {
    ...event,
    id: event.id?.substring(0, 50),
    title: sanitizeString(event.title) || '',
    time: sanitizeString(event.time),
    description: sanitizeString(event.description),
    location: sanitizeString(event.location),
    region: sanitizeString(event.region),
    link: sanitizeUrl(event.link),
    coordinates: event.coordinates,
  };
};

// 캐시에서 로드 (최적화)
const loadFromCache = async (): Promise<EventsByDate | null> => {
  try {
    // 캐시 비활성화 상태에서는 즉시 반환
    if (CACHE_DURATION <= 0) {
      return null;
    }
    
    const [cachedEvents, timestamp] = await Promise.all([
      AsyncStorage.getItem(CACHE_KEY).catch(() => null),
      AsyncStorage.getItem(CACHE_TIMESTAMP_KEY).catch(() => null),
    ]);
    
    if (!cachedEvents || !timestamp) {
      return null;
    }
    
    // 타임스탬프 유효성 검사
    const parsedTimestamp = parseInt(timestamp, 10);
    if (isNaN(parsedTimestamp) || parsedTimestamp <= 0) {
      return null;
    }
    
    const age = Date.now() - parsedTimestamp;
    if (age < 0 || age >= CACHE_DURATION) {
      return null;
    }
    
    const events = JSON.parse(cachedEvents);
    if (validateEvents(events)) {
      return events;
    }
  } catch (error) {
    // 캐시 로드 실패는 무시
  }
  return null;
};

// 캐시에 저장 (최적화)
const saveToCache = async (events: EventsByDate): Promise<void> => {
  try {
    // 데이터 검증
    if (!events || typeof events !== 'object') {
      return;
    }
    
    const jsonString = JSON.stringify(events);
    
    // 메모리 효율성: 너무 큰 캐시는 저장하지 않음 (1MB 초과)
    if (jsonString.length > 1024 * 1024 || jsonString.length < 2) {
      return;
    }
    
    const timestamp = Date.now();
    if (isNaN(timestamp) || timestamp <= 0) {
      return;
    }
    
    await Promise.all([
      AsyncStorage.setItem(CACHE_KEY, jsonString).catch(() => {}),
      AsyncStorage.setItem(CACHE_TIMESTAMP_KEY, timestamp.toString()).catch(() => {}),
    ]);
  } catch (error) {
    // 캐시 저장 실패는 무시
  }
};

export const saveEvents = async (events: EventsByDate): Promise<void> => {
  try {
    if (!validateEvents(events)) {
      throw new Error('Invalid events data structure');
    }
    
    // 데이터 정제
    const sanitizedEvents: EventsByDate = {};
    for (const [date, eventList] of Object.entries(events)) {
      sanitizedEvents[date] = eventList.map(sanitizeEvent);
    }
    
    await saveToCache(sanitizedEvents);
  } catch (error) {
    // 일정 저장 실패는 무시
    throw error;
  }
};

export const loadEvents = async (forceRefresh: boolean = false): Promise<EventsByDate> => {
  const now = Date.now();
  
  // forceRefresh가 아니면 먼저 캐시 확인
  if (!forceRefresh) {
    try {
      const cached = await loadFromCache();
      if (cached && Object.keys(cached).length > 0) {
        console.log('✅ 캐시 데이터 사용');
        return cached;
      }
    } catch (cacheError) {
      // 캐시 로드 실패는 무시하고 계속
    }
  }
  
  try {
    console.log('🔄 GitHub Gist에서 데이터 로드 중...');
    const url = `${GIST_RAW_URL}?_=${now}`;
    
    const rawData = await simpleFetch(url);
    
    if (!validateEvents(rawData)) {
      console.log('⚠️ 데이터 형식 검증 실패');
      throw new Error('Invalid data format');
    }
    
    // 데이터 처리 및 정제 (메모리 효율성)
    const processedEvents: EventsByDate = {};
    let totalEvents = 0;
    
    for (const [date, eventList] of Object.entries(rawData)) {
      const sanitizedList = (eventList as Event[])
        .map((event, idx) => {
          const sanitized = sanitizeEvent({
            ...event,
            id: event.id || `${date}-${idx}`,
          });
          return sanitized;
        })
        .filter((event) => event.title); // 빈 제목 필터링
      
      if (sanitizedList.length > 0) {
        processedEvents[date] = sanitizedList;
        totalEvents += sanitizedList.length;
      }
    }
    
    console.log('✅ Gist 데이터 처리 완료:', Object.keys(processedEvents).length, '일, 총', totalEvents, '개 이벤트');
    
    // 캐시 저장
    await saveToCache(processedEvents);
    
    return processedEvents;
    
  } catch (error) {
    console.log('⚠️ 네트워크 오류, 캐시 복구 시도');
    
    // 실패 시 캐시에서 복구 시도
    try {
      const cached = await loadFromCache();
      if (cached && Object.keys(cached).length > 0) {
        console.log('✅ 캐시 데이터로 대체');
        return cached;
      }
    } catch (cacheError) {
      // 캐시 복구 실패
    }
    
    console.log('⚠️ 빈 데이터 반환 (네트워크 오류)');
    return {};
  }
};
// 내부 사용 전용: 캐시 삭제 (외부에서 호출하지 마세요)
const clearCacheInternal = async (): Promise<void> => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(CACHE_KEY).catch(() => {}),
      AsyncStorage.removeItem(CACHE_TIMESTAMP_KEY).catch(() => {}),
    ]);
    console.log('🗑️ 캐시 삭제 완료');
  } catch (error) {
    // 캐시 삭제 실패는 무시
  }
};
