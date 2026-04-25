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

  // 라이트 모드용 파스텔 색상 (차분한 톤)
  private static EVENT_COLORS = [
    '#e8d5f5', // 라벤더
    '#d5dff5', // 소프트 블루
    '#f5d5e8', // 로즈
    '#d5eef5', // 스카이
    '#f5e0d5', // 피치
    '#dbd5f5', // 퍼플
    '#f5d5d5', // 코랄
    '#d5f5e8', // 민트
    '#f0d5f5', // 마젠타
    '#d5e8f5', // 아이스블루
    '#f5ead5', // 샌드
    '#e0d5f5', // 아이리스
    '#f5d5de', // 피어리
    '#d5f0f5', // 아쿠아
    '#f5e5d5', // 크림
    '#d8d5f5', // 라일락
    '#f5d8d5', // 블러쉬
    '#d5f5de', // 세이지
    '#edd5f5', // 오키드
    '#d5e2f5', // 콰이어트 블루
  ];

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 브랜드 고유 색상 인덱스 (브랜드명 키워드 → 색상 팔레트 인덱스)
  // ─ 인덱스는 EVENT_COLORS / DARK_EVENT_COLORS의 동일 위치를 가리킴
  // ─ 브랜드를 추가하려면 이 객체에 한 줄만 추가하면 됩니다
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private static BRAND_COLOR_INDICES: Record<string, number> = {
    '게더링하우스': 0,  // 라벤더 / 인디고 바이올렛 (보라)
    '채도하우스':   3,  // 스카이 / 뮤트 틸 (청록)
    '채도':         3,  // 채도하우스 약칭
    '솔로몬파티':   4,  // 피치 / 웜 앰버 (주황)
    '솔로몬':       4,  // 솔로몬파티 약칭
    '효스타임':     2,  // 로즈 / 로즈 모브 (핑크)
    '효스':         2,  // 효스타임 약칭
  };

  /** groupId 또는 title에서 브랜드 키워드를 찾아 색상 인덱스 반환. 없으면 null */
  private static getBrandColorIndex(title: string, groupId?: string): number | null {
    const target = (groupId || title || '').toLowerCase();
    for (const [keyword, idx] of Object.entries(this.BRAND_COLOR_INDICES)) {
      if (target.includes(keyword.toLowerCase())) return idx;
    }
    return null;
  }

  // 다크 모드용 딥 팔레트 — 충분히 어두워 흰색 글씨(#fff) 가독성 확보
  // 목표 대비비: 흰 글씨 기준 WCAG AA (4.5:1 이상)
  private static DARK_EVENT_COLORS = [
    '#4a3ca8', // 딥 인디고 바이올렛
    '#2d5ca8', // 딥 블루
    '#963070', // 딥 로즈 모브
    '#277070', // 딥 틸
    '#7a5c2a', // 딥 앰버
    '#5640a8', // 딥 퍼플
    '#8a3a4a', // 딥 베리
    '#2e6e4a', // 딥 세이지 그린
    '#6a3a9a', // 딥 오키드
    '#384a94', // 딥 슬레이트 블루
    '#7a4e28', // 딥 커퍼
    '#42408a', // 딥 아이리스
    '#7e3e65', // 딥 더스티 핑크
    '#285e7a', // 딥 오션
    '#5e5520', // 딥 올리브 샌드
    '#333882', // 딥 나이트 인디고
    '#7a3630', // 딥 테라코타
    '#2e5e3a', // 딥 포레스트 세이지
    '#5e3882', // 딥 그레이프
    '#2e4e78', // 딥 코발트 슬레이트
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
              const allowedLightColors = new Set(this.EVENT_COLORS);
              for (const [key, value] of Object.entries(parsed)) {
                if (typeof key === 'string' && 
                    key.length < 200 && 
                    typeof value === 'string' && 
                    /^#[0-9a-fA-F]{6}$/.test(value) &&
                    !key.startsWith('__dark_') &&
                    allowedLightColors.has(value)) {
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
    const colorKey = groupId || eventId;

    // ① 브랜드 고유 색상 — 초기화 여부와 무관하게 항상 동일 색상 반환
    const brandIdx = this.getBrandColorIndex(eventTitle, groupId);
    if (brandIdx !== null) {
      return isDark ? this.DARK_EVENT_COLORS[brandIdx] : this.EVENT_COLORS[brandIdx];
    }

    // ② colorKey 해시 (이하 로직에서 공통 사용)
    const hash = Math.abs(this.computeHash(colorKey || eventTitle || ''));

    // ③ 초기화 미완료 시 — 해시 기반 임시 색상 (저장하지 않음)
    if (!this.isInitialized) {
      const colors = isDark ? this.DARK_EVENT_COLORS : this.EVENT_COLORS;
      return colors[hash % colors.length];
    }

    // ④ 이미 할당된 색상 재사용
    if (this.colorMap[colorKey]) {
      if (isDark) {
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

    // ⑤ 신규 이벤트 — colorKey 해시로 결정론적 색상 할당
    //    (인접 날짜 비교 제거 → 로드 순서에 무관하게 항상 동일 색상)
    const selectedColor = this.EVENT_COLORS[hash % this.EVENT_COLORS.length];
    this.colorMap[colorKey] = selectedColor;

    // colorMap 크기 제한
    const mapKeys = Object.keys(this.colorMap);
    if (mapKeys.length > 1500) {
      const keysToRemove = mapKeys.slice(0, 500);
      for (const key of keysToRemove) { delete this.colorMap[key]; }
    }

    // 저장 예약 (debounce 5초 — AsyncStorage 쓰기 횟수 감소)
    this.isDirty = true;
    if (!this.saveTimer) {
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        if (this.isDirty) { this.isDirty = false; this.saveColorMap().catch(() => {}); }
      }, 5000);
    }

    if (isDark) {
      const lightIdx = this.EVENT_COLORS.indexOf(selectedColor);
      if (lightIdx >= 0) return this.DARK_EVENT_COLORS[lightIdx];
    }
    return selectedColor;
  }

  static async clearColorMap() {
    // __dark_ 런타임 캐시 포함 전체 제거
    this.colorMap = {};
    this.hashCache.clear();
    await this.saveColorMap();
  }
}

export default EventColorManager;

// 참고: initAsyncStorage() 완료 후 EventColorManager.initialize() 를 명시적으로 호출해야 합니다.
// 모듈 로드 시 자동 초기화하면 AsyncStorage 준비 전에 실행될 수 있습니다.
