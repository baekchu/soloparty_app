import { safeGetItem, safeSetItem } from './asyncStorageManager';
import { secureLog } from './secureStorage';

const COLOR_MAP_KEY = '@event_color_map';

// 이벤트 ID별 색상 매핑 저장/로드
class EventColorManager {
  private static colorMap: { [eventId: string]: string } = {};
  private static isInitialized = false;
  private static saveTimer: ReturnType<typeof setTimeout> | null = null;
  private static isDirty = false;

  // 해시 캐시: split+reduce 반복 제거 (문자열당 1회만 계산)
  private static hashCache = new Map<string, number>();

  private static computeHash(str: string): number {
    if (!str) return 0;
    const cached = this.hashCache.get(str);
    if (cached !== undefined) return cached;
    let h = 0;
    const len = Math.min(str.length, 50);
    for (let i = 0; i < len; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    this.hashCache.set(str, h);
    if (this.hashCache.size > 500) {
      const first = this.hashCache.keys().next().value;
      if (first !== undefined) this.hashCache.delete(first);
    }
    return h;
  }

  // 라이트 모드용 파스텔 색상
  private static EVENT_COLORS = [
    '#fce7f3', // 부드러운 핑크
    '#ddd6fe', // 라벤더
    '#bfdbfe', // 하늘색
    '#a7f3d0', // 민트
    '#fde68a', // 따뜻한 노랑
    '#fed7aa', // 피치
    '#fca5a5', // 코랄
    '#c7d2fe', // 퍼플
    '#fbcfe8', // 핫핑크
    '#d1fae5', // 에메랄드
    '#fef3c7', // 앰버
    '#fecdd3', // 로즈
    '#e9d5ff', // 바이올렛
    '#bae6fd', // 스카이블루
    '#fde047', // 레몬
    '#fdba74', // 오렌지
    '#f9a8d4', // 푸시아
    '#c4b5fd', // 인디고
    '#a5f3fc', // 시안
    '#d9f99d', // 라임
  ];

  // 다크 모드용 진한 색상 (흰색 텍스트가 잘 보이도록)
  private static DARK_EVENT_COLORS = [
    '#9d174d', // 진한 핑크
    '#5b21b6', // 진한 라벤더
    '#1e40af', // 진한 하늘색
    '#065f46', // 진한 민트
    '#92400e', // 진한 노랑
    '#c2410c', // 진한 피치
    '#b91c1c', // 진한 코랄
    '#4338ca', // 진한 퍼플
    '#be185d', // 진한 핫핑크
    '#047857', // 진한 에메랄드
    '#b45309', // 진한 앰버
    '#e11d48', // 진한 로즈
    '#7c3aed', // 진한 바이올렛
    '#0369a1', // 진한 스카이블루
    '#a16207', // 진한 레몬
    '#ea580c', // 진한 오렌지
    '#a21caf', // 진한 푸시아
    '#4f46e5', // 진한 인디고
    '#0e7490', // 진한 시안
    '#4d7c0f', // 진한 라임
  ];

  static async initialize() {
    if (this.isInitialized) return;
    
    try {
      const saved = await safeGetItem(COLOR_MAP_KEY);
      if (saved) {
        // 보안: 크기 제한 및 안전한 파싱
        if (saved.length > 500000) { // 500KB 제한
          secureLog.warn('⚠️ 색상 맵 데이터 크기 초과');
          this.colorMap = {};
        } else {
          try {
            const parsed = JSON.parse(saved);
            // 보안: 타입 검증
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              // 각 값이 유효한 색상 문자열인지 검증
              const validMap: { [eventId: string]: string } = {};
              for (const [key, value] of Object.entries(parsed)) {
                if (typeof key === 'string' && 
                    key.length < 200 && 
                    typeof value === 'string' && 
                    /^#[0-9a-fA-F]{6}$/.test(value)) {
                  validMap[key] = value;
                }
              }
              this.colorMap = validMap;
            } else {
              this.colorMap = {};
            }
          } catch {
            secureLog.warn('⚠️ 색상 맵 JSON 파싱 실패');
            this.colorMap = {};
          }
        }
      }
      this.isInitialized = true;
    } catch (error) {
      secureLog.error('색상 맵 로드 실패');
      this.colorMap = {};
      this.isInitialized = true;
    }
  }

  static async saveColorMap() {
    try {
      await safeSetItem(COLOR_MAP_KEY, JSON.stringify(this.colorMap));
    } catch (error) {
      // 색상 맵 저장 실패는 무시
    }
  }

