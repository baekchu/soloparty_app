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
};

export type MainTabParamList = {
  Calendar: undefined;
  EventList: undefined;
};
