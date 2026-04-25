import { EventsByDate, Event, RecurringEvent } from '../types';
import { safeRemoveItem, safeMultiGet, safeMultiSet } from './asyncStorageManager';
import { secureLog } from './secureStorage';
import { env } from '../config/env';
import { getAllHolidays } from './koreanHolidays';

// 환경 변수에서 Gist URL 로드 (보안 강화)
const GIST_RAW_URL = env.GIST_RAW_URL;

const CACHE_KEY = '@events_cache';
const CACHE_TIMESTAMP_KEY = '@events_cache_timestamp';
const CACHE_ETAG_KEY = '@events_cache_etag';
const CACHE_DURATION = 1800000; // 30분 디스크 캐시 (15→30분: 동시접속 시 서버 부하 50% 감소)
const FETCH_TIMEOUT = 8000;       // 기본 타임아웃
const FETCH_TIMEOUT_RETRY = 12000; // 재시도 시 타임아웃 (적응형)

// 인메모리 캐시: 앱 세션 동안 AsyncStorage 접근을 최소화
let _memCache: EventsByDate | null = null;
let _memCacheTime = 0;
const MEM_CACHE_DURATION = 900000; // 15분 메모리 캐시 (10→15분: SWR 백그라운드 재검증으로 커버)
const MAX_JSON_SIZE = 5 * 1024 * 1024; // 5MB 최대 JSON 크기 (DoS 방지)

// ETag 기반 조건부 요청 (304 Not Modified → 네트워크 전송량 제로)
let _lastETag: string | null = null;

// Exponential Backoff: 연속 실패 시 서버 부하 방지 (동시 접속자 가용성)
let _consecutiveFailures = 0;
const MAX_BACKOFF_MS = 60000; // 최대 1분
const getBackoffDelay = (): number => {
  if (_consecutiveFailures === 0) return 0;
  return Math.min(1000 * Math.pow(2, _consecutiveFailures - 1), MAX_BACKOFF_MS);
};
let _lastFailureTime = 0;

// 데이터 변경 감지: 네트워크 fetch 후 기존 캐시와 빠른 비교 (O(날짜 수))
// 동일하면 기존 참조를 반환 → 하류 useMemo 재계산 전부 방지
const isDataUnchanged = (newData: EventsByDate, existing: EventsByDate): boolean => {
  const newKeys = Object.keys(newData);
  const existingKeys = Object.keys(existing);
  if (newKeys.length !== existingKeys.length) return false;
  for (const key of newKeys) {
    const ne = newData[key];
    const ex = existing[key];
    if (!ex || ne.length !== ex.length) return false;
    // 스팟 체크: 첫 번째 + 중간 + 마지막 이벤트 id (O(1))
    if (ne[0]?.id !== ex[0]?.id || ne[0]?.title !== ex[0]?.title) return false;
    const last = ne.length - 1;
    if (last > 0 && ne[last]?.id !== ex[last]?.id) return false;
    if (last > 2) {
      const mid = last >> 1;
      if (ne[mid]?.id !== ex[mid]?.id) return false;
    }
  }
  return true;
};

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
// 허용된 호스트 화이트리스트 (SSRF 방지)
const ALLOWED_HOSTS = [
  'gist.githubusercontent.com',
  'raw.githubusercontent.com',
] as const;

const isAllowedUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_HOSTS.some(host => parsed.hostname === host);
  } catch {
    return false;
  }
};

