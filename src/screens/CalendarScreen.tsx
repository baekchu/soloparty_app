import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  Dimensions, 
  Animated, 
  PanResponder, 
  Linking, 
  Alert, 
  Platform, 
  BackHandler,
  StyleSheet,
  InteractionManager,
  ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadEvents } from '../utils/storage';
import { EventsByDate } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useRegion } from '../contexts/RegionContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../types';
import { CompositeNavigationProp } from '@react-navigation/native';
import MonthCalendar from '../components/MonthCalendar';
import { usePoints } from '../hooks/usePoints';
import { sendNewEventNotification } from '../services/NotificationService';

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

// ==================== 상수 정의 (성능 최적화) ====================
const MONTH_NAMES = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'] as const;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const POLL_INTERVAL = 30000; // 30초 폴링
const SCROLL_THRESHOLD = 500; // 무한 스크롤 트리거 임계값
const INITIAL_MONTHS_RANGE = 3; // 초기 로드 월 범위 (앞뒤 3개월)

// ==================== 광고 배너 설정 (활성화 시 사용) ====================
const AD_CONFIG = {
  bannerHeight: 50,
  showBanner: false, // 광고 활성화 시 true로 변경
  bannerUnitId: Platform.select({
    ios: 'ca-app-pub-xxxxx/xxxxx', // iOS 광고 단위 ID
    android: 'ca-app-pub-xxxxx/xxxxx', // Android 광고 단위 ID
  }),
};

// ==================== 인스타그램 링크 처리 (보안 강화) ====================
const SAFE_URL_PATTERN = /^https?:\/\/(www\.)?(instagram\.com|naver\.com|facebook\.com|twitter\.com|youtube\.com)/i;

const openInstagramLink = async (link?: string) => {
  if (!link || typeof link !== 'string') return;
  
  try {
    // URL 정규화 및 보안 검증
    let url = link.trim();
    if (!url.startsWith('http')) {
      url = `https://${url}`;
    }
    
    // 허용된 도메인만 열기 (보안 강화)
    if (!SAFE_URL_PATTERN.test(url)) {
      // 신뢰할 수 없는 URL은 사용자에게 경고 후 열기
      Alert.alert(
        '외부 링크',
        '외부 사이트로 이동합니다. 계속하시겠습니까?',
        [
          { text: '취소', style: 'cancel' },
          { text: '이동', onPress: () => Linking.openURL(url).catch(() => {}) },
        ]
      );
      return;
    }
    
    // Instagram 앱 딥링크 시도
    if (url.includes('instagram.com')) {
      const username = url.match(/instagram\.com\/([^\/\?]+)/);
      if (username?.[1] && username[1] !== 'p' && username[1] !== 'reel') {
        const appUrl = `instagram://user?username=${username[1]}`;
        const canOpenApp = await Linking.canOpenURL(appUrl);
        if (canOpenApp) {
          await Linking.openURL(appUrl);
          return;
        }
      }
    }
    
    // 기본 브라우저로 열기
    await Linking.openURL(url);
  } catch (error) {
    console.warn('링크 열기 실패:', error);
    Alert.alert('알림', '링크를 열 수 없습니다.');
  }
};

