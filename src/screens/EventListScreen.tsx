import React, { useState, useMemo, useCallback, memo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ListRenderItemInfo, Platform, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { loadEvents } from '../utils/storage';
import { Event, EventsByDate } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../types';
import { CompositeNavigationProp } from '@react-navigation/native';
import { Colors, Radius, Shadows, Typography, Spacing } from '../utils/designSystem';
import { parseLocalDate } from '../utils/sanitize';
import { EventListSkeleton } from '../components/SkeletonLoader';

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

// ==================== 메모이즈된 이벤트 카드 컴포넌트 ====================
interface EventCardProps {
  item: EventWithDate;
  isDark: boolean;
  onPress: () => void;
}

const EventCard = memo(({ item, isDark, onPress }: EventCardProps) => {
  const c = isDark ? Colors.dark : Colors.light;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.eventCard, { backgroundColor: c.card }, isDark && styles.eventCardDark]}
    >
      <View style={[styles.eventAccent, { backgroundColor: isDark ? Colors.primary : Colors.secondary }]} />
      <View style={styles.eventContent}>
        <Text style={[styles.eventDate, { color: isDark ? Colors.primaryLight : Colors.secondary }]}>
          {format(parseLocalDate(item.date), 'yyyy년 M월 d일 (EEE)', { locale: ko })}
        </Text>
        <Text style={[styles.eventTitle, { color: c.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.eventMetaRow}>
          {item.time && (
            <View style={[styles.metaChip, { backgroundColor: isDark ? Colors.dark.surfaceAlt : Colors.light.surfaceAlt }]}>
              <Text style={[styles.metaChipText, { color: c.textSecondary }]}>
                🕐 {item.time}
              </Text>
            </View>
          )}
          {item.subEvents && item.subEvents.length > 1 ? (
            item.subEvents.map((sub, si) => (
              <View key={si} style={[styles.metaChip, { backgroundColor: isDark ? Colors.dark.surfaceAlt : Colors.light.surfaceAlt }]}>
                <Text style={[styles.metaChipText, { color: c.textSecondary }]}>
                  📍 {sub.location || sub.venue || `지점${si + 1}`}
                </Text>
              </View>
            ))
          ) : item.location ? (
            <View style={[styles.metaChip, { backgroundColor: isDark ? Colors.dark.surfaceAlt : Colors.light.surfaceAlt }]}>
              <Text style={[styles.metaChipText, { color: c.textSecondary }]}>
                📍 {item.location}
              </Text>
            </View>
          ) : null}
        </View>
        {item.description && (
          <Text
            style={[styles.eventDescription, { color: c.textSecondary }]}
            numberOfLines={2}
          >
            {item.description}
          </Text>
        )}
      </View>
      <View style={styles.chevronContainer}>
        <Text style={[styles.chevron, { color: c.textTertiary }]}>›</Text>
      </View>
    </TouchableOpacity>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.title === nextProps.item.title &&
    prevProps.item.date === nextProps.item.date &&
    prevProps.item.time === nextProps.item.time &&
    prevProps.item.location === nextProps.item.location &&
    prevProps.item.description === nextProps.item.description &&
    prevProps.isDark === nextProps.isDark
  );
});

// 모듈 레벨 캐시 — 탭 이동 시 스켈레톤 없이 즉시 표시
let _cachedEventList: EventWithDate[] | null = null;
let _cachedSourceRef: EventsByDate | null = null; // 원본 참조 비교용

// ==================== 이벤트 카드 wrapper (onPress ref 분리 — 인라인 함수 생성 방지) ====================
interface EventCardWrapperProps {
  item: EventWithDate;
  isDark: boolean;
  navigation: EventListScreenNavigationProp;
}
const EventCardWrapper = memo(({ item, isDark, navigation }: EventCardWrapperProps) => {
  const handlePress = useCallback(() => {
    navigation.navigate('EventDetail', { event: item, date: item.date });
  }, [navigation, item]);
  return <EventCard item={item} isDark={isDark} onPress={handlePress} />;
});

