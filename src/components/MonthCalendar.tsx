import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Dimensions, StyleSheet } from 'react-native';
import { EventsByDate, Event } from '../types';
import EventColorManager from '../utils/eventColorManager';
import { getHolidayName } from '../utils/koreanHolidays';

// ==================== 상수 정의 (컴포넌트 외부) ====================
const MONTH_NAMES = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'] as const;

interface MonthCalendarProps {
  year: number;
  month: number;
  events: EventsByDate;
  isDark: boolean;
  onDatePress?: (date: string) => void;
  selectedLocation?: string | null;
  selectedRegion?: string | null;
}

// 성능 최적화: 날짜 계산 함수를 컴포넌트 외부로 이동
const getDaysInMonth = (year: number, month: number) => {
  return new Date(year, month, 0).getDate();
};

const getFirstDayOfMonth = (year: number, month: number) => {
  return new Date(year, month - 1, 1).getDay();
};

// weeks 계산 캐시 (year-month 키) — 월 이동 시 재계산 제거
const weeksCache = new Map<string, Array<Array<{ day: number; isOtherMonth: boolean }>>>();

function calculateWeeks(year: number, month: number): Array<Array<{ day: number; isOtherMonth: boolean }>> {
  const key = `${year}-${month}`;
  const cached = weeksCache.get(key);
  if (cached) return cached;

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const weeks: Array<Array<{ day: number; isOtherMonth: boolean }>> = [];
  let currentDay = 1;
  let nextMonthDay = 1;

  const prevMonthDays = getDaysInMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1);
  const prevMonthStart = prevMonthDays - firstDay + 1;

  for (let weekIndex = 0; weekIndex < 6; weekIndex++) {
    const week: Array<{ day: number; isOtherMonth: boolean }> = [];

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const totalDayIndex = weekIndex * 7 + dayIndex;

      if (totalDayIndex < firstDay) {
        week.push({ day: prevMonthStart + totalDayIndex, isOtherMonth: true });
      } else if (currentDay <= daysInMonth) {
        week.push({ day: currentDay++, isOtherMonth: false });
      } else {
        week.push({ day: nextMonthDay++, isOtherMonth: true });
      }
    }

    weeks.push(week);
  }

  // 마지막 주가 전부 다음 달로만 채워진 경우 제거 (5주 달 다음 달 위야한 주 방지)
  if (weeks.length > 0 && weeks[weeks.length - 1].every(c => c.isOtherMonth)) {
    weeks.pop();
  }

  weeksCache.set(key, weeks);

  // 캐시 크기 제한 (최대 24개월 — 2년치)
  if (weeksCache.size > 24) {
    const firstKey = weeksCache.keys().next().value;
    if (firstKey) weeksCache.delete(firstKey);
  }

  return weeks;
}

// 컴포넌트 외부로 이동 — 매 렌더마다 원시 함수 재생성 방지
const getTodayStr = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

// 성능 최적화: 빈 배열 상수 (참조 안정성 보장 → React.memo 비교 최적화)
const EMPTY_EVENTS: Event[] = [];
const EMPTY_COLORS: string[] = [];

// 모듈 레벨 색상 캐시 (인스턴스 간 공유 — 월 이동 시 동일 이벤트 재계산 완전 제거)
// 키: `${groupId||eventId}_${0|1}` (0=라이트, 1=다크)
const _colorCache = new Map<string, string>();
const COLOR_CACHE_MAX = 2000; // 이벤트 ~1000개 × 2(dark/light)

