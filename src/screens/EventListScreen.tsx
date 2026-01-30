import React, { useState, useMemo, useCallback, memo } from 'react';
import { View, Text, FlatList, StyleSheet, ListRenderItemInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { loadEvents } from '../utils/storage';
import { Event } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../types';
import { CompositeNavigationProp } from '@react-navigation/native';

type EventListScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'EventList'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface EventListScreenProps {
  navigation: EventListScreenNavigationProp;
}

interface EventWithDate extends Event {
  date: string;
}

// 아이템 높이 상수 (getItemLayout 최적화용)
const ITEM_HEIGHT = 140;
const ITEM_MARGIN_BOTTOM = 12;
const TOTAL_ITEM_HEIGHT = ITEM_HEIGHT + ITEM_MARGIN_BOTTOM;

// ==================== 메모이즈된 이벤트 카드 컴포넌트 ====================
interface EventCardProps {
  item: EventWithDate;
  isDark: boolean;
}

const EventCard = memo(({ item, isDark }: EventCardProps) => (
  <View style={[
    styles.eventCard,
    { backgroundColor: isDark ? '#111827' : '#ffffff' }
  ]}>
    <View style={[styles.eventAccent, { backgroundColor: isDark ? '#059669' : '#10b981' }]} />
    <View style={styles.eventContent}>
      <Text style={[styles.eventDate, { color: isDark ? '#34d399' : '#059669' }]}>
        {format(parseISO(item.date), 'yyyy년 M월 d일 (EEE)', { locale: ko })}
      </Text>
      <Text style={[styles.eventTitle, { color: isDark ? '#ffffff' : '#111827' }]}>
        {item.title}
      </Text>
      {item.time && (
        <Text style={[styles.eventMeta, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
          🕐 {item.time}
        </Text>
      )}
      {item.location && (
        <Text style={[styles.eventMeta, { color: isDark ? '#9ca3af' : '#6b7280', marginTop: 4 }]}>
          📍 {item.location}
        </Text>
      )}
      {item.description && (
        <Text 
          style={[styles.eventDescription, { color: isDark ? '#6b7280' : '#6b7280' }]}
          numberOfLines={2}
        >
          {item.description}
        </Text>
      )}
    </View>
  </View>
), (prevProps, nextProps) => {
  // 커스텀 비교 함수 - 실제로 변경된 경우만 리렌더링
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.title === nextProps.item.title &&
    prevProps.item.date === nextProps.item.date &&
    prevProps.isDark === nextProps.isDark
  );
});

export default function EventListScreen({ navigation }: EventListScreenProps) {
  const [allEvents, setAllEvents] = useState<EventWithDate[]>([]);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      loadAllEvents();
    }, [])
  );

  const loadAllEvents = useCallback(async () => {
    const events = await loadEvents();
    const eventList: EventWithDate[] = [];
    
    Object.keys(events).forEach(date => {
      events[date].forEach(event => {
        eventList.push({
          ...event,
          date,
        });
      });
    });
    
    eventList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    setAllEvents(eventList);
  }, []);

  const isDark = useMemo(() => theme === 'dark', [theme]);

  // 메모이즈된 renderItem 함수
  const renderEvent = useCallback(({ item }: ListRenderItemInfo<EventWithDate>) => (
    <EventCard item={item} isDark={isDark} />
  ), [isDark]);

  // keyExtractor 최적화 - 안정적인 키 생성
  const keyExtractor = useCallback((item: EventWithDate) => 
    item.id || `${item.date}-${item.title}`, 
  []);

  // getItemLayout - 고정 높이 아이템의 경우 스크롤 성능 대폭 향상
  const getItemLayout = useCallback((_: any, index: number) => ({
    length: TOTAL_ITEM_HEIGHT,
    offset: TOTAL_ITEM_HEIGHT * index,
    index,
  }), []);

  return (
    <View style={[
      styles.container, 
      { 
        backgroundColor: isDark ? '#030712' : '#ffffff', 
        paddingTop: insets.top, 
        paddingBottom: insets.bottom, 
        paddingLeft: insets.left, 
        paddingRight: insets.right 
      }
    ]}>
      <View style={[styles.header, { backgroundColor: isDark ? '#030712' : '#ffffff' }]}>
        <Text style={[styles.headerTitle, { color: isDark ? '#ffffff' : '#111827' }]}>
          전체 이벤트
        </Text>
      </View>

      {allEvents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={[styles.emptyText, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
            등록된 이벤트가 없습니다
          </Text>
        </View>
      ) : (
        <FlatList
          data={allEvents}
          renderItem={renderEvent}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          // 성능 최적화 옵션
          removeClippedSubviews={true}
          maxToRenderPerBatch={15}
          windowSize={7}
          initialNumToRender={10}
          updateCellsBatchingPeriod={30}
          // 추가 최적화
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          legacyImplementation={false}
        />
      )}
    </View>
  );
}

// ==================== 스타일시트 (컴포넌트 외부 정의로 성능 최적화) ====================
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 76,
  },
  eventCard: {
    marginHorizontal: 16,
    marginBottom: ITEM_MARGIN_BOTTOM,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    height: ITEM_HEIGHT,
  },
  eventAccent: {
    height: 4,
  },
  eventContent: {
    padding: 16,
    flex: 1,
  },
  eventDate: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  eventMeta: {
    fontSize: 14,
  },
  eventDescription: {
    fontSize: 14,
    marginTop: 8,
  },
});