  static getColorForEvent(
    eventId: string, 
    eventTitle: string, 
    dateString: string,
    allEvents: { [date: string]: any[] },
    dayEvents: any[], 
    currentIndex: number,
    isDark: boolean = false,
    groupId?: string,
  ): string {
    // groupId가 있으면 그룹 기준으로 색상 할당 (반복 일정 동일 색상)
    const colorKey = groupId || eventId;
    
    // 초기화 미완료 시 — 해시 기반 임시 색상 반환 (colorMap에 저장하지 않음)
    if (!this.isInitialized) {
      const hash = this.computeHash(colorKey || eventTitle || '');
      const colors = isDark ? this.DARK_EVENT_COLORS : this.EVENT_COLORS;
      return colors[Math.abs(hash) % colors.length];
    }
    
    // 이미 색상이 할당되어 있으면 다크모드 변환 후 반환
    if (this.colorMap[colorKey]) {
      if (isDark) {
        // 다크모드 변환 결과 캐시
        const darkKey = `__dark_${colorKey}`;
        if (this.colorMap[darkKey]) return this.colorMap[darkKey];
        const lightIdx = this.EVENT_COLORS.indexOf(this.colorMap[colorKey]);
        if (lightIdx >= 0) {
          const darkColor = this.DARK_EVENT_COLORS[lightIdx];
          this.colorMap[darkKey] = darkColor;
          return darkColor;
        }
      }
      return this.colorMap[colorKey];
    }

    // 인접 날짜 문자열 산술 계산 (Date 객체 3개 생성 제거)
    const parts = dateString.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const pad2 = (n: number) => n < 10 ? `0${n}` : `${n}`;
    // 전날/다음날은 Date 객체로 한 번만 계산 (월 경계 처리)
    const prev = new Date(y, m, d - 1);
    const next = new Date(y, m, d + 1);
    const prevDateString = `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}-${pad2(prev.getDate())}`;
    const nextDateString = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;

    // 사용된 색상 수집 (당일 + 전날 + 다음날) — 항상 라이트 색상 기준
    const usedColors = new Set<string>();
    
    // 당일의 이전 이벤트들
    for (let i = 0; i < currentIndex; i++) {
      const prevEventId = dayEvents[i].id;
      if (prevEventId && this.colorMap[prevEventId]) {
        usedColors.add(this.colorMap[prevEventId]);
      }
    }
    
    // 전날의 모든 이벤트
    const prevDayEvents = allEvents[prevDateString] || [];
    for (const event of prevDayEvents) {
      if (event.id && this.colorMap[event.id]) {
        usedColors.add(this.colorMap[event.id]);
      }
    }
    
    // 다음날의 모든 이벤트
    const nextDayEvents = allEvents[nextDateString] || [];
    for (const event of nextDayEvents) {
      if (event.id && this.colorMap[event.id]) {
        usedColors.add(this.colorMap[event.id]);
      }
    }

    // 사용되지 않은 색상 찾기 (항상 라이트 색상으로 저장)
    let selectedColor: string;
    const availableColors = this.EVENT_COLORS.filter(c => !usedColors.has(c));
    
    const hash = Math.abs(this.computeHash(eventId || eventTitle || ''));
    if (availableColors.length > 0) {
      selectedColor = availableColors[hash % availableColors.length];
    } else {
      selectedColor = this.EVENT_COLORS[hash % this.EVENT_COLORS.length];
    }

    // 라이트 색상을 colorMap에 저장 (groupId 기준)
    this.colorMap[colorKey] = selectedColor;
    
    // colorMap 크기 제한 (1500개 초과 시 가장 오래된 500개 일괄 제거)
    const mapKeys = Object.keys(this.colorMap);
    if (mapKeys.length > 1500) {
      const keysToRemove = mapKeys.slice(0, 500);
      for (const key of keysToRemove) {
        delete this.colorMap[key];
      }
    }
    
    // 저장 예약 (render 완료 후 비동기 실행 — React 원칙 준수)
    this.isDirty = true;
    if (!this.saveTimer) {
      // queueMicrotask 대신 setTimeout(0)으로 render 사이클 이후 실행
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        if (this.isDirty) {
          this.isDirty = false;
          this.saveColorMap().catch(() => {});
        }
      }, 0);
    }

    // 다크모드이면 대응하는 다크 색상 반환
    if (isDark) {
      const lightIdx = this.EVENT_COLORS.indexOf(selectedColor);
      if (lightIdx >= 0) {
        return this.DARK_EVENT_COLORS[lightIdx];
      }
    }

    return selectedColor;
  }

  static async clearColorMap() {
    this.colorMap = {};
    await this.saveColorMap();
  }
}

export default EventColorManager;

// 참고: initAsyncStorage() 완료 후 EventColorManager.initialize() 를 명시적으로 호출해야 합니다.
// 모듈 로드 시 자동 초기화하면 AsyncStorage 준비 전에 실행될 수 있습니다.