export default function EventListScreen({ navigation }: EventListScreenProps) {
  // 캐시가 있으면 스켈레톤 없이 즉시 렌더링
  const [allEvents, setAllEvents] = useState<EventWithDate[]>(_cachedEventList ?? []);
  const [isLoading, setIsLoading] = useState(_cachedEventList === null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      loadAllEvents();
    }, [])
  );

  const loadAllEvents = useCallback(async () => {
    // 캐시가 없을 때만 스켈레톤 표시 (탭 전환 시 깜빡임 방지)
    if (_cachedEventList === null) setIsLoading(true);
    try {
      const events = await loadEvents();

      // 원본 데이터 참조가 동일하면 재정렬 스킵 (탭 전환 시 300-500ms 절약)
      if (events === _cachedSourceRef && _cachedEventList) {
        setAllEvents(_cachedEventList);
        setIsLoading(false);
        return;
      }

      const eventList: EventWithDate[] = [];

      Object.keys(events).forEach(date => {
        const dateEvents = events[date];
        if (!Array.isArray(dateEvents)) return;
        dateEvents.forEach(event => {
          eventList.push({ ...event, date });
        });
      });

      // 날짜 파싱 결과 캐시 (동일 날짜 반복 파싱 방지)
      const dateCache = new Map<string, number>();
      const getTs = (d: string) => {
        let ts = dateCache.get(d);
        if (ts === undefined) {
          ts = parseLocalDate(d).getTime();
          dateCache.set(d, ts);
        }
        return ts;
      };
      eventList.sort((a, b) => getTs(a.date) - getTs(b.date));
      _cachedEventList = eventList; // 모듈 레벨 캐시 갱신
      _cachedSourceRef = events; // 원본 참조 저장
      setAllEvents(eventList);
    } catch {
      // 로드 실패 시 빈 목록 유지
      setAllEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const isDark = useMemo(() => theme === 'dark', [theme]);
  const c = isDark ? Colors.dark : Colors.light;

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadAllEvents();
    setIsRefreshing(false);
  }, [loadAllEvents]);

  const renderEvent = useCallback(({ item }: ListRenderItemInfo<EventWithDate>) => (
    <EventCardWrapper item={item} isDark={isDark} navigation={navigation} />
  ), [isDark, navigation]);

  const keyExtractor = useCallback((item: EventWithDate) =>
    item.id || `${item.date}-${item.title}`,
  []);

  return (
    <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={[styles.header, { backgroundColor: c.background }]}>
        <Text style={[styles.headerTitle, { color: c.text }]}>
          전체 이벤트
        </Text>
        {!isLoading && (
          <Text style={[styles.headerCount, { color: c.textSecondary }]}>
            {allEvents.length}개
          </Text>
        )}
      </View>

      {isLoading ? (
        <EventListSkeleton count={8} />
      ) : allEvents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={[styles.emptyText, { color: c.textSecondary }]}>
            등록된 이벤트가 없습니다
          </Text>
          <Text style={[styles.emptySubText, { color: c.textTertiary }]}>
            캘린더에서 이벤트를 확인해보세요
          </Text>
        </View>
      ) : (
        <FlatList
          data={allEvents}
          renderItem={renderEvent}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={8}
          updateCellsBatchingPeriod={50}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={isDark ? '#a78bfa' : '#ec4899'}
              colors={['#ec4899', '#a78bfa']}
            />
          }
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  headerTitle: {
    fontSize: Typography.h2.fontSize,
    fontWeight: Typography.h2.fontWeight,
    lineHeight: Typography.h2.lineHeight,
  },
  headerCount: {
    fontSize: Typography.bodySm.fontSize,
    fontWeight: Typography.bodySm.fontWeight,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: Spacing.lg,
  },
  emptyText: {
    fontSize: Typography.body.fontSize,
    fontWeight: Typography.body.fontWeight,
    textAlign: 'center' as const,
    marginBottom: Spacing.xs,
  },
  emptySubText: {
    fontSize: Typography.bodySm.fontSize,
    fontWeight: Typography.bodySm.fontWeight,
    textAlign: 'center' as const,
  },
  listContent: {
    paddingTop: Spacing.sm,
    paddingBottom: 76,
  },
  eventCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    overflow: 'hidden' as const,
    flexDirection: 'row' as const,
    ...Shadows.sm,
  },
  eventCardDark: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  eventAccent: {
    width: 4,
  },
  eventContent: {
    flex: 1,
    padding: Spacing.lg,
  },
  eventDate: {
    fontSize: Typography.caption.fontSize,
    fontWeight: Typography.caption.fontWeight,
    marginBottom: Spacing.sm,
  },
  eventTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  eventMetaRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  metaChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  metaChipText: {
    fontSize: Typography.tiny.fontSize,
    fontWeight: Typography.tiny.fontWeight,
  },
  eventDescription: {
    fontSize: Typography.bodySm.fontSize,
    fontWeight: Typography.bodySm.fontWeight,
    marginTop: Spacing.xs,
  },
  chevronContainer: {
    justifyContent: 'center' as const,
    paddingRight: Spacing.md,
  },
  chevron: {
    fontSize: 24,
    fontWeight: '300' as const,
  },
});