export default function CalendarScreen({ navigation }: CalendarScreenProps) {
  // ==================== 상태 관리 (최소화) ====================
  const [events, setEvents] = useState<EventsByDate>({});
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [visibleMonths, setVisibleMonths] = useState<Array<{ year: number; month: number }>>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isDataReady, setIsDataReady] = useState(false); // 데이터 로딩 상태
  const [availableRegions, setAvailableRegions] = useState<string[]>([]);
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [heightUpdateTrigger, setHeightUpdateTrigger] = useState(0);
  
  // ==================== Contexts ====================
  const { theme } = useTheme();
  const { selectedLocation, selectedRegion, clearFilters, setSelectedRegion } = useRegion();
  const insets = useSafeAreaInsets();
  const { balance: points, spendPoints } = usePoints();
  
  // ==================== Dimensions (메모이제이션) ====================
  const [dimensions, setDimensions] = useState(() => ({
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  }));
  const { width: screenWidth, height: screenHeight } = dimensions;
  
  // ==================== Refs (성능 최적화) ====================
  const panelHeight = useRef(new Animated.Value(100)).current;
  const panelStartHeight = useRef(100);
  const scrollViewRef = useRef<ScrollView>(null);
  const monthHeightsRef = useRef<Record<string, number>>({});
  const eventListHeightsRef = useRef<Record<string, number>>({});
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUserScrollingRef = useRef(false);
  const previousEventsRef = useRef<EventsByDate>({});
  const isMountedRef = useRef(true); // 마운트 상태 추적 (메모리 누수 방지)
  
  // ==================== 광고 시스템 (네이티브 빌드 후 활성화) ====================
  // const { showAd: showRewardedAd, loaded: rewardedAdLoaded } = useRewardedAd();
  // const { showAdOnNavigation } = useInterstitialAd();
  // ========================================================================
  
  const isDark = theme === 'dark';

  // ==================== 마운트 상태 관리 ====================
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // ==================== Dimensions 리스너 (최적화) ====================
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      if (isMountedRef.current) {
        setDimensions({ width: window.width, height: window.height });
      }
    });
    return () => subscription?.remove();
  }, []);

  // ==================== 초기화 (InteractionManager로 UI 블로킹 방지) ====================
  useEffect(() => {
    if (visibleMonths.length > 0 || screenHeight === 0) return;
    
    // InteractionManager를 사용하여 애니메이션 후 실행
    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      if (!isMountedRef.current) return;
      
      try {
        const now = new Date();
        const initialMonth = now.getMonth() + 1;
        const initialYear = now.getFullYear();
        
        // 초기 월 배열 생성 (중복 방지)
        const months: Array<{ year: number; month: number }> = [];
        const addedKeys = new Set<string>();
        
        for (let i = -INITIAL_MONTHS_RANGE; i <= INITIAL_MONTHS_RANGE; i++) {
          let month = initialMonth + i;
          let year = initialYear;
          
          if (month < 1) { month += 12; year--; }
          else if (month > 12) { month -= 12; year++; }
          
          const key = `${year}-${month}`;
          if (!addedKeys.has(key)) {
            months.push({ year, month });
            addedKeys.add(key);
          }
        }
        
        if (isMountedRef.current) {
          setVisibleMonths(months);
          setCurrentMonth(initialMonth);
          setCurrentYear(initialYear);
          setIsInitialized(true);
        }
        
        // 초기 스크롤 위치 설정 (지연 실행)
        requestAnimationFrame(() => {
          if (!isMountedRef.current) return;
          
          let totalHeight = 0;
          for (let i = 0; i < INITIAL_MONTHS_RANGE && i < months.length; i++) {
            const key = `${months[i].year}-${months[i].month}`;
            totalHeight += monthHeightsRef.current[key] || (screenHeight * 0.7);
          }
          
          const adjustedHeight = Math.max(0, totalHeight + 56);
          scrollViewRef.current?.scrollTo({ y: adjustedHeight, animated: false });
        });
      } catch (error) {
        console.warn('초기화 실패:', error);
        // 폴백: 현재 월만 표시
        if (isMountedRef.current) {
          const now = new Date();
          setVisibleMonths([{ year: now.getFullYear(), month: now.getMonth() + 1 }]);
          setCurrentMonth(now.getMonth() + 1);
          setCurrentYear(now.getFullYear());
          setIsInitialized(true);
        }
      }
    });
    
    return () => interactionHandle.cancel();
  }, [screenHeight]);
  
  // ==================== 패널 애니메이션 (최적화) ====================
  
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // 수직 제스처만 인식 (dy가 dx보다 클 때)
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderGrant: () => {
        // 드래그 시작 시 현재 높이 저장
        panelStartHeight.current = (panelHeight as any)._value || 100;
      },
      onPanResponderMove: (_, gestureState) => {
        // 드래그 시작점에서 이동한 거리만큼 패널 높이 조정
        const newValue = panelStartHeight.current - gestureState.dy;
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
  
  // ==================== 월 변경 시 자동 스크롤 ====================
  useEffect(() => {
    if (visibleMonths.length > 0 && !isUserScrollingRef.current) {
      const targetIndex = visibleMonths.findIndex(
        m => m.month === currentMonth && m.year === currentYear
      );
      
      if (targetIndex !== -1) {
        let totalHeight = 0;
        for (let i = 0; i < targetIndex && i < visibleMonths.length; i++) {
          const key = `${visibleMonths[i].year}-${visibleMonths[i].month}`;
          const height = monthHeightsRef.current[key] || (screenHeight * 0.7);
          totalHeight += height;
        }
        
        // 월 헤더 높이를 빼서 월 헤더가 요일 헤더 바로 아래에 오도록 조정
        const monthHeaderHeight = -56;
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
  
  const getUpcomingEvents = useCallback(() => {
    // 필터링 함수
    const filterByRegion = (item: { event: any }) => 
      !selectedRegion || item.event.region === selectedRegion;
    
    const filterByLocation = (item: { event: any }) => 
      !selectedLocation || item.event.location === selectedLocation;
    
    const sortByTime = (a: { event: any }, b: { event: any }) => 
      (a.event.time || 'ZZ:ZZ').localeCompare(b.event.time || 'ZZ:ZZ');
    
    // 선택된 날짜가 있으면 해당 날짜만
    if (selectedDate) {
      // 해당 날짜에 일정이 있으면 그것만 반환
      if (events[selectedDate]) {
        return events[selectedDate]
          .map(event => ({ date: selectedDate, event }))
          .filter(filterByRegion)
          .filter(filterByLocation)
          .sort(sortByTime);
      }
      // 해당 날짜에 일정이 없으면 빈 배열 반환 (전체 일정을 보여주지 않음)
      return [];
    }
    
    // 오늘 이후의 모든 일정
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return Object.entries(events)
      .flatMap(([date, eventList]) => {
        const eventDate = new Date(date);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate >= today 
          ? eventList.map(event => ({ date, event }))
          : [];
      })
      .filter(filterByRegion)
      .filter(filterByLocation)
      .sort((a, b) => {
        const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
        return dateCompare !== 0 ? dateCompare : sortByTime(a, b);
      });
  }, [events, selectedDate, selectedRegion, selectedLocation]);

  // 성능 최적화: upcomingEvents를 메모이제이션
  const upcomingEvents = useMemo(() => getUpcomingEvents(), [getUpcomingEvents]);

  // visibleMonths 중복 제거 (정기 클린업)
  React.useEffect(() => {
    setVisibleMonths(prev => {
      const deduplicated = deduplicateMonths(prev);
      return deduplicated.length !== prev.length ? deduplicated : prev;
    });
  }, [currentMonth, currentYear]);

  // ==================== 데이터 처리 함수 ====================
  
  // 새 일정 감지 함수
  const checkForNewEvents = useCallback((oldEvents: EventsByDate, newEvents: EventsByDate) => {
    // 초기 로드 시에는 알림 보내지 않음
    if (Object.keys(oldEvents).length === 0) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    Object.keys(newEvents).forEach(date => {
      const eventDate = new Date(date);
      eventDate.setHours(0, 0, 0, 0);

      // 오늘 이후의 일정만 확인
      if (eventDate < today) return;

      const oldEventIds = new Set(
        (oldEvents[date] || []).map(e => `${e.id}-${e.title}`)
      );
      
      newEvents[date].forEach(event => {
        const eventKey = `${event.id}-${event.title}`;
        
        // 새로 추가된 일정이면 알림 전송 (안전하게)
        if (!oldEventIds.has(eventKey)) {
          try {
            const formattedDate = new Date(date).toLocaleDateString('ko-KR', {
              month: 'long',
              day: 'numeric',
            });
            sendNewEventNotification(event.title, formattedDate);
          } catch (notifError) {
            // Expo Go에서는 알림이 작동하지 않을 수 있음 (무시)
          }
        }
      });
    });
  }, []);

  // 이벤트 데이터 로드 (최적화)
  const loadEventsData = useCallback(async () => {
    try {
      const loadedEvents = await loadEvents(false);
      
      if (!loadedEvents || typeof loadedEvents !== 'object') {
        if (isMountedRef.current) {
          setEvents({});
          setAvailableRegions([]);
        }
        return;
      }
      
      // 초기 로드 시 이전 데이터 저장
      previousEventsRef.current = loadedEvents;
      
      if (isMountedRef.current) {
        setEvents(loadedEvents);
        
        // 지역 목록 추출 (최적화)
        const regionCount = new Map<string, number>();
        for (const eventList of Object.values(loadedEvents)) {
          for (const event of eventList) {
            if (event?.region) {
              regionCount.set(event.region, (regionCount.get(event.region) || 0) + 1);
            }
          }
        }
        
        const sortedRegions = Array.from(regionCount.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([region]) => region);
        setAvailableRegions(sortedRegions);
      }
    } catch (error) {
      console.warn('데이터 로드 실패:', error);
      if (isMountedRef.current) {
        setEvents({});
        setAvailableRegions([]);
      }
    }
  }, []);

  // ==================== 데이터 로드 및 폴링 ====================
  useFocusEffect(
    useCallback(() => {
      // 마운트 상태 확인
      isMountedRef.current = true;
      
      // 초기 데이터 로드 (안전하게)
      const loadData = async () => {
        try {
          await loadEventsData();
          if (isMountedRef.current) {
            setIsDataReady(true);
          }
        } catch (err) {
          console.warn('초기 데이터 로드 실패:', err);
          if (isMountedRef.current) {
            setIsDataReady(true); // 실패해도 UI 표시
          }
        }
      };
      
      loadData();
      
      // 폴링 설정 (배터리 최적화)
      pollIntervalRef.current = setInterval(async () => {
        if (!isMountedRef.current) return;
        
        try {
          const latestEvents = await loadEvents(true);
          
          if (latestEvents && typeof latestEvents === 'object' && isMountedRef.current) {
            // 새 일정 감지 및 알림
            checkForNewEvents(previousEventsRef.current, latestEvents);
            setEvents(latestEvents);
            previousEventsRef.current = latestEvents;
          }
        } catch (error) {
          // 실패 시 조용히 무시
        }
      }, POLL_INTERVAL);

      // 안드로이드 뒤로가기 버튼 처리
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        if (isPanelExpanded) {
          if (selectedDate) {
            setSelectedDate(null);
            return true;
          } else {
            collapsePanel();
            return true;
          }
        }
        return false;
      });

      // 클린업 함수
      return () => {
        isMountedRef.current = false;
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
          scrollTimeoutRef.current = null;
        }
        backHandler.remove();
      };
    }, [isPanelExpanded, selectedDate, loadEventsData, checkForNewEvents])
  );

  // ==================== 로딩 화면 ====================
  if (!isInitialized || screenHeight === 0 || screenWidth === 0) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: isDark ? '#0f172a' : '#ffffff', paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={isDark ? '#a78bfa' : '#ec4899'} />
        <Text style={[styles.loadingText, { color: isDark ? '#94a3b8' : '#64748b' }]}>로딩 중...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#0f172a' : '#ffffff', paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
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
            {/* 포인트/쿠폰 버튼 */}
            {/* <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.navigate('Coupon')}
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
                  {MONTH_NAMES[monthNum - 1]}
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
              if (!visibleMonths[i]) continue;
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
            const lastMonth = visibleMonths.length > 0 ? visibleMonths[visibleMonths.length - 1] : null;
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
            const firstMonth = visibleMonths.length > 0 ? visibleMonths[0] : null;
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
        bottom: Platform.OS === 'android' ? insets.bottom : 0,
        height: panelHeight,
        backgroundColor: isDark ? '#a78bfa' : '#ec4899',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'android' ? 0 : 30,
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
          
          {/* X 버튼 - 패널이 확장되었을 때만 표시 */}
          {isPanelExpanded && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={collapsePanel}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
          )}
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
                const monthName = MONTH_NAMES[eventDate.getMonth()];
                const isLastDate = dateIndex === dates.length - 1;

                const bubbleSize = 44;
                const bubbleToLineGap = 8;
                const betweenDatesGap = 24;
                const measuredListHeight = eventListHeightsRef.current[date] || 0;
                const baseLineHeight = Math.max(0, measuredListHeight - bubbleSize - bubbleToLineGap);
                const dashedLineHeight = baseLineHeight + (isLastDate ? 0 : betweenDatesGap);
                const dashLength = 6;
                const dashGap = 6;
                const dashCount = dashedLineHeight > 0 ? Math.floor((dashedLineHeight + dashGap) / (dashLength + dashGap)) : 0;

               return (
        <View key={date} style={{ flexDirection: 'row', marginBottom: isLastDate ? 0 : 24 }}>
          
          {/* [왼쪽] 날짜 버블 + 점선 트랙 */}
          <View style={{ alignItems: 'center', marginRight: 16 }}>
            <View style={{ 
              width: 44, 
              height: 44, 
              borderRadius: 22, 
              backgroundColor: '#fff', 
              justifyContent: 'center', 
              alignItems: 'center',
              zIndex: 1 
            }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: isDark ? '#a78bfa' : '#ec4899' }}>{day}</Text>
              <Text style={{ fontSize: 9, fontWeight: '600', color: isDark ? '#a78bfa' : '#ec4899', marginTop: -2 }}>{monthName}</Text>
            </View>
            
            {dashCount > 0 && (
              <View
                style={{
                  width: 2,
                  marginTop: bubbleToLineGap,
                  height: dashedLineHeight,
                  marginBottom: isLastDate ? 0 : -betweenDatesGap,
                  alignItems: 'center',
                }}
              >
                {Array.from({ length: dashCount }).map((_, i) => (
                  <View
                    key={i}
                    style={{
                      width: 2,
                      height: dashLength,
                      backgroundColor: 'rgba(255,255,255,0.4)',
                      borderRadius: 1,
                      marginBottom: i === dashCount - 1 ? 0 : dashGap,
                    }}
                  />
                ))}
              </View>
            )}
          </View>

          {/* [오른쪽] 이벤트 리스트 */}
          <View
            style={{ flex: 1 }}
            onLayout={(e) => {
              const nextHeight = e.nativeEvent.layout.height;
              const prevHeight = eventListHeightsRef.current[date];
              if (!prevHeight || Math.abs(prevHeight - nextHeight) > 2) {
                eventListHeightsRef.current[date] = nextHeight;
                setHeightUpdateTrigger(prev => prev + 1);
              }
            }}
          >
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
                              onPress={() => openInstagramLink(item.event.link)}
                              style={{
                                marginTop: 10,
                                paddingVertical: 6,
                                paddingHorizontal: 12,
                                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                borderRadius: 8,
                                alignSelf: 'flex-start',
                              }}
                            >
                              <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '600' }}>자세히 보기</Text>
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
                      onPress={() => openInstagramLink(event.link)}
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
        
        {/* 하단 SafeArea 여백 (홈버튼 가림 방지) */}
        <View style={{ height: 20, backgroundColor: 'transparent' }} />
      </Animated.View>

      {/* 안드로이드 하단바 배경 */}
      {Platform.OS === 'android' && insets.bottom > 0 && (
        <View style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: insets.bottom,
          backgroundColor: '#ffffff',
        }} />
      )}
      
      {/* ==================== 광고 배너 슬롯 (활성화 시 사용) ==================== */} 
      {/* AD_CONFIG.showBanner && (
        <View style={styles.adBannerContainer}>
          <BannerAd
            unitId={AD_CONFIG.bannerUnitId}
            size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
          />
        </View>
      ) */}
    </View>
  );
}

// ==================== 스타일시트 (성능 최적화) ====================
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  adBannerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  // 자주 사용되는 컨테이너 스타일
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  // 패널 관련 스타일
  panelHandle: {
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 8,
  },
  panelHandleBar: {
    width: 40,
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 3,
  },
  // 이벤트 카드 스타일
  eventCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
  },
  eventTime: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e0e7ff',
  },
  eventLocation: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    marginLeft: 8,
  },
  linkButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  noLinkBadge: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  noLinkText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: '600',
  },
});
