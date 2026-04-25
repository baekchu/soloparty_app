import React, { useState, useMemo, useCallback, memo, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ListRenderItemInfo, Platform, RefreshControl, Animated, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns/format';
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
import { useToast } from '../contexts/ToastContext';
import useBookmarks from '../hooks/useBookmarks';
import { hapticLight } from '../utils/haptics';

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
  isBookmarked: boolean;
  onBookmark: () => void;
}

const EventCard = memo(({ item, isDark, onPress, isBookmarked, onBookmark }: EventCardProps) => {
  const c = isDark ? Colors.dark : Colors.light;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.eventCard, { backgroundColor: c.card }, isDark && styles.eventCardDark]}
      accessible={true}
      accessibilityLabel={`${item.title}, ${format(parseLocalDate(item.date), 'M월 d일', { locale: ko })}${item.time ? `, ${item.time}` : ''}${item.location ? `, ${item.location}` : ''}`}
      accessibilityRole="button"
      accessibilityHint="이벤트 상세 정보를 확인합니다"
    >
      <View style={styles.eventContent}>
        <View style={styles.eventTopRow}>
          <Text style={[styles.dateBadgeText, { color: isDark ? '#8888a0' : '#334155' }]}>
            {format(parseLocalDate(item.date), 'M/d (EEE)', { locale: ko })}
          </Text>
          {item.time && (
            <Text style={[styles.dotSeparator, { color: isDark ? '#5c5c74' : '#94a3b8' }]}>·</Text>
          )}
          {item.time && (
            <Text style={[styles.timeBadgeText, { color: isDark ? '#8888a0' : '#475569' }]}>
              {item.time}
            </Text>
          )}
        </View>
        <Text style={[styles.eventTitle, { color: c.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.eventMetaRow}>
          {item.subEvents && item.subEvents.length > 1 ? (
            item.subEvents.slice(0, 3).map((sub, si) => (
              <View key={si} style={[styles.metaChip, { backgroundColor: isDark ? Colors.dark.surfaceAlt : Colors.light.surfaceAlt, borderColor: isDark ? Colors.dark.border : Colors.light.borderLight }]}>
                <Text style={[styles.metaChipText, { color: c.textSecondary }]}>
                  {sub.location || sub.venue || `지점${si + 1}`}
                </Text>
              </View>
            ))
          ) : item.location ? (
            <View style={[styles.metaChip, { backgroundColor: isDark ? Colors.dark.surfaceAlt : Colors.light.surfaceAlt, borderColor: isDark ? Colors.dark.border : Colors.light.borderLight }]}>
              <Text style={[styles.metaChipText, { color: c.textSecondary }]}>
                {item.location}
              </Text>
            </View>
          ) : null}
        </View>
        {item.description && (
          <Text
            style={[styles.eventDescription, { color: c.textTertiary }]}
            numberOfLines={2}
          >
            {item.description}
          </Text>
        )}
      </View>
      <View style={styles.rightColumn}>
        <TouchableOpacity
          onPress={onBookmark}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.bookmarkBtn}
          accessibilityLabel={isBookmarked ? '찜 해제' : '찜 추가'}
          accessibilityRole="button"
        >
          <Text style={[styles.bookmarkIcon, { color: isBookmarked ? '#ec4899' : (isDark ? '#3a3a5a' : '#d1d5db') }]}>
            {isBookmarked ? '♥' : '♡'}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.chevron, { color: isDark ? '#5c5c74' : '#cbd5e1' }]}>›</Text>
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
    prevProps.isDark === nextProps.isDark &&
    prevProps.isBookmarked === nextProps.isBookmarked
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
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const bookmarked = isBookmarked(item.id, item.date);

  const handlePress = useCallback(() => {
    navigation.navigate('EventDetail', { event: item, date: item.date });
  }, [navigation, item]);

  const handleBookmark = useCallback(async () => {
    hapticLight();
    await toggleBookmark(item, item.date);
  }, [item, toggleBookmark]);

  return <EventCard item={item} isDark={isDark} onPress={handlePress} isBookmarked={bookmarked} onBookmark={handleBookmark} />;
});

// ==================== 상수 ====================
const ESTIMATED_ITEM_HEIGHT = 146; // 카드 높이 + 마진 (Spacing.md)

