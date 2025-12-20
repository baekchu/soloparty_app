import React, { useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions, Animated, PanResponder, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadEvents, saveEvents, clearCache } from '../utils/storage';
import { EventsByDate } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useRegion } from '../contexts/RegionContext';
// ==================== 광고 시스템 (네이티브 빌드 후 활성화) ====================
// import { useReward } from '../contexts/RewardContext';
// import { useRewardedAd, useInterstitialAd, useAppStartAd } from '../services/AdService';
// ========================================================================
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../types';
import { CompositeNavigationProp } from '@react-navigation/native';
import MonthCalendar from '../components/MonthCalendar';
import PointsModal from '../components/PointsModal';

type CalendarScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Calendar'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface CalendarScreenProps {
  navigation: CalendarScreenNavigationProp;
}

// 중복 제거 유틸리티 함수
const deduplicateMonths = (months: Array<{ year: number; month: number }>) => {
  const seen = new Set<string>();
  return months.filter(m => {
    const key = `${m.year}-${m.month}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export default function CalendarScreen({ navigation }: CalendarScreenProps) {
  const [events, setEvents] = useState<EventsByDate>({});
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [visibleMonths, setVisibleMonths] = useState<Array<{ year: number; month: number }>>([]);
  const { theme } = useTheme();
  const { selectedLocation, selectedRegion, clearFilters, setSelectedRegion } = useRegion();
  const [availableRegions, setAvailableRegions] = useState<string[]>([]);
  
  // 포인트 모달 상태
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [points, setPoints] = useState(2500); // 테스트용 초기 포인트
  
  // ==================== 광고 시스템 (네이티브 빌드 후 활성화) ====================
  // const { balance, addReward } = useReward();
  // const { showAd: showRewardedAd, loaded: rewardedAdLoaded } = useRewardedAd((amount) => {
  //   addReward(amount, '광고 시청 보상');
  // });
  // const { showAdOnNavigation } = useInterstitialAd();
  // useAppStartAd();
  const balance = 0; // 임시값 (광고 시스템 비활성화 중)
  // ========================================================================

  const [screenWidth, setScreenWidth] = useState(Dimensions.get('window').width);
  const [screenHeight, setScreenHeight] = useState(Dimensions.get('window').height);
  const panelHeight = useRef(new Animated.Value(100)).current; // 초기 높이 100px - 첫 일정까지 보이도록
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const monthHeightsRef = useRef<{ [key: string]: number }>({});
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null); // 폴링 타이머
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null); // 스크롤 디바운스용
  const isUserScrollingRef = useRef(false); // 사용자 스크롤 중인지 추적

  React.useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenWidth(window.width);
      setScreenHeight(window.height);
    });
    return () => subscription?.remove();
  }, []);

  React.useEffect(() => {
    // 초기 마운트 시에만 현재 월 기준으로 이전 3개월, 현재 월, 다음 3개월 생성
    if (visibleMonths.length === 0) {
      const now = new Date();
      const initialMonth = now.getMonth() + 1;
      const initialYear = now.getFullYear();
      
      const months: Array<{ year: number; month: number }> = [];
      const addedKeys = new Set<string>(); // 중복 방지
      
      for (let i = -3; i <= 3; i++) {
        let month = initialMonth + i;
        let year = initialYear;
        
        if (month < 1) {
          month += 12;
          year--;
        } else if (month > 12) {
          month -= 12;
          year++;
        }
        
        const key = `${year}-${month}`;
        if (!addedKeys.has(key)) {
          months.push({ year, month });
          addedKeys.add(key);
        }
      }
      setVisibleMonths(months);
      
      // 현재 월로 명시적 설정
      setCurrentMonth(initialMonth);
      setCurrentYear(initialYear);
      
      setTimeout(() => {
        // 실제 높이 기반 스크롤
        let totalHeight = 0;
        for (let i = 0; i < 3; i++) {
          const key = `${months[i].year}-${months[i].month}`;
          const height = monthHeightsRef.current[key] || (screenHeight * 0.7);
          totalHeight += height;
        }
        
        // 월 헤더 높이를 빼서 월 헤더가 요일 헤더 바로 아래에 오도록 조정
        const monthHeaderHeight = -56; // paddingVertical(16*2) + fontSize(20) + borderBottom(1) + 여유
        const adjustedHeight = Math.max(0, totalHeight - monthHeaderHeight);
        
        scrollViewRef.current?.scrollTo({ y: adjustedHeight, animated: false });
      }, 200);
    }
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // 수직 제스처만 인식 (dy가 dx보다 클 때)
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        const newValue = 100 - gestureState.dy;
        if (newValue >= 100 && newValue <= screenHeight - 100) {
          panelHeight.setValue(newValue);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -50) {
          // 위로 스와이프 - 패널 확장
          expandPanel();
        } else if (gestureState.dy > 50) {
          // 아래로 스와이프 - 패널 축소
          collapsePanel();
        } else {
          // 현재 위치에 따라 결정
          const currentValue = (panelHeight as any)._value;
          if (currentValue > (100 + screenHeight - 100) / 2) {
            expandPanel();
          } else {
            collapsePanel();
          }
        }
      },
    })
  ).current;

  const expandPanel = () => {
    setIsPanelExpanded(true);
    Animated.spring(panelHeight, {
      toValue: screenHeight - 100,
      useNativeDriver: false,
      tension: 50,
      friction: 8,
    }).start();
  };

  const collapsePanel = () => {
    setIsPanelExpanded(false);
    Animated.spring(panelHeight, {
      toValue: 100,
      useNativeDriver: false,
      tension: 50,
      friction: 8,
    }).start();
  };

  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  const monthNamesShort = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  
  // 월 변경 시 자동 스크롤
  React.useEffect(() => {
    if (visibleMonths.length > 0 && !isUserScrollingRef.current) {
      const targetIndex = visibleMonths.findIndex(
        m => m.month === currentMonth && m.year === currentYear
      );
      
      if (targetIndex !== -1) {
        let totalHeight = 0;
        for (let i = 0; i < targetIndex; i++) {
          const key = `${visibleMonths[i].year}-${visibleMonths[i].month}`;
          const height = monthHeightsRef.current[key] || (screenHeight * 0.7);
          totalHeight += height;
        }
        
        // 월 헤더 높이를 빼서 월 헤더가 요일 헤더 바로 아래에 오도록 조정
        const monthHeaderHeight = -56; // paddingVertical(16*2) + fontSize(20) + borderBottom(1) + 여유
        const adjustedHeight = Math.max(0, totalHeight - monthHeaderHeight);
        
        scrollViewRef.current?.scrollTo({ 
          y: adjustedHeight, 
          animated: true 
        });
      }
    }
  }, [currentMonth, currentYear]);
  
  const getVisibleMonths = () => {
    const isLargeScreen = screenWidth >= 600;
    const monthCount = isLargeScreen ? 5 : 3;
    const sideCount = Math.floor((monthCount - 1) / 2);
    
    const months: number[] = [];
    for (let i = -sideCount; i <= sideCount; i++) {
      let month = currentMonth + i;
      if (month < 1) month += 12;
      if (month > 12) month -= 12;
      months.push(month);
    }
    return months;
  };
  
  const getUpcomingEvents = () => {
    // 필터링 함수 - location과 region으로 필터링
    const filterEvents = (eventsToFilter: Array<{ date: string; event: any }>) => {
      let filtered = eventsToFilter;
      
      // 지역 필터 (예: 서울, 부산)
      if (selectedRegion) {
        filtered = filtered.filter(item => 
          item.event.region === selectedRegion
        );
      }
      
      // 장소 필터 (예: 강남역, 홍대입구)
      if (selectedLocation) {
        filtered = filtered.filter(item => 
          item.event.location === selectedLocation
        );
      }
      
      return filtered;
    };
    
    // 선택된 날짜가 있으면 해당 날짜의 일정만 반환 (시간 순 정렬)
    if (selectedDate && events[selectedDate]) {
      const dateEvents = events[selectedDate]
        .map(event => ({ date: selectedDate, event }))
        .sort((a, b) => {
          // 시간이 있으면 시간 기준 정렬
          const timeA = a.event.time || 'ZZ:ZZ'; // 시간 없으면 마지막으로
          const timeB = b.event.time || 'ZZ:ZZ';
          return timeA.localeCompare(timeB);
        });
      return filterEvents(dateEvents);
    }
    
    // 선택된 날짜가 없으면 현재와 미래의 모든 일정 반환 (과거 일정 제외)
    const today = new Date();
    today.setHours(0, 0, 0, 0); // 오늘 00:00:00으로 설정
    const allEvents: Array<{ date: string; event: any }> = [];
    
    Object.keys(events).forEach(date => {
      const eventDate = new Date(date);
      eventDate.setHours(0, 0, 0, 0);
      // 오늘 이후의 일정만 포함 (오늘 포함)
      if (eventDate >= today) {
        events[date].forEach(event => {
          allEvents.push({ date, event });
        });
      }
    });
    
    const filteredEvents = filterEvents(allEvents);
    // 날짜 빠른 순, 같은 날짜는 시간 빠른 순으로 정렬
    return filteredEvents.sort((a, b) => {
      // 먼저 날짜로 비교
      const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateCompare !== 0) return dateCompare;
      
      // 날짜가 같으면 시간으로 비교
      const timeA = a.event.time || 'ZZ:ZZ'; // 시간 없으면 마지막으로
      const timeB = b.event.time || 'ZZ:ZZ';
      return timeA.localeCompare(timeB);
    });
  };

  // 성능 최적화: upcomingEvents를 메모이제이션
  const upcomingEvents = useMemo(() => getUpcomingEvents(), [
    events,
    selectedDate,
    selectedRegion,
    selectedLocation,
    currentMonth,
    currentYear
  ]);

  // visibleMonths 중복 제거 (정기 클린업)
  React.useEffect(() => {
    setVisibleMonths(prev => {
      const deduplicated = deduplicateMonths(prev);
      return deduplicated.length !== prev.length ? deduplicated : prev;
    });
  }, [currentMonth, currentYear]);

  useFocusEffect(
    useCallback(() => {
      loadEventsData();
      
      // 10초마다 Gist에서 데이터 자동 갱신 (실시간 업데이트)
      pollIntervalRef.current = setInterval(async () => {
        try {
          const latestEvents = await loadEvents(true);
          setEvents(latestEvents);
        } catch (error) {
          // 갱신 실패는 무시
        }
      }, 10000); // 10초마다 갱신

      // 컴포넌트 언마운트 시 정리
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      };
    }, [])
  );

  const loadEventsData = async () => {
    try {
      // 캐시 초기화 (Gist 최신 데이터 보장)
      await clearCache();
      
      // Gist에서 최신 데이터 가져오기
      const loadedEvents = await loadEvents(true);
      
      // Gist 데이터 설정 (비어있어도 그대로 사용)
      setEvents(loadedEvents);
      
      // 지역 목록 추출 및 이벤트 개수 기준 정렬
      const regionCount = new Map<string, number>();
      Object.values(loadedEvents).forEach(eventList => {
        eventList.forEach(event => {
          if (event.region) {
            regionCount.set(event.region, (regionCount.get(event.region) || 0) + 1);
          }
        });
      });
      // 이벤트 개수가 많은 순으로 정렬
      const sortedRegions = Array.from(regionCount.entries())
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0]);
      setAvailableRegions(sortedRegions);
    } catch (error) {
      // 오류 시에도 빈 상태로 유지 (샘플 데이터 사용 안함)
      setEvents({});
    }
  };

  const goToPreviousMonth = useCallback(() => {
    isUserScrollingRef.current = false;
    setCurrentMonth((prevMonth) => {
      if (prevMonth === 1) {
        setCurrentYear((prevYear) => prevYear - 1);
        return 12;
      }
      return prevMonth - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    isUserScrollingRef.current = false;
    setCurrentMonth((prevMonth) => {
      if (prevMonth === 12) {
        setCurrentYear((prevYear) => prevYear + 1);
        return 1;
      }
      return prevMonth + 1;
    });
  }, []);

  const isDark = theme === 'dark';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0f172a' : '#ffffff' }} edges={['top', 'left', 'right']}>
      {/* 헤더 */}
      <View style={{ 
        paddingHorizontal: 20, 
        paddingTop: 10,
        paddingBottom: 0, 
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 3,
      }}>
        <View style={{ 
          flexDirection: 'row', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          marginBottom: 16,
          gap: 8,
        }}>
          {/* 왼쪽 영역 - flex로 자동 조절 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 28, fontWeight: '900', color: isDark ? '#f8fafc' : '#0f172a' }}>
              {currentYear}
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                const today = new Date();
                const todayMonth = today.getMonth() + 1;
                const todayYear = today.getFullYear();
                
                isUserScrollingRef.current = false;
                setCurrentMonth(todayMonth);
                setCurrentYear(todayYear);
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 12,
                backgroundColor: isDark ? '#334155' : '#f1f5f9',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#e2e8f0' : '#475569' }}>오늘</Text>
            </TouchableOpacity>
            {/* 필터 표시 - 말줄임 처리 */}
            {(selectedRegion || selectedLocation) && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={clearFilters}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 12,
                  backgroundColor: isDark ? '#a78bfa' : '#ec4899',
                  flexDirection: 'row',
                  alignItems: 'center',
                  maxWidth: screenWidth - 280,
                  flexShrink: 1,
                }}
              >
                <Text 
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{ fontSize: 12, fontWeight: '700', color: '#ffffff', flexShrink: 1 }}
                >
                  {selectedLocation || selectedRegion}
                </Text>
                <Text style={{ fontSize: 11, color: '#ffffff', marginLeft: 4 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {/* 오른쪽 영역 - 고정 너비 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* 포인트 버튼 */}
            {/* <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setShowPointsModal(true)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 16,
                backgroundColor: isDark ? '#a78bfa' : '#ec4899',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 3,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#ffffff' }}>P</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#ffffff' }}>
                {points >= 10000 ? `${Math.floor(points / 1000)}k` : points.toLocaleString()}
              </Text>
            </TouchableOpacity> */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.navigate('Settings')}
              style={{
                padding: 8,
              }}
            >
              <View style={{ width: 15, height: 15, justifyContent: 'space-between' }}>
                <View style={{ width: 20, height: 2, backgroundColor: isDark ? '#f8fafc' : '#0f172a', borderRadius: 2 }} />
                <View style={{ width: 20, height: 2, backgroundColor: isDark ? '#f8fafc' : '#0f172a', borderRadius: 2 }} />
                <View style={{ width: 20, height: 2, backgroundColor: isDark ? '#f8fafc' : '#0f172a', borderRadius: 2 }} />
              </View>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* 월 탭 네비게이션 */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0, paddingHorizontal: screenWidth >= 600 ? 40 : 10 }}>
          {getVisibleMonths().map((monthNum, idx) => {
            const isActive = monthNum === currentMonth;
            return (
              <TouchableOpacity 
                key={`${monthNum}-${idx}`}
                activeOpacity={0.7}
                onPress={() => {
                  const tabMonths = getVisibleMonths();
                  const middleIndex = Math.floor(tabMonths.length / 2);
                  const offset = idx - middleIndex;
                  
                  let newMonth = currentMonth + offset;
                  let newYear = currentYear;
                  
                  if (newMonth < 1) {
                    newMonth += 12;
                    newYear--;
                  } else if (newMonth > 12) {
                    newMonth -= 12;
                    newYear++;
                  }
                  
                  // 프로그래밍 방식의 스크롤임을 표시
                  isUserScrollingRef.current = false;
                  
                  // 즉시 상태 업데이트
                  setCurrentMonth(newMonth);
                  setCurrentYear(newYear);
                }}
                style={{ 
                  alignItems: 'center',
                  paddingVertical: 8,
                  paddingHorizontal: 4,
                }}
              >
                <Text style={{ 
                  fontSize: isActive ? 16 : 13, 
                  fontWeight: isActive ? '800' : '600',
                  color: isActive ? (isDark ? '#a78bfa' : '#ec4899') : isDark ? '#64748b' : '#94a3b8',
                  letterSpacing: 0.5,
                }}>
                  {monthNamesShort[monthNum - 1]}
                </Text>
                {isActive && (
                  <View style={{ 
                    width: 24, 
                    height: 3, 
                    backgroundColor: isDark ? '#a78bfa' : '#ec4899', 
                    marginTop: 6,
                    borderRadius: 2,
                  }} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 지역 필터 바 */}
      <View style={{
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        paddingVertical: 8,
        paddingHorizontal: 16,
      }}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
        >
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                clearFilters();
              }}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 20,
                backgroundColor: !selectedRegion && !selectedLocation
                  ? (isDark ? '#a78bfa' : '#ec4899') 
                  : (isDark ? '#334155' : '#f1f5f9'),
                marginRight: 8,
                minWidth: 60,
                alignItems: 'center',
              }}
            >
              <Text style={{
                fontSize: 14,
                fontWeight: '700',
                color: !selectedRegion && !selectedLocation
                  ? '#ffffff' 
                  : (isDark ? '#94a3b8' : '#64748b'),
              }}>
                전체
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.navigate('LocationPicker')}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 20,
                backgroundColor: isDark ? '#334155' : '#f1f5f9',
                marginRight: 8,
                minWidth: 60,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: isDark ? '#475569' : '#e2e8f0',
                borderStyle: 'dashed',
              }}
            >
              <Text style={{
                fontSize: 14,
                fontWeight: '700',
                color: isDark ? '#94a3b8' : '#64748b',
              }}>
                + 상세
              </Text>
            </TouchableOpacity>
            
            {availableRegions.map((region) => (
              <TouchableOpacity
                key={region}
                activeOpacity={0.7}
                onPress={() => {
                  if (selectedRegion === region) {
                    clearFilters();
                  } else {
                    setSelectedRegion(region);
                  }
                }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 20,
                  backgroundColor: selectedRegion === region 
                    ? (isDark ? '#a78bfa' : '#ec4899') 
                    : (isDark ? '#334155' : '#f1f5f9'),
                  marginRight: 8,
                  minWidth: 60,
                  alignItems: 'center',
                }}
              >
                <Text style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: selectedRegion === region 
                    ? '#ffffff' 
                    : (isDark ? '#94a3b8' : '#64748b'),
                }}>
                  {region}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
      </View>

      {/* 요일 헤더 - 고정 */}
      <View style={{ 
        flexDirection: 'row',
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
      }}>
        {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
          <View 
            key={day} 
            style={{ 
              width: screenWidth / 7,
              paddingVertical: 14,
            }}
          >
            <Text 
              style={{
                textAlign: 'center',
                fontSize: screenWidth / 7 < 50 ? 10 : 12,
                fontWeight: '700',
                letterSpacing: 0.5,
                color: index === 0 ? '#ef4444' : index === 6 ? '#3b82f6' : isDark ? '#cbd5e1' : '#475569',
              }}
            >
              {day}
            </Text>
          </View>
        ))}
      </View>

      {/* 캘린더 */}
      <ScrollView 
        ref={scrollViewRef}
        style={{ flex: 1 }} 
        showsVerticalScrollIndicator={false}
        scrollEnabled={!isPanelExpanded}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          // 사용자가 직접 스크롤 시작
          isUserScrollingRef.current = true;
        }}
        onMomentumScrollEnd={() => {
          // 스크롤 애니메이션 종료 후 플래그 리셋
          setTimeout(() => {
            isUserScrollingRef.current = false;
          }, 100);
        }}
        onScroll={(e) => {
          const scrollY = e.nativeEvent.contentOffset.y;
          const contentHeight = e.nativeEvent.contentSize.height;
          const layoutHeight = e.nativeEvent.layoutMeasurement.height;
          
          // 사용자가 직접 스크롤할 때만 월 업데이트 (즉시 반응)
          if (isUserScrollingRef.current) {
            if (scrollTimeoutRef.current) {
              clearTimeout(scrollTimeoutRef.current);
            }
            
            // 즉시 월 계산 및 업데이트
            let accumulatedHeight = 0;
            let targetMonthIndex = 0;
            
            for (let i = 0; i < visibleMonths.length; i++) {
              const key = `${visibleMonths[i].year}-${visibleMonths[i].month}`;
              const height = monthHeightsRef.current[key] || (screenHeight * 0.7);
              
              if (accumulatedHeight + height / 2 > scrollY) {
                targetMonthIndex = i;
                break;
              }
              accumulatedHeight += height;
            }
            
            if (visibleMonths[targetMonthIndex]) {
              const newMonth = visibleMonths[targetMonthIndex].month;
              const newYear = visibleMonths[targetMonthIndex].year;
              
              if (newMonth !== currentMonth || newYear !== currentYear) {
                setCurrentMonth(newMonth);
                setCurrentYear(newYear);
              }
            }
          }
          
          // 무한 스크롤 (중복 방지 강화)
          if (scrollY + layoutHeight >= contentHeight - 500) {
            const lastMonth = visibleMonths[visibleMonths.length - 1];
            if (lastMonth) {
              let nextMonth = lastMonth.month + 1;
              let nextYear = lastMonth.year;
              if (nextMonth > 12) {
                nextMonth = 1;
                nextYear++;
              }
              
              setVisibleMonths(prev => {
                const key = `${nextYear}-${nextMonth}`;
                const exists = prev.some(m => `${m.year}-${m.month}` === key);
                if (exists) return prev;
                return [...prev, { year: nextYear, month: nextMonth }];
              });
            }
          }
          
          if (scrollY <= 500) {
            const firstMonth = visibleMonths[0];
            if (firstMonth) {
              let prevMonth = firstMonth.month - 1;
              let prevYear = firstMonth.year;
              if (prevMonth < 1) {
                prevMonth = 12;
                prevYear--;
              }
              
              setVisibleMonths(prev => {
                const key = `${prevYear}-${prevMonth}`;
                const exists = prev.some(m => `${m.year}-${m.month}` === key);
                if (exists) return prev;
                
                const newMonths = [{ year: prevYear, month: prevMonth }, ...prev];
                
                // 스크롤 위치 보정
                requestAnimationFrame(() => {
                  const heightKey = `${prevYear}-${prevMonth}`;
                  const addedHeight = monthHeightsRef.current[heightKey] || (screenHeight * 0.7);
                  scrollViewRef.current?.scrollTo({ y: scrollY + addedHeight, animated: false });
                });
                
                return newMonths;
              });
            }
          }
        }}
      >
        {visibleMonths.map((monthData, index) => (
          <View 
            key={`${monthData.year}-${monthData.month}-${index}`}
            onLayout={(event) => {
              const { height } = event.nativeEvent.layout;
              const key = `${monthData.year}-${monthData.month}`;
              monthHeightsRef.current[key] = height;
            }}
          >
            <MonthCalendar
              year={monthData.year}
              month={monthData.month}
              events={events}
              isDark={isDark}
              selectedLocation={selectedLocation}
              selectedRegion={selectedRegion}
              onDatePress={(date) => {
                setSelectedDate(date);
                expandPanel();
              }}
            />
          </View>
        ))}
      </ScrollView>

      {/* 하단 이벤트 리스트 패널 */}
      <Animated.View style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: panelHeight,
        backgroundColor: isDark ? '#a78bfa' : '#ec4899',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 10,
      }}>
        {/* 드래그 핸들 */}
        <View 
          {...panResponder.panHandlers}
          style={{ 
            alignItems: 'center',
            paddingVertical: 6,
            marginBottom: 8,
          }}
        >
          <View style={{
            width: 40,
            height: 5,
            backgroundColor: 'rgba(255, 255, 255, 0.5)',
            borderRadius: 3,
          }} />
        </View>

        {/* 일정 헤더*/}
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 35,
        }}>
          <View>
            <Text style={{ 
              fontSize: 18, 
              fontWeight: '800', 
              color: '#ffffff', 
              letterSpacing: 1,
              
            }}>
              {selectedDate ? `${new Date(selectedDate).getDate()}일 일정` : '일정'}
            </Text>
            {selectedDate && (
              <TouchableOpacity 
                onPress={() => {
                  setSelectedDate(null);
                }}
                style={{ marginTop: 4 }}
              >
                <Text style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.7)' }}>← 전체 일정 보기</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {/* 화살표 버튼 - 패널 상태에 따라 변경 */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (isPanelExpanded) {
                collapsePanel();
              } else {
                expandPanel();
              }
            }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700' }}>
              {isPanelExpanded ? '▽' : '△'}
            </Text>
          </TouchableOpacity>
        </View>
        
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          style={{ flex: 1 }}
          nestedScrollEnabled={true}
          bounces={true}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: 20 }}
        >
        {upcomingEvents.length === 0 ? (
          <Text style={{ color: '#e0e7ff', fontSize: 14, fontStyle: 'italic' }}>
            예정된 일정이 없습니다
          </Text>
        ) : (
          (() => {
            // 전체 일정 보기: 날짜별로 그룹화
            if (!selectedDate) {
              const groupedByDate: { [key: string]: Array<{ date: string; event: any }> } = {};
              upcomingEvents.forEach(item => {
                if (!groupedByDate[item.date]) {
                  groupedByDate[item.date] = [];
                }
                groupedByDate[item.date].push(item);
              });

              const dates = Object.keys(groupedByDate);
              
              return dates.map((date, dateIndex) => {
                const eventsForDate = groupedByDate[date];
                const eventDate = new Date(date);
                const day = eventDate.getDate();
                const monthName = monthNames[eventDate.getMonth()];
                const isLastDate = dateIndex === dates.length - 1;

                return (
                  <View key={date} style={{ flexDirection: 'row', marginBottom: isLastDate ? 0 : 24 }}>
                    {/* 왼쪽 타임라인 */}
                    <View style={{ alignItems: 'center', marginRight: 16 }}>
                      {/* 날짜 원형 */}
                      <View style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: '#ffffff',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: isDark ? '#a78bfa' : '#ec4899' }}>{day}</Text>
                        <Text style={{ fontSize: 9, fontWeight: '600', color: isDark ? '#a78bfa' : '#ec4899', marginTop: -2 }}>{monthName}</Text>
                      </View>
                      {/* 점선 연결 (마지막 날짜가 아닐 때만) */}
                      {!isLastDate && (
                        <View style={{
                          width: 2,
                          flex: 1,
                          marginTop: 8,
                          marginBottom: 8,
                          borderLeftWidth: 2,
                          borderLeftColor: 'rgba(255, 255, 255, 0.3)',
                          borderStyle: 'dashed',
                          minHeight: 40,
                        }} />
                      )}
                    </View>
                    
                    {/* 오른쪽 일정 카드들 */}
                    <View style={{ flex: 1 }}>
                      {eventsForDate.map((item, eventIndex) => (
                        <View 
                          key={`${date}-${item.event.id}-${eventIndex}`}
                          style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.15)',
                            borderRadius: 16,
                            padding: 16,
                            paddingTop: 12,
                            marginBottom: eventIndex < eventsForDate.length - 1 ? 12 : 0,
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <Text style={{ fontSize: 15, fontWeight: '700', color: '#ffffff', flex: 1 }}>
                              {item.event.title}
                            </Text>
                            {item.event.location && (
                              <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255, 255, 255, 0.7)', marginLeft: 8 }}>
                                {item.event.location}
                              </Text>
                            )}
                          </View>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#e0e7ff' }}>
                            {item.event.time || '시간 미정'}
                          </Text>
                          {item.event.link && (
                            <TouchableOpacity
                              onPress={async () => {
                                try {
                                  const url = item.event.link.startsWith('http') ? item.event.link : `https://${item.event.link}`;
                                  const canOpen = await Linking.canOpenURL(url);
                                  if (canOpen) {
                                    await Linking.openURL(url);
                                  } else {
                                    Alert.alert('오류', '링크를 열 수 없습니다.');
                                  }
                                } catch (error) {
                                  Alert.alert('오류', '링크를 열 수 없습니다.');
                                }
                              }}
                              style={{
                                marginTop: 10,
                                paddingVertical: 6,
                                paddingHorizontal: 12,
                                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                borderRadius: 8,
                                alignSelf: 'flex-start',
                              }}
                            >
                              <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '600' }}>🔗 자세히 보기</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      ))}
                    </View>
                  </View>
                );
              });
            } else {
              // 특정 날짜 선택: 카드 스타일
              return upcomingEvents.map(({ date, event }, index) => (
                <View 
                  key={`${date}-${event.id}-${index}`} 
                  style={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#ffffff', flex: 1 }}>
                      {event.title}
                    </Text>
                    {event.location && (
                      <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255, 255, 255, 0.7)', marginLeft: 8 }}>
                        {event.location}
                      </Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#e0e7ff', marginBottom: 12 }}>
                    {event.time || '시간 미정'}
                  </Text>
                  
                  {event.link ? (
                    <TouchableOpacity
                      onPress={async () => {
                        try {
                          const url = event.link.startsWith('http') ? event.link : `https://${event.link}`;
                          const canOpen = await Linking.canOpenURL(url);
                          if (canOpen) {
                            await Linking.openURL(url);
                          } else {
                            Alert.alert('오류', '링크를 열 수 없습니다.');
                          }
                        } catch (error) {
                          Alert.alert('오류', '링크를 열 수 없습니다.');
                        }
                      }}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 14,
                        backgroundColor: 'rgba(255, 255, 255, 0.25)',
                        borderRadius: 10,
                        alignSelf: 'flex-start',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Text style={{ fontSize: 14 }}>🔗</Text>
                      <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '700' }}>자세히 보기</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: 10,
                      alignSelf: 'flex-start',
                    }}>
                      <Text style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 12, fontWeight: '600' }}>링크 없음</Text>
                    </View>
                  )}
                </View>
              ));
            }
          })()
        )}
        </ScrollView>
      </Animated.View>

      {/* 포인트 모달 */}
      <PointsModal
        visible={showPointsModal}
        onClose={() => setShowPointsModal(false)}
        points={points}
        onSpendPoints={(amount, reason) => {
          setPoints(prev => prev - amount);
        }}
        isDark={isDark}
      />
    </SafeAreaView>
  );
}
