import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Dimensions, StyleSheet } from 'react-native';
import { EventsByDate, Event } from '../types';
import EventColorManager from '../utils/eventColorManager';

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
  
  // 오늘 날짜 (자정 넘김 감지  — 앱을 열어둔 채 자정을 넘겨도 정확한 "오늘" 표시)
  const getTodayStr = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };
  const [todayString, setTodayString] = useState(getTodayStr);
  
  useEffect(() => {
    // 자정까지 남은 시간 계산
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const msUntilMidnight = midnight.getTime() - now.getTime();
    
    const timer = setTimeout(() => {
      setTodayString(getTodayStr());
    }, msUntilMidnight + 500); // 자정 직후 0.5초 후 갱신
    
    return () => clearTimeout(timer);
  }, [todayString]); // todayString 변경 시 다음 자정 타이머 재설정

  const renderDay = useCallback((day: number | null, weekIndex: number, dayIndex: number, isOtherMonth: boolean = false) => {
    const dim = dimensionsRef.current;
    if (!day || isOtherMonth) {
      return <View key={`empty-${weekIndex}-${dayIndex}`} style={{ 
        width: dim.cellWidth, 
        height: dim.cellHeight,
        backgroundColor: 'transparent',
      }} />;
    }

    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = filteredEvents[dateString] || [];
    const isToday = dateString === todayString;
    const isSunday = dayIndex === 0;
    const isSaturday = dayIndex === 6;

    return (
      <TouchableOpacity
        key={`${weekIndex}-${dayIndex}`}
        style={{ 
          width: dim.cellWidth, 
          height: dim.cellHeight,
          borderBottomWidth: 0,
          backgroundColor: 'transparent',
        }}
        onPress={() => onDatePress?.(dateString)}
        activeOpacity={0.7}
      >
        <View style={{ padding: dim.cellWidth < 50 ? 1 : 2, height: '100%', flexDirection: 'column' }}>
          {/* 날짜 숫자 - 상단 중앙 */}
          <View style={{ alignItems: 'center', marginBottom: 6, marginTop: 3 }}>
            <Text 
              style={{
                fontSize: dim.cellWidth < 50 ? 12 : 15,
                fontWeight: isToday ? '800' : '500',
                color: isToday 
                  ? (isDark ? '#a78bfa' : '#ec4899')
                  : isSunday 
                    ? '#ef4444' 
                    : isSaturday 
                      ? '#3b82f6' 
                      : isDark ? '#e5e7eb' : '#1f2937',
              }}
            >
              {day}
            </Text>
          </View>
          
          {/* 일정 목록 - 최대 3개만 표시 */}
          <View style={{ flex: 1, gap: 1 }}>
            {dayEvents.slice(0, 3).map((event, idx) => {
              const colorBg = EventColorManager.getColorForEvent(
                event.id || `${dateString}-${idx}`,
                event.title,
                dateString,
                filteredEvents,
                dayEvents,
                idx,
                isDark
              );
              const eventHeight = Math.max(Math.min(dim.cellHeight / 6, 14), 11); // 셀 높이에 비례, 최소 11, 최대 14
              return (
                <View
                  key={event.id}
                  style={{ 
                    backgroundColor: colorBg,
                    borderRadius: 2,
                    height: eventHeight,
                    justifyContent: 'center',
                    paddingHorizontal: 2,
                  }}
                >
                  <Text 
                    style={{ 
                      color: isDark ? '#ffffff' : '#374151',
                      fontSize: dim.cellWidth < 50 ? 7 : Math.min(8, eventHeight * 0.6),
                      fontWeight: '700',
                      letterSpacing: -0.2,
                    }}
                    numberOfLines={1}
                  >
                    {event.title}
                  </Text>
                </View>
              );
            })}
            {dayEvents.length > 3 && (
              <View style={{
                backgroundColor: isDark ? '#374151' : '#f3f4f6',
                borderRadius: 3,
                paddingHorizontal: 3,
                paddingVertical: 1,
                alignSelf: 'flex-start',
                marginTop: 1,
              }}>
                <Text style={{ fontSize: dim.cellWidth < 50 ? 7 : 8, fontWeight: '800', color: isDark ? '#d1d5db' : '#4b5563' }}>
                  +{dayEvents.length - 3}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [filteredEvents, isDark, todayString, year, month, onDatePress]);

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
            {week.map((cell, dayIndex) => renderDay(cell.day, weekIndex, dayIndex, cell.isOtherMonth))}
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
  dayNumber: {
    alignItems: 'center',
    marginBottom: 6,
    marginTop: 3,
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
});