export default function EventListScreen({ navigation }: EventListScreenProps) {
  // 캐시가 있으면 스켈레톤 없이 즉시 렌더링
  const [allEvents, setAllEvents] = useState<EventWithDate[]>(_cachedEventList ?? []);
  const [isLoading, setIsLoading] = useState(_cachedEventList === null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { theme } = useTheme();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      loadAllEvents();
    }, [])
  );

  const loadAllEvents = useCallback(async () => {
    // 캐시가 없을 때만 스켈레톤 표시 (탭 전환 시 깜빡임 방지)
    if (_cachedEventList === null) setIsLoading(true);
    setLoadError(false);
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
      setLoadError(true);
      if (_cachedEventList === null) {
        setAllEvents([]);
      }
      showToast({ message: '데이터를 불러올 수 없어요', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  const isDark = useMemo(() => theme === 'dark', [theme]);
  const c = isDark ? Colors.dark : Colors.light;

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedQuery(text);
    }, 300);
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
    setDebouncedQuery('');
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, []);

  const filteredEvents = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return allEvents;
    return allEvents.filter(item =>
      item.title?.toLowerCase().includes(q) ||
      item.location?.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q)
    );
  }, [allEvents, debouncedQuery]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadAllEvents();
    setIsRefreshing(false);
  }, [loadAllEvents]);

  const renderEvent = useCallback(({ item }: ListRenderItemInfo<EventWithDate>) => (
    <EventCardWrapper item={item} isDark={isDark} navigation={navigation} />
  ), [isDark, navigation]);

  const keyExtractor = useCallback((item: EventWithDate, index: number) =>
    item.id || `${item.date}-${item.title}-${index}`,
  []);

  const searchHeader = useMemo(() => (
    <View style={[styles.searchContainer, { backgroundColor: isDark ? Colors.dark.surfaceAlt : '#f1f5f9', borderColor: isDark ? Colors.dark.border : Colors.light.border }]}>
      <Text style={[styles.searchIcon, { color: isDark ? '#5c5c74' : '#94a3b8' }]}>🔍</Text>
      <TextInput
        style={[styles.searchInput, { color: c.text }]}
        placeholder="제목, 장소 검색..."
        placeholderTextColor={isDark ? '#5c5c74' : '#94a3b8'}
        value={searchQuery}
        onChangeText={handleSearchChange}
        returnKeyType="search"
        clearButtonMode="never"
      />
      {searchQuery.length > 0 && (
        <TouchableOpacity
          onPress={handleSearchClear}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="검색어 지우기"
        >
          <Text style={[styles.searchClear, { color: isDark ? '#5c5c74' : '#94a3b8' }]}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  ), [isDark, c.text, searchQuery, handleSearchChange, handleSearchClear]);

  return (
    <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={[styles.header, { backgroundColor: c.background }]}>
        <Text style={[styles.headerTitle, { color: c.text }]}>
          전체 이벤트
        </Text>
        {!isLoading && (
          <Text style={[styles.headerCount, { color: c.textSecondary }]}>
            {filteredEvents.length}개
          </Text>
        )}
      </View>

      {isLoading ? (
        <EventListSkeleton count={8} />
      ) : loadError && allEvents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>😥</Text>
          <Text style={[styles.emptyText, { color: c.textSecondary }]}>
            데이터를 불러올 수 없어요
          </Text>
          <Text style={[styles.emptySubText, { color: c.textTertiary }]}>
            네트워크 연결을 확인해주세요
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: isDark ? Colors.primary : Colors.secondary }]}
            onPress={loadAllEvents}
            activeOpacity={0.7}
            accessibilityLabel="다시 시도"
            accessibilityRole="button"
          >
            <Text style={styles.retryButtonText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : allEvents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={[styles.emptyText, { color: c.textSecondary }]}>
            등록된 이벤트가 없어요
          </Text>
          <Text style={[styles.emptySubText, { color: c.textTertiary }]}>
            캘린더에서 이벤트를 확인해보세요
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: isDark ? Colors.primary : Colors.secondary }]}
            onPress={handleRefresh}
            activeOpacity={0.7}
            accessibilityLabel="새로고침"
            accessibilityRole="button"
          >
            <Text style={styles.retryButtonText}>새로고침</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredEvents}
          renderItem={renderEvent}
          keyExtractor={keyExtractor}
          ListHeaderComponent={searchHeader}
          ListEmptyComponent={
            debouncedQuery.trim() ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={[styles.emptyText, { color: c.textSecondary }]}>
                  검색 결과가 없어요
                </Text>
                <Text style={[styles.emptySubText, { color: c.textTertiary }]}>
                  다른 키워드로 검색해 보세요
                </Text>
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          getItemLayout={(_data, index) => ({
            length: ESTIMATED_ITEM_HEIGHT,
            offset: ESTIMATED_ITEM_HEIGHT * index,
            index,
          })}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={12}
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
  retryButton: {
    marginTop: Spacing.xl,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600' as const,
  },
  listContent: {
    paddingTop: Spacing.sm,
    paddingBottom: 76,
  },
  eventCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.xl,
    overflow: 'hidden' as const,
    flexDirection: 'row' as const,
    ...Shadows.sm,
  },
  eventCardDark: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  eventContent: {
    flex: 1,
    padding: Spacing.lg,
    paddingRight: Spacing.sm,
  },
  eventTopRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginBottom: Spacing.sm,
  },
  dateBadgeText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  dotSeparator: {
    fontSize: 14,
    fontWeight: '800' as const,
  },
  timeBadgeText: {
    fontSize: 13,
    fontWeight: '500' as const,
  },
  eventTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    lineHeight: 23,
    marginBottom: Spacing.sm,
  },
  eventMetaRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  metaChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  metaChipIcon: {
    fontSize: 10,
  },
  metaChipText: {
    fontSize: 11,
    fontWeight: '500' as const,
  },
  eventDescription: {
    fontSize: Typography.bodySm.fontSize,
    fontWeight: Typography.bodySm.fontWeight,
    marginTop: Spacing.xs,
    lineHeight: 19,
  },
  chevronContainer: {
    justifyContent: 'center' as const,
    paddingRight: Spacing.lg,
  },
  rightColumn: {
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: Spacing.lg,
    paddingRight: Spacing.lg,
    paddingLeft: Spacing.xs,
  },
  bookmarkBtn: {
    padding: 4,
    minWidth: 28,
    minHeight: 28,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  bookmarkIcon: {
    fontSize: 18,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300' as const,
  },
  searchContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400' as const,
    padding: 0,
  },
  searchClear: {
    fontSize: 14,
    marginLeft: 8,
    fontWeight: '600' as const,
  },
});