const fetchData = async (url: string): Promise<EventsByDate | 'NOT_MODIFIED'> => {
  // URL 화이트리스트 검증
  if (!isAllowedUrl(url)) {
    secureLog.warn('⚠️ 허용되지 않은 URL');
    throw new Error('Blocked URL');
  }

  // Exponential Backoff: 연속 실패 중이면 대기
  const backoff = getBackoffDelay();
  if (backoff > 0 && (Date.now() - _lastFailureTime) < backoff) {
    throw new Error('Backoff active');
  }
  
  const controller = new AbortController();
  // 적응형 타임아웃: 재시도 중이면 12초, 첫 시도면 8초
  const timeout = _consecutiveFailures > 0 ? FETCH_TIMEOUT_RETRY : FETCH_TIMEOUT;
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    // ETag 조건부 요청: 서버 데이터 미변경 시 304 응답 → 전송량 0
    if (_lastETag) {
      headers['If-None-Match'] = _lastETag;
    }

    const response = await fetch(url, { 
      signal: controller.signal,
      headers,
      redirect: 'error',
    });
    clearTimeout(timeoutId);
    
    // 304 Not Modified: 데이터 변경 없음 → 캐시 그대로 사용
    if (response.status === 304) {
      _consecutiveFailures = 0;
      return 'NOT_MODIFIED';
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // 응답 URL이 허용된 도메인인지 재검증 (리디렉트 우회 방지)
    if (response.url && !isAllowedUrl(response.url)) {
      secureLog.warn('⚠️ 응답 URL이 허용되지 않은 도메인');
      throw new Error('Redirected to blocked URL');
    }

    // ETag 저장 (다음 요청에 사용)
    const etag = response.headers.get('etag');
    if (etag) {
      _lastETag = etag;
      safeMultiSet([[CACHE_ETAG_KEY, etag]]).catch(() => {});
    }
    
    const text = await response.text();
    
    // 보안: 응답 크기 검증
    if (text.length > MAX_JSON_SIZE) {
      secureLog.warn('⚠️ 응답 크기 초과');
      throw new Error('Response too large');
    }
    
    _consecutiveFailures = 0;
    
    // 2단계 파싱만 (간소화) - 안전한 파싱 사용
    const parsed = safeJSONParse<EventsByDate>(text, {});
    if (Object.keys(parsed).length > 0) {
      return parsed;
    }
    // 정제 후 재시도
    return safeJSONParse<EventsByDate>(cleanJSON(text), {});
  } catch (error: any) {
    _consecutiveFailures++;
    _lastFailureTime = Date.now();
    if (error.name === 'AbortError') {
      secureLog.warn('⚠️ 네트워크 타임아웃');
    } else {
      secureLog.warn('⚠️ 네트워크 오류');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

// ==================== 반복 일정 전개 ====================

const DAY_MAP: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/**
 * recurring 배열을 날짜별 이벤트로 전개
 * days에 지정된 요일마다 startDate~endDate 범위에서 이벤트 생성
 */
const expandRecurringEvents = (recurring: RecurringEvent[]): EventsByDate => {
  const result: EventsByDate = {};
  
  if (!Array.isArray(recurring)) return result;
  
  for (const rule of recurring) {
    if (!rule.id || !rule.title || !Array.isArray(rule.days) || !rule.startDate || !rule.endDate) {
      continue;
    }
    
    // 요일 숫자로 변환
    const targetDays = rule.days
      .map(d => DAY_MAP[d.toLowerCase()])
      .filter((d): d is number => d !== undefined);
    
    if (targetDays.length === 0) continue;
    
    const excludeSet = new Set(rule.excludeDates || []);
    const start = new Date(rule.startDate + 'T00:00:00');
    const end = new Date(rule.endDate + 'T00:00:00');
    
    // 날짜 유효성
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) continue;
    
    // 공휴일 자동 할당에서 중복 방지를 위해 이미 생성된 날짜 추적
    const generatedDates = new Set<string>();

    // rule 공통 필드를 한 번만 추출 (GC 압력 감소)
    const baseEvent: Omit<Event, 'id'> = {
      groupId: rule.groupId || rule.id,
      title: rule.title,
      time: rule.time,
      location: rule.location,
      region: rule.region,
      description: rule.description,
      link: rule.link,
      coordinates: rule.coordinates,
      maleCapacity: rule.maleCapacity,
      femaleCapacity: rule.femaleCapacity,
      maleCount: rule.maleCount,
      femaleCount: rule.femaleCount,
      price: rule.price,
      ageRange: rule.ageRange,
      organizer: rule.organizer,
      contact: rule.contact,
      detailDescription: rule.detailDescription,
      venue: rule.venue,
      address: rule.address,
      tags: rule.tags,
      promoted: rule.promoted,
      promotionPriority: rule.promotionPriority,
      promotionLabel: rule.promotionLabel,
      promotionColor: rule.promotionColor,
    };

    // 요일별로 직접 점프 (7일 단위) → 날짜 하나씩 순회 대비 ~7배 빠름
    for (const targetDay of targetDays) {
      // start~end 안에서 첫 번째 해당 요일 찾기
      const daysToFirst = (targetDay - start.getDay() + 7) % 7;
      const current = new Date(start);
      current.setDate(current.getDate() + daysToFirst);

      let occurrenceCount = 0;
      while (current <= end && occurrenceCount < 60) { // 최대 60주(약 14개월) 안전 장치
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        if (!excludeSet.has(dateStr)) {
          if (!result[dateStr]) result[dateStr] = [];
          result[dateStr].push(Object.assign({}, baseEvent, { id: `${rule.id}_${dateStr}` }));
          generatedDates.add(dateStr);
        }

        current.setDate(current.getDate() + 7);
        occurrenceCount++;
      }
    }

    // 공휴일 자동 할당: includeHolidays=true 인 경우, 기존 패턴에 없는 공휴일에도 이벤트 추가
    if (rule.includeHolidays) {
      const startStr = rule.startDate;
      const endStr = rule.endDate;
      const allHolidays = getAllHolidays();

      for (const [dateStr] of Object.entries(allHolidays)) {
        if (dateStr < startStr || dateStr > endStr) continue;
        if (excludeSet.has(dateStr)) continue;
        if (generatedDates.has(dateStr)) continue; // 이미 요일 패턴으로 생성됨

        if (!result[dateStr]) result[dateStr] = [];
        result[dateStr].push(Object.assign({}, baseEvent, { id: `${rule.id}_${dateStr}` }));
      }
    }
  }
  
  return result;
};

// ==================== 데이터 검증 (간소화) ====================

const _dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const validateEvents = (data: any): data is EventsByDate => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  
  try {
    const entries = Object.entries(data);
    // 빈 객체는 유효 (모든 이벤트가 recurring에 있을 수 있음)
    if (entries.length === 0) return true;
    // 스팟 체크: 첫 번째, 마지막, 중간 날짜만 검증 (전체 순회 대비 ~100배 빠름)
    const checkIndices = [0, entries.length - 1, entries.length >> 1];
    for (const idx of checkIndices) {
      if (idx >= entries.length) continue;
      const [date, events] = entries[idx];
      if (!_dateRegex.test(date)) return false;
      if (!Array.isArray(events)) return false;
      if (events.length > 0 && (!events[0]?.title || typeof events[0].title !== 'string')) return false;
    }
    return true;
  } catch {
    return false;
  }
};

// ==================== 데이터 정제 (간소화) ====================

// 지역명 정규화 ("서울시" → "서울", "남양주시" → "남양주" 등)
const _regionCache = new Map<string, string | undefined>();
const normalizeRegion = (region: string | undefined): string | undefined => {
  if (!region) return undefined;
  
  const cached = _regionCache.get(region);
  if (cached !== undefined) return cached;
  // 캐시에 undefined가 key로 있는 경우를 위해 has 체크
  if (_regionCache.has(region)) return undefined;
  
  let normalized = region.trim();
  normalized = normalized.replace(/(특별|광역)시$/, '');
  normalized = normalized.replace(/시$/, '');
  normalized = normalized.replace(/도$/, '');
  
  const result = normalized.trim() || undefined;
  _regionCache.set(region, result);
  return result;
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
    coordinates: (() => {
      const c = event.coordinates;
      if (!c || typeof c.latitude !== 'number' || typeof c.longitude !== 'number') return undefined;
      if (!isFinite(c.latitude) || !isFinite(c.longitude)) return undefined;
      if (c.latitude < -90 || c.latitude > 90 || c.longitude < -180 || c.longitude > 180) return undefined;
      return { latitude: c.latitude, longitude: c.longitude };
    })(),
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
    // 프로모션 (광고)
    promoted: event.promoted === true ? true : undefined,
    promotionPriority: typeof event.promotionPriority === 'number' ? Math.max(0, event.promotionPriority) : undefined,
    promotionLabel: cleanString(event.promotionLabel, 20),
    promotionColor: cleanString(event.promotionColor, 20),
    // 반복 일정 그룹
    groupId: cleanString(event.groupId, 100),
    // 서브 이벤트 (지점별 묶음) — 이미 sanitize된 상태로 들어옴
    subEvents: event.subEvents,
  };
};

