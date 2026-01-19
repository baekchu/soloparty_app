import { safeGetItem, safeSetItem } from './asyncStorageManager';

const COLOR_MAP_KEY = '@event_color_map';

// 이벤트 ID별 색상 매핑 저장/로드
class EventColorManager {
  private static colorMap: { [eventId: string]: string } = {};
  private static isInitialized = false;

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

  static async initialize() {
    if (this.isInitialized) return;
    
    try {
      const saved = await safeGetItem(COLOR_MAP_KEY);
      if (saved) {
        // 보안: 크기 제한 및 안전한 파싱
        if (saved.length > 500000) { // 500KB 제한
          console.warn('⚠️ 색상 맵 데이터 크기 초과, 초기화');
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
            console.warn('⚠️ 색상 맵 JSON 파싱 실패');
            this.colorMap = {};
          }
        }
      }
      this.isInitialized = true;
    } catch (error) {
      console.error('Error loading color map:', error);
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
    currentIndex: number
  ): string {
    // 이미 색상이 할당되어 있으면 그대로 반환
    if (this.colorMap[eventId]) {
      return this.colorMap[eventId];
    }

    // 현재 날짜 파싱
    const currentDate = new Date(dateString);
    
    // 전날, 다음날 날짜 계산
    const prevDate = new Date(currentDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);
    
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const prevDateString = formatDate(prevDate);
    const nextDateString = formatDate(nextDate);

    // 사용된 색상 수집 (당일 + 전날 + 다음날)
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

    // 사용되지 않은 색상 찾기
    let selectedColor: string;
    const availableColors = this.EVENT_COLORS.filter(c => !usedColors.has(c));
    
    if (availableColors.length > 0) {
      // 해시를 이용해 일관된 색상 선택
      const hash = (eventId || eventTitle || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      selectedColor = availableColors[hash % availableColors.length];
    } else {
      // 모든 색상이 사용 중이면 해시로 선택 (극히 드문 경우)
      const hash = (eventId || eventTitle || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      selectedColor = this.EVENT_COLORS[hash % this.EVENT_COLORS.length];
    }

    // 색상 저장 (즉시 저장하여 손실 방지)
    this.colorMap[eventId] = selectedColor;
    
    // 즉시 저장 (비동기이지만 백그라운드에서 실행)
    this.saveColorMap().catch(err => {
      console.error('Failed to save color map:', err);
    });

    return selectedColor;
  }

  static async clearColorMap() {
    this.colorMap = {};
    await this.saveColorMap();
  }
}

export default EventColorManager;
