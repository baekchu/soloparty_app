import React, { useState, useMemo, useCallback, memo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ListRenderItemInfo } from 'react-native';
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
import { Colors, Radius, Shadows, Typography, Spacing } from '../utils/designSystem';

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
          {format(parseISO(item.date), 'yyyy년 M월 d일 (EEE)', { locale: ko })}
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
          {item.location && (
            <View style={[styles.metaChip, { backgroundColor: isDark ? Colors.dark.surfaceAlt : Colors.light.surfaceAlt }]}>
              <Text style={[styles.metaChipText, { color: c.textSecondary }]}>
                📍 {item.location}
              </Text>
            </View>
          )}
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
        eventList.push({ ...event, date });
      });
    });

    eventList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    setAllEvents(eventList);
  }, []);

  const isDark = useMemo(() => theme === 'dark', [theme]);
  const c = isDark ? Colors.dark : Colors.light;

  const renderEvent = useCallback(({ item }: ListRenderItemInfo<EventWithDate>) => (
    <EventCard
      item={item}
      isDark={isDark}
      onPress={() => navigation.navigate('EventDetail', { event: item, date: item.date })}
    />
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
        <Text style={[styles.headerCount, { color: c.textSecondary }]}>
          {allEvents.length}개
        </Text>
      </View>

      {allEvents.length === 0 ? (
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
          maxToRenderPerBatch={15}
          windowSize={7}
          initialNumToRender={10}
          updateCellsBatchingPeriod={30}
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
