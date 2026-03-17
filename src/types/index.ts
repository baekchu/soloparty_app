export interface Event {
  id?: string;
  title: string;
  time?: string;
  location?: string;
  region?: string;
  description?: string;
  link?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  // 참석자 정보
  maleCapacity?: number;      // 남자 정원
  femaleCapacity?: number;    // 여자 정원
  maleCount?: number;         // 현재 남자 참석자
  femaleCount?: number;       // 현재 여자 참석자
  // 추가 정보
  price?: number;             // 참가비
  ageRange?: string;          // 연령대 (예: "25-35")
  organizer?: string;         // 주최자
  contact?: string;           // 연락처
  detailDescription?: string; // 상세 설명
  venue?: string;             // 장소명 (예: "카페 OOO")
  address?: string;           // 상세 주소
  tags?: string[];            // 태그 (예: ["소개팅", "미팅"])
  // 프로모션 (광고)
  promoted?: boolean;         // 프로모션(홍보) 이벤트 여부
  promotionPriority?: number; // 홍보 우선순위 (높을수록 상단, 기본 0)
  promotionLabel?: string;    // 홍보 라벨 (예: "HOT", "추천", "인기")
  promotionColor?: string;    // 홍보 뱃지 색상 (예: "#ef4444")
  // 반복 일정 그룹 (같은 groupId = 같은 색상 + 연결선)
  groupId?: string;           // 반복 일정 그룹 ID (recurring에서 자동 설정)
  // 같은 그룹+같은 날짜의 서브 이벤트 (지점별 묶음)
  subEvents?: Event[];        // 캘린더에서는 대표 1개만 표시, 상세에서 지점 선택
}

export interface EventsByDate {
  [date: string]: Event[];
}

/** 반복 일정 (Gist에서 recurring 필드로 관리) */
export interface RecurringEvent {
  id: string;
  /** 브랜드 그룹 ID (같은 groupId = 캘린더에서 1줄로 합침) */
  groupId?: string;
  title: string;
  time?: string;
  location?: string;
  region?: string;
  description?: string;
  link?: string;
  coordinates?: { latitude: number; longitude: number };
  maleCapacity?: number;
  femaleCapacity?: number;
  maleCount?: number;
  femaleCount?: number;
  price?: number;
  ageRange?: string;
  organizer?: string;
  contact?: string;
  detailDescription?: string;
  venue?: string;
  address?: string;
  tags?: string[];
  promoted?: boolean;
  promotionPriority?: number;
  promotionLabel?: string;
  promotionColor?: string;
  /** 반복 요일 (mon, tue, wed, thu, fri, sat, sun) */
  days: string[];
  /** 반복 시작일 (YYYY-MM-DD) */
  startDate: string;
  /** 반복 종료일 (YYYY-MM-DD) */
  endDate: string;
  /** 특정 날짜 제외 */
  excludeDates?: string[];
  /**
   * 공휴일에도 파티를 여는 경우 true로 설정.
   * 일반 요일 패턴에 없는 공휴일에도 자동으로 이벤트가 생성됩니다.
   */
  includeHolidays?: boolean;
}

export type RootStackParamList = {
  MainTabs: undefined;
  AddEvent: undefined;
  AdminLogin: undefined;
  Settings: undefined;
  LocationPicker: undefined;
  Reward: undefined;
  Coupon: undefined;
  Invite: undefined;
  Legal: { type: 'terms' | 'privacy' | 'copyright' };
  EventDetail: { event: Event; date: string }; // 이벤트 상세 화면
};

export type MainTabParamList = {
  Calendar: undefined;
  EventList: undefined;
};
