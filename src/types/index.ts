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
  Reward: undefined; // 적립금 & 광고 화면
  Invite: undefined; // 친구 초대 화면
};

export type MainTabParamList = {
  Calendar: undefined;
  EventList: undefined;
};
