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
}

export interface EventsByDate {
  [date: string]: Event[];
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