// 매일 다른 순서로 이벤트를 보여주기 위한 결정론적 셔플 유틸
// - 같은 날 같은 날짜 셀은 항상 동일한 순서 (일관성)
// - 날이 바뀌면 순서가 바뀜 (신선함)
function fnvHash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const copy = [...arr];
  let s = seed >>> 0;
  for (let i = copy.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0; // LCG
    const j = s % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 성능 최적화: 개별 셀을 React.memo로 분리 → 변경되지 않은 셀 재렌더 방지
const DayCell = React.memo(function DayCell({
  day, weekIndex, dayIndex, dateString, dayEvents, dayColors,
  isToday, onDatePress, cellStyles, dateTextStyles,
  holidayTextStyle, eventTextStyle, themeColors,
}: {
  day: number; weekIndex: number; dayIndex: number;
  dateString: string; dayEvents: Event[]; dayColors: string[];
  isToday: boolean; onDatePress?: (date: string) => void;
  cellStyles: any; dateTextStyles: any; holidayTextStyle: any;
  eventTextStyle: any; themeColors: any;
}) {
  const isSunday = dayIndex === 0;
  const isSaturday = dayIndex === 6;
  const holidayName = getHolidayName(dateString);
  const isHolidayDay = !!holidayName && !isSunday;

  const handlePress = React.useCallback(() => {
    onDatePress?.(dateString);
  }, [onDatePress, dateString]);

  const dateStyle = isToday
    ? dateTextStyles.today
    : (isSunday || isHolidayDay)
      ? dateTextStyles.sunday
      : isSaturday
        ? dateTextStyles.saturday
        : dateTextStyles.normal;

  return (
    <TouchableOpacity
      key={`${weekIndex}-${dayIndex}`}
      style={cellStyles.cell}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={cellStyles.innerView}>
        <View style={[monthStyles.dateHeader, { height: cellStyles.dateHeaderHeight, marginTop: cellStyles.dateHeaderMarginTop }]}>
          <Text style={dateStyle}>{day}</Text>
          {isToday && (
            <View style={{
              width: cellStyles.todayDotSize,
              height: cellStyles.todayDotSize,
              borderRadius: cellStyles.todayDotSize / 2,
              backgroundColor: themeColors.todayBg,
              marginTop: 2,
            }} />
          )}
          {holidayName && (
            <Text numberOfLines={1} style={holidayTextStyle}>
              {holidayName.length > 5 ? holidayName.substring(0, 5) : holidayName}
            </Text>
          )}
        </View>
        <View style={monthStyles.eventList}>
          {(() => {
            // +N 배지가 필요할 때는 이벤트 1개를 줄여 배지 공간 확보
            // (overflow:hidden 셀에서 배지가 잘리는 문제 방지)
            const hasMore = dayEvents.length > cellStyles.maxVisibleEvents;
            const visibleCount = hasMore
              ? cellStyles.maxVisibleEvents - 1
              : dayEvents.length;
            const moreCount = dayEvents.length - visibleCount;
            return (
              <>
                {dayEvents.slice(0, visibleCount).map((event, idx) => (
                  <View
                    key={event.id}
                    style={[monthStyles.eventItem, { backgroundColor: dayColors[idx] ?? themeColors.eventFallbackBg, height: cellStyles.eventHeight }]}
                  >
                    <Text style={eventTextStyle} numberOfLines={1}>
                      {event.title}
                    </Text>
                  </View>
                ))}
                {hasMore && (
                  <View style={[monthStyles.moreEventsContainer, { backgroundColor: themeColors.moreIndicatorBg }]}>
                    <Text style={[monthStyles.moreEventsText, { fontSize: cellStyles.moreFontSize, color: themeColors.moreTextColor }]}>
                      +{moreCount}
                    </Text>
                  </View>
                )}
              </>
            );
          })()}
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default React.memo(function MonthCalendar({ year, month, events, isDark, onDatePress, selectedLocation, selectedRegion }: MonthCalendarProps) {
  
  // location과 region으로 필터링된 이벤트 (최적화)
  const filteredEvents = useMemo(() => {
    if (!selectedLocation && !selectedRegion) return events;
    
    return Object.entries(events).reduce((acc, [date, dateEvents]) => {
      const filtered = dateEvents.filter(event => {
        if (selectedRegion && event.region !== selectedRegion) return false;
        if (selectedLocation && event.location !== selectedLocation) return false;
        return true;
      });
      
      if (filtered.length > 0) acc[date] = filtered;
      return acc;
    }, {} as EventsByDate);
  }, [events, selectedLocation, selectedRegion]);

  // 날짜별 이벤트를 오늘 날짜 기반 시드로 셔플 → 매일 다른 이벤트가 상단 3개에 표시됨
  // 셔플 전에 id 기준 정렬 → 서버에서 순서가 달라져도 항상 동일한 입력 보장 (새로고침해도 고정)
  const shuffledEvents = useMemo(() => {
    const todaySeed = fnvHash(getTodayStr());
    const result: EventsByDate = {};
    for (const [dateString, dayEvents] of Object.entries(filteredEvents)) {
      if (dayEvents.length <= 1) {
        result[dateString] = dayEvents;
      } else {
        const stable = [...dayEvents].sort((a, b) =>
          (a.id ?? a.title ?? '').localeCompare(b.id ?? b.title ?? '')
        );
        result[dateString] = seededShuffle(stable, fnvHash(dateString) ^ todaySeed);
      }
    }
    return result;
  }, [filteredEvents]);

  const [dimensions, setDimensions] = React.useState(() => {
    const { width, height } = Dimensions.get('window');
    const cellWidth = width / 7;
    // 화면 크기에 비례하여 셀 높이 동적 계산
    const isSmallScreen = height < 700;
    const isMediumScreen = height >= 700 && height < 850;
    
    let cellHeight;
    if (isSmallScreen) {
      // 작은 화면 — 이벤트 3개 + 배지 확보
      cellHeight = Math.max(height * 0.10, 82);
    } else if (isMediumScreen) {
      // 중간 화면
      cellHeight = Math.max(height * 0.10, 84);
    } else {
      // 큰 화면 — 이벤트 4개 + 배지 확보
      cellHeight = Math.max(height * 0.115, 100);
    }
    
    return { cellWidth, cellHeight };
  });

  // dimensions를 ref로도 유지 (renderDay deps에서 제거 → 불필요한 42셀 재생성 방지)
  const dimensionsRef = useRef(dimensions);
  dimensionsRef.current = dimensions;

  // 치수 의존 스타일을 useMemo로 미리 계산 (renderDay 호출마다 새 객체 생성 방지)
  const cellStyles = useMemo(() => {
    const { cellWidth, cellHeight } = dimensions;
    const isSmall = cellWidth < 50;
    const eventHeight = Math.max(Math.min(cellHeight / 6, 14), 11);
    const fontSize = isSmall ? 12 : 15;
    // 날짜 숫자 아래 오늘 점 표시: 텍스트 줄 높이 + 점(4px) + 간격(2px)
    const dotSpace = 6;
    const dateHeaderHeight = Math.max(fontSize + dotSpace + 2, cellHeight < 70 ? 24 : cellHeight < 80 ? 26 : 28);
    return {
      emptyCell: { width: cellWidth, height: cellHeight, backgroundColor: 'transparent' as const },
      cell: { width: cellWidth, height: cellHeight, borderBottomWidth: 0 as const, backgroundColor: 'transparent' as const },
      innerView: { padding: isSmall ? 1 : 2, height: '100%' as const, flexDirection: 'column' as const },
      fontSize,
      holidayFontSize: cellWidth < 46 ? 5 : 6,
      eventFontSize: isSmall ? 7 : Math.min(8, eventHeight * 0.6),
      moreFontSize: isSmall ? 7 : 8,
      eventHeight,
      dateHeaderHeight,
      dateHeaderMarginTop: cellHeight < 70 ? 1 : cellHeight < 80 ? 2 : 3,
      todayDotSize: isSmall ? 3 : 4,
      maxVisibleEvents: cellHeight >= 100 ? 4 : 3, // 큰화면 4개, 작은화면 3개
    };
  }, [dimensions]);

  // 테마 의존 색상을 useMemo로 미리 계산
  const themeColors = useMemo(() => ({
    todayBg: isDark ? '#a78bfa' : '#ec4899',
    text: isDark ? '#c0c0d0' : '#1f2937',
    eventText: isDark ? '#ffffff' : '#374151',
    moreIndicatorBg: isDark ? '#1e1e32' : '#f3f4f6',
    moreTextColor: isDark ? '#a0a0b8' : '#4b5563',
    eventFallbackBg: isDark ? '#2a2a44' : '#e2e8f0', // 폴백 배경 (다크: 진한 회색, 라이트: 연한 회색)
  }), [isDark]);

  // renderDay 내부 반복 생성 방지: 텍스트 스타일을 미리 계산
  const dateTextStyles = useMemo(() => ({
    // 원 배경 제거 → 텍스트 자체를 강조색으로 표시 (아래 점과 조합)
    today: { fontSize: cellStyles.fontSize, fontWeight: '800' as const, color: themeColors.todayBg },
    normal: { fontSize: cellStyles.fontSize, fontWeight: '500' as const, color: themeColors.text },
    sunday: { fontSize: cellStyles.fontSize, fontWeight: '500' as const, color: '#ef4444' },
    saturday: { fontSize: cellStyles.fontSize, fontWeight: '500' as const, color: '#3b82f6' },
  }), [cellStyles.fontSize, themeColors.text, themeColors.todayBg]);

  const holidayTextStyle = useMemo(() => ({
    fontSize: cellStyles.holidayFontSize,
    color: '#ef4444' as const,
    fontWeight: '700' as const,
    lineHeight: 8,
    textAlign: 'center' as const,
    maxWidth: dimensions.cellWidth - 4,
  }), [cellStyles.holidayFontSize, dimensions.cellWidth]);

  const eventTextStyle = useMemo(() => ({
    color: isDark ? '#ffffff' : '#1e293b',
    fontSize: cellStyles.eventFontSize,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
    textShadowColor: isDark ? 'rgba(0,0,0,0.6)' : 'transparent',
    textShadowOffset: isDark ? { width: 0, height: 1 } : { width: 0, height: 0 },
    textShadowRadius: isDark ? 2 : 0,
  }), [isDark, cellStyles.eventFontSize]);

  // todayCircle 제거됨 — DayCell 내부에서 점(dot)으로 대체

  // 성능 최적화: 고유 이벤트 색상을 한 번만 계산 후 재사용 (중복 호출 90% 감소)
  // _colorCache: 모듈 레벨 공유 → 동일 이벤트는 월 이동 시에도 재계산 없음
  const dayColorsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const dateString of Object.keys(shuffledEvents)) {
      const dayEvents = shuffledEvents[dateString];
      map[dateString] = dayEvents.slice(0, 4).map((event, idx) => {
        const cacheKey = `${event.groupId || event.id || `${dateString}-${idx}`}_${isDark ? 1 : 0}`;
        let color = _colorCache.get(cacheKey);
        if (!color) {
          color = EventColorManager.getColorForEvent(
            event.id || `${dateString}-${idx}`,
            event.title, dateString, shuffledEvents, dayEvents, idx, isDark, event.groupId
          );
          _colorCache.set(cacheKey, color);
          // LRU 근사: 최대 초과 시 삽입 순서 첫 항목 제거
          if (_colorCache.size > COLOR_CACHE_MAX) {
            const firstKey = _colorCache.keys().next().value;
            if (firstKey) _colorCache.delete(firstKey);
          }
        }
        return color;
      });
    }
    return map;
  }, [shuffledEvents, isDark]);

  React.useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      const { width, height } = window;
      const cellWidth = width / 7;
      
      const isSmallScreen = height < 700;
      const isMediumScreen = height >= 700 && height < 850;
      
      let cellHeight;
    if (isSmallScreen) {
      cellHeight = Math.max(height * 0.10, 82);
    } else if (isMediumScreen) {
      cellHeight = Math.max(height * 0.10, 84);
    } else {
      cellHeight = Math.max(height * 0.115, 100);
    }
    
    setDimensions({ cellWidth, cellHeight });
    });

    return () => subscription?.remove();
  }, []);

  // useMemo로 계산 값 메모이제이션 (성능 최적화)
  // weeks 계산 (외부 캐싱 함수 사용 — 월 이동 시 재계산 제거)
  const weeks = useMemo(() => calculateWeeks(year, month), [year, month]);

  // 날짜 문자열 사전 계산 (42셀 × padStart 반복 제거 — month/year 변경 시에만 재계산)
  const dateStringMap = useMemo(() => {
    const mPad = String(month).padStart(2, '0');
    const map = new Map<number, string>();
    for (const week of weeks) {
      for (const cell of week) {
        if (!cell.isOtherMonth && !map.has(cell.day)) {
          map.set(cell.day, `${year}-${mPad}-${String(cell.day).padStart(2, '0')}`);
        }
      }
    }
    return map;
  }, [year, month, weeks]);
  
  // 오늘 날짜 (자정 넘김 감지)
  const [todayString, setTodayString] = useState(getTodayStr);
  
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const msUntilMidnight = midnight.getTime() - now.getTime();
    const timer = setTimeout(() => {
      setTodayString(getTodayStr());
    }, msUntilMidnight + 500);
    return () => clearTimeout(timer);
  }, [todayString]);

  return (
    <View style={[monthStyles.container, { backgroundColor: isDark ? '#0c0c16' : '#ffffff' }]}>
      {/* 월 헤더 */}
      <View style={[
        monthStyles.monthHeader,
        { 
          backgroundColor: isDark ? '#0c0c16' : '#ffffff',
          borderBottomColor: isDark ? '#1e1e32' : '#e5e7eb',
        }
      ]}>
        <Text style={[monthStyles.monthTitle, { color: isDark ? '#eaeaf2' : '#0f172a' }]}>
          {MONTH_NAMES[month - 1]}
        </Text>
      </View>

      {/* 날짜 그리드 */}
      <View>
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={monthStyles.weekRow}>
            {week.map((cell, dayIndex) => {
              if (cell.isOtherMonth) {
                return (
                  <View key={`empty-${weekIndex}-${dayIndex}`} style={cellStyles.emptyCell}>
                    <Text style={{
                      textAlign: 'center',
                      fontSize: cellStyles.fontSize,
                      fontWeight: '400',
                      color: isDark ? '#3a3a5a' : '#cbd5e1',
                      marginTop: cellStyles.dateHeaderMarginTop + 2,
                    }}>
                      {cell.day}
                    </Text>
                  </View>
                );
              }
              const dateString = dateStringMap.get(cell.day)!;
              return (
                <DayCell
                  key={`${weekIndex}-${dayIndex}`}
                  day={cell.day}
                  weekIndex={weekIndex}
                  dayIndex={dayIndex}
                  dateString={dateString}
                  dayEvents={shuffledEvents[dateString] || EMPTY_EVENTS}
                  dayColors={dayColorsMap[dateString] || EMPTY_COLORS}
                  isToday={dateString === todayString}
                  onDatePress={onDatePress}
                  cellStyles={cellStyles}
                  dateTextStyles={dateTextStyles}
                  holidayTextStyle={holidayTextStyle}
                  eventTextStyle={eventTextStyle}
                  themeColors={themeColors}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
});

// ==================== 스타일시트 (성능 최적화) ====================
const monthStyles = StyleSheet.create({
  container: {},
  monthHeader: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    borderBottomWidth: 0,
    backgroundColor: 'transparent',
  },
  dateHeader: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    // height / marginTop은 cellStyles에서 동적으로 주입 (작은 화면 겹침 방지)
  },
  eventList: {
    flex: 1,
    gap: 1,
    overflow: 'hidden',
  },
  eventItem: {
    borderRadius: 2,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  moreEventsContainer: {
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
    alignSelf: 'flex-start',
    marginTop: 1,
  },
  moreEventsText: {
    fontWeight: '800',
  },
});
