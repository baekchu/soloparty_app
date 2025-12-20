import React, { useMemo, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { EventsByDate, Event } from '../types';
import EventColorManager from '../utils/eventColorManager';

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
  // EventColorManager 초기화
  useEffect(() => {
    EventColorManager.initialize();
  }, []);
  
  // location과 region으로 필터링된 이벤트
  const filteredEvents = useMemo(() => {
    if (!selectedLocation && !selectedRegion) return events;
    
    const filtered: EventsByDate = {};
    
    Object.keys(events).forEach(date => {
      let dateEvents = events[date];
      
      // 지역 필터
      if (selectedRegion) {
        dateEvents = dateEvents.filter(event => event.region === selectedRegion);
      }
      
      // 장소 필터
      if (selectedLocation) {
        dateEvents = dateEvents.filter(event => event.location === selectedLocation);
      }
      
      if (dateEvents.length > 0) {
        filtered[date] = dateEvents;
      }
    });
    return filtered;
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
  
  // 오늘 날짜 계산 메모이제이션
  const todayString = useMemo(() => new Date().toISOString().split('T')[0], []);

  const renderDay = useCallback((day: number | null, weekIndex: number, dayIndex: number, isOtherMonth: boolean = false) => {
    if (!day || isOtherMonth) {
      return <View key={`empty-${weekIndex}-${dayIndex}`} style={{ 
        width: dimensions.cellWidth, 
        height: dimensions.cellHeight,
        backgroundColor: 'transparent',
      }} />;
    }

    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = filteredEvents[dateString] || [];
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];
    const isToday = dateString === todayString;
    const isSunday = dayIndex === 0;
    const isSaturday = dayIndex === 6;

    return (
      <TouchableOpacity
        key={`${weekIndex}-${dayIndex}`}
        style={{ 
          width: dimensions.cellWidth, 
          height: dimensions.cellHeight,
          borderBottomWidth: 0,
          backgroundColor: 'transparent',
        }}
        onPress={() => onDatePress?.(dateString)}
        activeOpacity={0.7}
      >
        <View style={{ padding: dimensions.cellWidth < 50 ? 1 : 2, height: '100%', flexDirection: 'column' }}>
          {/* 날짜 숫자 - 상단 중앙 */}
          <View style={{ alignItems: 'center', marginBottom: 6, marginTop: 3 }}>
            <Text 
              style={{
                fontSize: dimensions.cellWidth < 50 ? 12 : 15,
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
          
          {/* 일정 목록 */}
          <View style={{ flex: 1, gap: 1 }}>
            {dayEvents.slice(0, 5).map((event, idx) => {
              const colorBg = EventColorManager.getColorForEvent(
                event.id || `${dateString}-${idx}`,
                event.title,
                dateString,
                filteredEvents,
                dayEvents,
                idx
              );
              const eventHeight = Math.max(Math.min(dimensions.cellHeight / 6, 16), 12); // cellHeight에 비례, 최소 12, 최대 16
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
                      color: isDark ? '#1f2937' : '#374151',
                      fontSize: dimensions.cellWidth < 50 ? 7 : Math.min(8.5, eventHeight * 0.6),
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
            {dayEvents.length > 5 && (
              <View style={{
                backgroundColor: isDark ? '#374151' : '#f3f4f6',
                borderRadius: 3,
                paddingHorizontal: 2,
                paddingVertical: 1,
                alignSelf: 'flex-start',
              }}>
                <Text style={{ fontSize: dimensions.cellWidth < 50 ? 6 : 7, fontWeight: '700', color: isDark ? '#d1d5db' : '#4b5563' }}>
                  +{dayEvents.length - 5}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [dimensions, filteredEvents, isDark, todayString, year, month, onDatePress]);

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
  }, [daysInMonth, firstDay]);

  const weeks = useMemo(() => renderWeeks(), [renderWeeks]);

  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

  return (
    <View style={{ backgroundColor: isDark ? '#0f172a' : '#ffffff' }}>
      {/* 월 헤더 */}
      <View style={{ 
        paddingVertical: 16,
        paddingHorizontal: 20,
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#374151' : '#e5e7eb',
      }}>
        <Text style={{
          fontSize: 20,
          fontWeight: '800',
          color: isDark ? '#f8fafc' : '#0f172a',
        }}>
          {monthNames[month - 1]}
        </Text>
      </View>

      {/* 날짜 그리드 */}
      <View>
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={{ flexDirection: 'row' }}>
            {week.map((cell, dayIndex) => renderDay(cell.day, weekIndex, dayIndex, cell.isOtherMonth))}
          </View>
        ))}
      </View>
    </View>
  );
});