// ==================== 캐시 관리 (최적화) ====================

// AsyncStorage 초기화는 asyncStorageManager에서 처리

const loadFromCache = async (): Promise<EventsByDate | null> => {
  // 캐시 비활성화 시 바로 반환
  if (CACHE_DURATION <= 0) return null;
  
  try {
    const results = await safeMultiGet([CACHE_KEY, CACHE_TIMESTAMP_KEY, CACHE_ETAG_KEY]);
    const cached = results[0][1];
    const timestamp = results[1][1];
    const savedETag = results[2]?.[1];
    
    // ETag 복원 (앱 재시작 시에도 조건부 요청 가능)
    if (savedETag && !_lastETag) {
      _lastETag = savedETag;
    }
    
    if (!cached || !timestamp) return null;
    
    const timestampNum = parseInt(timestamp, 10);
    if (isNaN(timestampNum) || timestampNum <= 0) return null;
    
    const age = Date.now() - timestampNum;
    // 음수나 만료된 캐시 거부 — 하지만 만료 캐시도 ETag 복원 후 반환 안 함
    // (SWR 패턴에서 만료 캐시는 loadStaleCache에서 처리)
    if (age < 0 || age >= CACHE_DURATION) {
      secureLog.info('⌛ 캐시 만료');
      // 캐시 만료 시 ETag도 무효화 → 다음 fetch에서 304 대신 200 전체 데이터 수신
      _lastETag = null;
      return null;
    }
    
    const events = safeJSONParse<EventsByDate>(cached, {});
    if (!validateEvents(events)) {
      secureLog.warn('⚠️ 캐시 데이터 검증 실패');
      return null;
    }
    
    return events;
  } catch (error) {
    secureLog.warn('⚠️ 캐시 로드 실패:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
};

const saveToCache = async (events: EventsByDate): Promise<void> => {
  try {
    if (!events || typeof events !== 'object' || Object.keys(events).length === 0) {
      secureLog.warn('⚠️ 빈 데이터는 캀시하지 않음');
      return;
    }
    
    // 조기 크기 추정 (불필요한 stringify 방지)
    let eventCount = 0;
    for (const eventList of Object.values(events)) {
      eventCount += eventList.length;
    }
    // 이벤트당 평균 ~500바이트, 1MB 초과 예상시 스킵
    if (eventCount * 500 > 1024 * 1024) {
      secureLog.warn('⚠️ 캀시 데이터 크기 초과 예상, 저장 스킵');
      return;
    }
    
    const jsonString = JSON.stringify(events);
    
    if (jsonString.length > 1024 * 1024) {
      secureLog.warn('⚠️ 캀시 데이터 크기 초과, 저장 스킵');
      return;
    }
    
    await safeMultiSet([
      [CACHE_KEY, jsonString],
      [CACHE_TIMESTAMP_KEY, Date.now().toString()]
    ]);
    
    secureLog.info('✅ 캀시 저장 완료');
  } catch (error) {
    secureLog.warn('⚠️ 캀시 저장 실패');
  }
};

// ==================== 공개 API ====================

// 네트워크 요청 중복 방지 (동시 호출 시 단일 요청만 실행)
let _pendingLoadPromise: Promise<EventsByDate> | null = null;

// SWR 백그라운드 재검증: 캐시 반환 후 네트워크에서 최신 데이터 확인
const _revalidateInBackground = (): void => {
  loadEvents(true).then((freshData) => {
    if (freshData && Object.keys(freshData).length > 0) {
      _swrListeners.forEach(listener => {
        try { listener(freshData); } catch {}
      });
    }
  }).catch(() => { /* 백그라운드 실패는 무시: 이미 캐시 반환됨 */ });
};

// SWR 백그라운드 재검증 리스너 (CalendarScreen 등에서 구독)
type SWRListener = (data: EventsByDate) => void;
const _swrListeners = new Set<SWRListener>();
export const onSWRUpdate = (listener: SWRListener): (() => void) => {
  _swrListeners.add(listener);
  return () => _swrListeners.delete(listener);
};

export const loadEvents = async (forceRefresh: boolean = false): Promise<EventsByDate> => {
  // 1순위: 인메모리 캐시 (AsyncStorage보다 100배 빠름)
  if (!forceRefresh) {
    const memAge = Date.now() - _memCacheTime;
    if (_memCache && memAge >= 0 && memAge < MEM_CACHE_DURATION) {
      return _memCache;
    }
  }

  // 2순위: AsyncStorage 디스크 캐시
  if (!forceRefresh) {
    const cached = await loadFromCache();
    if (cached) {
      secureLog.info('✅ 디스크 캐시 사용');
      _memCache = cached;
      _memCacheTime = Date.now();
      
      // SWR: 캐시 반환 후 백그라운드에서 네트워크 재검증
      // 새 데이터가 있으면 _swrListeners로 전파
      if (!_pendingLoadPromise) {
        _revalidateInBackground();
      }
      
      return cached;
    }
  }
  
  // 이미 진행 중인 네트워크 요청이 있으면 재사용 (중복 fetch 방지)
  if (_pendingLoadPromise) {
    return _pendingLoadPromise;
  }

  const doLoad = async (): Promise<EventsByDate> => {
  try {
    secureLog.info('🔄 데이터 로딩...');
    const url = GIST_RAW_URL;
    const fetchResult = await fetchData(url);
    
    // 304 Not Modified: 서버 데이터 미변경 → 기존 캐시 그대로 반환
    let rawData: EventsByDate;
    if (fetchResult === 'NOT_MODIFIED') {
      secureLog.info('✅ 304 Not Modified - 캐시 유지');
      if (_memCache) {
        _memCacheTime = Date.now();
        return _memCache;
      }
      const cached = await loadFromCache();
      if (cached) {
        _memCache = cached;
        _memCacheTime = Date.now();
        return cached;
      }
      // 304인데 캐시가 전혀 없음 → ETag 무효화 후 전체 데이터 재요청
      secureLog.warn('⚠️ 304인데 캐시 없음 → 전체 재요청');
      _lastETag = null;
      safeMultiSet([[CACHE_ETAG_KEY, '']]).catch(() => {});
      const retryResult = await fetchData(url);
      if (retryResult === 'NOT_MODIFIED') {
        throw new Error('Unexpected 304 after ETag clear');
      }
      rawData = retryResult;
    } else {
      rawData = fetchResult;
    }
    
    // recurring 필드 추출 후 제거
    const rawAny = rawData as any;
    let recurringEvents: EventsByDate = {};
    if (Array.isArray(rawAny.recurring)) {
      recurringEvents = expandRecurringEvents(rawAny.recurring);
      delete rawAny.recurring;
    }
    
    if (!validateEvents(rawData)) {
      secureLog.warn('⚠️ 데이터 검증 실패');
      throw new Error('Invalid data');
    }
    
    // 데이터 정제
    const processed: EventsByDate = {};
    
    // 1. 반복 일정 먼저 추가 (expandRecurringEvents에서 미정제 상태로 반환)
    for (const [date, eventList] of Object.entries(recurringEvents)) {
      const sanitized = eventList
        .map(e => sanitizeEvent(e))
        .filter(e => e.title);
      if (sanitized.length > 0) {
        processed[date] = sanitized;
      }
    }
    
    // 2. 개별 일정 병합 (같은 날짜면 뒤에 추가)
    for (const [date, eventList] of Object.entries(rawData)) {
      if (!Array.isArray(eventList)) continue;
      const sanitized = (eventList as Event[])
        .map((e, i) => sanitizeEvent(e.id ? e : { ...e, id: `${date}-${i}` }))
        .filter(e => e.title);
      
      if (sanitized.length > 0) {
        if (processed[date]) {
          processed[date].push(...sanitized);
        } else {
          processed[date] = sanitized;
        }
      }
    }
    
    // 3. 같은 날짜 + 같은 groupId 이벤트를 subEvents로 병합
    for (const date of Object.keys(processed)) {
      const events = processed[date];
      if (!events.some(ev => ev.groupId)) continue; // groupId 없으면 스킵
      const grouped: Event[] = [];
      const groupMap = new Map<string, Event>();
      
      for (const ev of events) {
        if (ev.groupId) {
          const existing = groupMap.get(ev.groupId);
          if (existing) {
            if (!existing.subEvents) {
              existing.subEvents = [existing]; // 스프레드 제거: 동일 참조 사용 (이미 sanitize 완료)
            }
            existing.subEvents.push(ev);
          } else {
            groupMap.set(ev.groupId, ev);
            grouped.push(ev);
          }
        } else {
          grouped.push(ev);
        }
      }
      
      processed[date] = grouped;
    }
    
    secureLog.info('✅ 로딩 완료');

    // 데이터 변경이 없으면 기존 memCache 참조 반환 → CalendarScreen 전체 useMemo 체인 재계산 방지
    if (_memCache && isDataUnchanged(processed, _memCache)) {
      _memCacheTime = Date.now();
      return _memCache;
    }

    // 인메모리 캐시 갱신 (저장보다 먼저)
    _memCache = processed;
    _memCacheTime = Date.now();

    // 디스크 캐시 저장
    await saveToCache(processed);
    
    return processed;
  } catch (error) {
    secureLog.warn('⚠️ 네트워크 오류, 캐시 복구 시도');
    
    // 1. 인메모리 캐시가 있으면 즉시 반환 (디스크 접근 불필요)
    if (_memCache && Object.keys(_memCache).length > 0) {
      _memCacheTime = Date.now(); // TTL 갱신: 네트워크 실패 동안 메모리 캐시 유지
      secureLog.info('✅ 메모리 캐시 복구');
      return _memCache;
    }
    
    // 2. 유효한 디스크 캐시 시도
    const cached = await loadFromCache();
    if (cached) {
      _memCache = cached;
      _memCacheTime = Date.now();
      secureLog.info('✅ 디스크 캐시 복구');
      return cached;
    }
    
    // 3. 만료된 캐시라도 반환 (빈 화면보다 나음)
    try {
      const results = await safeMultiGet([CACHE_KEY]);
      const rawCached = results[0]?.[1];
      if (rawCached) {
        const staleEvents = safeJSONParse<EventsByDate>(rawCached, {});
        if (validateEvents(staleEvents) && Object.keys(staleEvents).length > 0) {
          _memCache = staleEvents;
          _memCacheTime = Date.now();
          secureLog.warn('⚠️ 만료된 캐시 사용 (네트워크 오류 대비)');
          return staleEvents;
        }
      }
    } catch { /* 무시 */ }
    
    secureLog.warn('❌ 빈 데이터 반환');
    return {};
  }
  };

  _pendingLoadPromise = doLoad();
  try {
    return await _pendingLoadPromise;
  } finally {
    _pendingLoadPromise = null;
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

// 인메모리 캐시 존재 여부 동기 확인 (CalendarScreen 초기 로딩 스킵용)
export const hasMemCache = (): boolean => {
  const memAge = Date.now() - _memCacheTime;
  return _memCache !== null && memAge >= 0 && memAge < MEM_CACHE_DURATION;
};

// 캐시 삭제 (디버깅용)
export const clearCache = async (): Promise<void> => {
  // 인메모리 캐시도 즉시 초기화
  _memCache = null;
  _memCacheTime = 0;
  try {
    await safeRemoveItem(CACHE_KEY);
    await safeRemoveItem(CACHE_TIMESTAMP_KEY);
    secureLog.info('🗑️ 캐시 삭제 완료');
  } catch {
    // 무시
  }
};
