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

// 컴포넌트 외부로 이동 — 매 렌더마다 원시 함수 재생성 방지
const getTodayStr = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

// 성능 최적화: 빈 배열 상수 (참조 안정성 보장 → React.memo 비교 최적화)
const EMPTY_EVENTS: Event[] = [];
const EMPTY_COLORS: string[] = [];

// 성능 최적화: 개별 셀을 React.memo로 분리 → 변경되지 않은 셀 재렌더 방지
const DayCell = React.memo(function DayCell({
  day, weekIndex, dayIndex, dateString, dayEvents, dayColors,
  isToday, onDatePress, cellStyles, dateTextStyles,
  holidayTextStyle, eventTextStyle, todayCircleStyle, themeColors,
}: {
  day: number; weekIndex: number; dayIndex: number;
  dateString: string; dayEvents: Event[]; dayColors: string[];
  isToday: boolean; onDatePress?: (date: string) => void;
  cellStyles: any; dateTextStyles: any; holidayTextStyle: any;
  eventTextStyle: any; todayCircleStyle: any; themeColors: any;
}) {
  const isSunday = dayIndex === 0;
  const isSaturday = dayIndex === 6;
  const holidayName = getHolidayName(dateString);
  const isHolidayDay = !!holidayName && !isSunday;

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
      onPress={() => onDatePress?.(dateString)}
      activeOpacity={0.7}
    >
      <View style={cellStyles.innerView}>
        <View style={monthStyles.dateHeader}>
          <View style={isToday ? todayCircleStyle : undefined}>
            <Text style={dateStyle}>{day}</Text>
          </View>
          {holidayName && (
            <Text numberOfLines={1} style={holidayTextStyle}>
              {holidayName.length > 5 ? holidayName.substring(0, 5) : holidayName}
            </Text>
          )}
        </View>
        <View style={monthStyles.eventList}>
          {dayEvents.slice(0, 3).map((event, idx) => (
            <View
              key={event.id}
              style={[monthStyles.eventItem, { backgroundColor: dayColors[idx], height: cellStyles.eventHeight }]}
            >
              <Text style={eventTextStyle} numberOfLines={1}>
                {event.title}
              </Text>
            </View>
          ))}
          {dayEvents.length > 3 && (
            <View style={[monthStyles.moreEventsContainer, { backgroundColor: themeColors.moreIndicatorBg }]}>
              <Text style={[monthStyles.moreEventsText, { fontSize: cellStyles.moreFontSize, color: themeColors.moreTextColor }]}>
                +{dayEvents.length - 3}
              </Text>
            </View>
          )}
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
  
  const [dimensions, setDimensions] = React.useState(() => {
    const { width, height } = Dimensions.get('window');
    const cellWidth = width / 7;
    // 화면 크기에 비례하여 셀 높이 동적 계산
    const isSmallScreen = height < 700;
    const isMediumScreen = height >= 700 && height < 850;
    
    let cellHeight;
    if (isSmallScreen) {
      // 작은 화면 (예: iPhone SE)
      cellHeight = Math.max(height * 0.09, 65);
    } else if (isMediumScreen) {
      // 중간 화면 (예: iPhone 12, 13)
      cellHeight = Math.max(height * 0.1, 75);
    } else {
      // 큰 화면 (예: iPhone 14 Pro Max, 태블릿)
      cellHeight = Math.max(height * 0.11, 85);
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
    const circleSize = isSmall ? 22 : 25;
    const eventHeight = Math.max(Math.min(cellHeight / 6, 14), 11);
    return {
      emptyCell: { width: cellWidth, height: cellHeight, backgroundColor: 'transparent' as const },
      cell: { width: cellWidth, height: cellHeight, borderBottomWidth: 0 as const, backgroundColor: 'transparent' as const },
      innerView: { padding: isSmall ? 1 : 2, height: '100%' as const, flexDirection: 'column' as const },
      todayCircle: {
        width: circleSize, height: circleSize,
        borderRadius: isSmall ? 11 : 13,
        alignItems: 'center' as const, justifyContent: 'center' as const,
      },
      fontSize: isSmall ? 12 : 15,
      holidayFontSize: cellWidth < 46 ? 5 : 6,
      // eventHeight를 미리 계산해 글자 크기에 반영 (이전 코드의 Math.min(8, eventHeight*0.6) 복원)
      eventFontSize: isSmall ? 7 : Math.min(8, eventHeight * 0.6),
      moreFontSize: isSmall ? 7 : 8,
      eventHeight,
    };
  }, [dimensions]);

  // 테마 의존 색상을 useMemo로 미리 계산
  const themeColors = useMemo(() => ({
    todayBg: isDark ? '#a78bfa' : '#ec4899',
    text: isDark ? '#e5e7eb' : '#1f2937',
    eventText: isDark ? '#ffffff' : '#374151',
    moreIndicatorBg: isDark ? '#374151' : '#f3f4f6',
    moreTextColor: isDark ? '#d1d5db' : '#4b5563',
  }), [isDark]);

  // renderDay 내부 반복 생성 방지: 텍스트 스타일을 미리 계산
  const dateTextStyles = useMemo(() => ({
    today: { fontSize: cellStyles.fontSize, fontWeight: '800' as const, color: '#ffffff' },
    normal: { fontSize: cellStyles.fontSize, fontWeight: '500' as const, color: themeColors.text },
    sunday: { fontSize: cellStyles.fontSize, fontWeight: '500' as const, color: '#ef4444' },
    saturday: { fontSize: cellStyles.fontSize, fontWeight: '500' as const, color: '#3b82f6' },
  }), [cellStyles.fontSize, themeColors.text]);

  const holidayTextStyle = useMemo(() => ({
    fontSize: cellStyles.holidayFontSize,
    color: '#ef4444' as const,
    fontWeight: '700' as const,
    lineHeight: 8,
    textAlign: 'center' as const,
    maxWidth: dimensions.cellWidth - 4,
  }), [cellStyles.holidayFontSize, dimensions.cellWidth]);

  const eventTextStyle = useMemo(() => ({
    color: themeColors.eventText,
    fontSize: cellStyles.eventFontSize,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  }), [themeColors.eventText, cellStyles.eventFontSize]);

  const todayCircleStyle = useMemo(() => (
    [cellStyles.todayCircle, { backgroundColor: themeColors.todayBg }]
  ), [cellStyles.todayCircle, themeColors.todayBg]);

  // 성능 최적화: EventColorManager 색상을 부모에서 한 번만 계산 (셀별 반복 계산 제거)
  const dayColorsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const dateString of Object.keys(filteredEvents)) {
      const dayEvents = filteredEvents[dateString];
      map[dateString] = dayEvents.slice(0, 3).map((event, idx) =>
        EventColorManager.getColorForEvent(
          event.id || `${dateString}-${idx}`,
          event.title, dateString, filteredEvents, dayEvents, idx, isDark, event.groupId
        )
      );
    }
    return map;
  }, [filteredEvents, isDark]);

  React.useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      const { width, height } = window;
      const cellWidth = width / 7;
      
      const isSmallScreen = height < 700;
      const isMediumScreen = height >= 700 && height < 850;
      
      let cellHeight;
      if (isSmallScreen) {
        cellHeight = Math.max(height * 0.09, 65);
      } else if (isMediumScreen) {
        cellHeight = Math.max(height * 0.1, 75);
      } else {
        cellHeight = Math.max(height * 0.11, 85);
      }
      
      setDimensions({ cellWidth, cellHeight });
    });

    return () => subscription?.remove();
  }, []);

  // useMemo로 계산 값 메모이제이션 (성능 최적화)
  const daysInMonth = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const firstDay = useMemo(() => getFirstDayOfMonth(year, month), [year, month]);
  
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

  const renderWeeks = useCallback(() => {
    const weeks: Array<Array<{ day: number; isOtherMonth: boolean }>> = [];
    let currentDay = 1;
    let nextMonthDay = 1;
    
    // 이전 달의 마지막 날짜들
    const prevMonthDays = getDaysInMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1);
    const prevMonthStart = prevMonthDays - firstDay + 1;
    
    // 6주(42일)를 모두 채움
    for (let weekIndex = 0; weekIndex < 6; weekIndex++) {
      const week: Array<{ day: number; isOtherMonth: boolean }> = [];
      
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const totalDayIndex = weekIndex * 7 + dayIndex;
        
        if (totalDayIndex < firstDay) {
          // 이전 달
          week.push({ day: prevMonthStart + totalDayIndex, isOtherMonth: true });
        } else if (currentDay <= daysInMonth) {
          // 현재 달
          week.push({ day: currentDay++, isOtherMonth: false });
        } else {
          // 다음 달
          week.push({ day: nextMonthDay++, isOtherMonth: true });
        }
      }
      
      weeks.push(week);
    }

    return weeks;
  }, [daysInMonth, firstDay, year, month]);

  const weeks = useMemo(() => renderWeeks(), [renderWeeks]);

  return (
    <View style={[monthStyles.container, { backgroundColor: isDark ? '#0f172a' : '#ffffff' }]}>
      {/* 월 헤더 */}
      <View style={[
        monthStyles.monthHeader,
        { 
          backgroundColor: isDark ? '#0f172a' : '#ffffff',
          borderBottomColor: isDark ? '#374151' : '#e5e7eb',
        }
      ]}>
        <Text style={[monthStyles.monthTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
          {MONTH_NAMES[month - 1]}
        </Text>
      </View>

      {/* 날짜 그리드 */}
      <View>
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={monthStyles.weekRow}>
            {week.map((cell, dayIndex) => {
              if (cell.isOtherMonth) {
                return <View key={`empty-${weekIndex}-${dayIndex}`} style={cellStyles.emptyCell} />;
              }
              const dateString = `${year}-${String(month).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
              return (
                <DayCell
                  key={`${weekIndex}-${dayIndex}`}
                  day={cell.day}
                  weekIndex={weekIndex}
                  dayIndex={dayIndex}
                  dateString={dateString}
                  dayEvents={filteredEvents[dateString] || EMPTY_EVENTS}
                  dayColors={dayColorsMap[dateString] || EMPTY_COLORS}
                  isToday={dateString === todayString}
                  onDatePress={onDatePress}
                  cellStyles={cellStyles}
                  dateTextStyles={dateTextStyles}
                  holidayTextStyle={holidayTextStyle}
                  eventTextStyle={eventTextStyle}
                  todayCircleStyle={todayCircleStyle}
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
    marginTop: 3,
    height: 28,
    justifyContent: 'flex-start',
  },
  eventList: {
    flex: 1,
    gap: 1,
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
