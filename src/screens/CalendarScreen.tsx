import React, {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  PanResponder,
  Alert,
  Platform,
  BackHandler,
  StyleSheet,
  InteractionManager,
  ActivityIndicator,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadEvents, hasMemCache } from "../utils/storage";
import { EventsByDate, Event } from "../types";
import { useTheme } from "../contexts/ThemeContext";
import { useRegion } from "../contexts/RegionContext";
import { safeGetItem, safeSetItem } from "../utils/asyncStorageManager";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../types";
import { useFocusEffect } from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { MainTabParamList } from "../types";
import { CompositeNavigationProp } from "@react-navigation/native";
import MonthCalendar from "../components/MonthCalendar";
import { NotificationPrompt } from "../components/NotificationPrompt";
import { StartupAdModal } from "../components/StartupAdModal";
import PointsModal from "../components/PointsModal";
import usePoints from "../hooks/usePoints";
import useBookmarks from "../hooks/useBookmarks";
import useReminders from "../hooks/useReminders";
import { sendNewEventNotification } from "../services/NotificationService";
import { secureLog } from "../utils/secureStorage";
import { sanitizeText, sanitizeColor, parseLocalDate } from "../utils/sanitize";

type CalendarScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Calendar">,
  NativeStackNavigationProp<RootStackParamList>
>;

interface CalendarScreenProps {
  navigation: CalendarScreenNavigationProp;
}

// 중복 제거 유틸리티 함수
const deduplicateMonths = (months: Array<{ year: number; month: number }>) => {
  const seen = new Set<string>();
  return months.filter((m) => {
    const key = `${m.year}-${m.month}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// ==================== 상수 정의 (성능 최적화) ====================
const PANEL_TAB_KEY = '@panel_tab_preference';
const QUICK_FILTER_KEY = '@quick_filter_preference';
const MONTH_NAMES = [
  "1월",
  "2월",
  "3월",
  "4월",
  "5월",
  "6월",
  "7월",
  "8월",
  "9월",
  "10월",
  "11월",
  "12월",
] as const;
const POLL_INTERVAL = 300000; // 5분 폴링 (배터리 최적화)
const INITIAL_MONTHS_RANGE = 3; // 초기 로드 월 범위 (앞뒤 3개월)



// ==================== 이벤트 카드 (메모이제이션 — 데이터 변경 시에만 재렌더) ====================
interface EventCardProps {
  event: any;
  date: string;
  onPress: (event: any, date: string) => void;
  compact?: boolean;
  marginBottom?: number;
}
const EventCard = React.memo(({ event, date, onPress, compact = false, marginBottom = 12 }: EventCardProps) => {
  const handlePress = React.useCallback(() => onPress(event, date), [onPress, event, date]);
  const containerStyle = React.useMemo(() => [
    ecStyles.container, { paddingTop: compact ? 12 : 16, marginBottom }
  ], [compact, marginBottom]);
  const titleStyle = React.useMemo(() => [
    ecStyles.title, { fontSize: compact ? 15 : 16 }
  ], [compact]);
  const subRowStyle = React.useMemo(() => [
    ecStyles.subRow, { marginBottom: compact ? 6 : 8 }
  ], [compact]);
  const locRowStyle = React.useMemo(() => [
    ecStyles.locRow, { marginBottom: compact ? 6 : 8 }
  ], [compact]);
  const btnStyle = React.useMemo(() => [
    ecStyles.detailBtn, compact ? ecStyles.detailBtnCompact : null
  ], [compact]);
  const btnTextStyle = React.useMemo(() => [
    ecStyles.detailBtnText, compact ? ecStyles.detailBtnTextCompact : null
  ], [compact]);
  return (
    <View style={containerStyle}>
      <Text style={titleStyle} numberOfLines={compact ? 2 : undefined}>
        {sanitizeText(event.title, 100)}
      </Text>
      {event.subEvents && event.subEvents.length > 1 ? (
        <View style={subRowStyle}>
          {event.subEvents.slice(0, 3).map((sub: any, si: number) => (
            <View key={si} style={ecStyles.tag}>
              <Text style={ecStyles.tagText} numberOfLines={1}>
                {sub.location || sub.venue || `지점${si + 1}`}
              </Text>
            </View>
          ))}
          {event.subEvents.length > 3 && (
            <View style={ecStyles.moreTag}>
              <Text style={ecStyles.moreTagText}>+{event.subEvents.length - 3}</Text>
            </View>
          )}
        </View>
      ) : event.location ? (
        <View style={locRowStyle}>
          <View style={ecStyles.tag}>
            <Text style={ecStyles.tagText} numberOfLines={1}>
              {sanitizeText(event.location, 100)}
            </Text>
          </View>
        </View>
      ) : null}
      <Text style={[ecStyles.time, { marginBottom: compact ? 0 : 12 }]}>
        {event.time || '시간 미정'}
      </Text>
      <TouchableOpacity onPress={handlePress} style={btnStyle}>
        <Text style={btnTextStyle}>자세히 보기</Text>
      </TouchableOpacity>
    </View>
  );
});

// ==================== 검색바 (분리된 컴포넌트 — 타이핑 시 부모 리렌더 방지) ====================
interface PanelSearchInputProps {
  onDebouncedChange: (text: string) => void;
  clearSignal: number;
}
const PanelSearchInput = React.memo(({ onDebouncedChange, clearSignal }: PanelSearchInputProps) => {
  const [value, setValue] = React.useState('');
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = React.useRef(onDebouncedChange);
  onChangeRef.current = onDebouncedChange;

  React.useEffect(() => {
    if (clearSignal === 0) return;
    setValue('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onChangeRef.current('');
  }, [clearSignal]);

  const handleChange = React.useCallback((text: string) => {
    setValue(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChangeRef.current(text);
      debounceRef.current = null;
    }, 200);
  }, []);

  const handleClear = React.useCallback(() => {
    setValue('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onChangeRef.current('');
  }, []);

  return (
    <View style={psiStyles.container}>
      <TextInput
        style={psiStyles.input}
        placeholder="제목, 장소, 태그 검색..."
        placeholderTextColor="rgba(255, 255, 255, 0.5)"
        value={value}
        onChangeText={handleChange}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={psiStyles.clearBtn}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

// ==================== CalendarScreen 메인 컴포넌트 ====================

export default function CalendarScreen({ navigation }: CalendarScreenProps) {
  // ==================== 상태 관리 (최소화) ====================
  const [events, setEvents] = useState<EventsByDate>({});
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date().getMonth() + 1
  );
  const [currentYear, setCurrentYear] = useState(() =>
    new Date().getFullYear()
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [visibleMonths, setVisibleMonths] = useState<
    Array<{ year: number; month: number }>
  >([]);
  const [isInitialized, setIsInitialized] = useState(false);
  // App.tsx에서 prefetch된 경우 캐시가 이미 있으므로 로딩 상태 없이 즉시 렌더
  const [isDataReady, setIsDataReady] = useState(() => hasMemCache());
  const [availableRegions, setAvailableRegions] = useState<string[]>([]);
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [showPointsModal, setShowPointsModal] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchClearSignal, setSearchClearSignal] = useState(0);
  const [panelTab, setPanelTab] = useState<'all' | 'bookmarks'>('all');
  const [quickFilter, setQuickFilter] = useState<'all' | 'weekend' | 'age20s' | 'age30s' | 'thisWeek' | 'small' | 'large'>('all');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const INITIAL_VISIBLE_DATES = 5;
  const LOAD_MORE_DATES = 5;
  const [visibleDateGroups, setVisibleDateGroups] = useState(INITIAL_VISIBLE_DATES);
  const MAX_COLLAPSED_EVENTS = 3; // 접힌 상태에서 보여줄 최대 이벤트 수

  // panelTab 복원 (앱 재시작 시 마지막 탭 유지)
  useEffect(() => {
    Promise.all([
      safeGetItem(PANEL_TAB_KEY),
      safeGetItem(QUICK_FILTER_KEY),
    ]).then(([savedTab, savedFilter]) => {
      if (savedTab === 'bookmarks') setPanelTab('bookmarks');
      const validFilters = ['all', 'weekend', 'age20s', 'age30s', 'thisWeek', 'small', 'large'];
      if (savedFilter && validFilters.includes(savedFilter)) {
        setQuickFilter(savedFilter as typeof quickFilter);
      }
    }).catch(() => {});
  }, []);

  // panelTab 변경 시 저장
  const handleSetPanelTab = useCallback((tab: 'all' | 'bookmarks') => {
    setPanelTab(tab);
    safeSetItem(PANEL_TAB_KEY, tab).catch(() => {});
  }, []);

  // ==================== Contexts ====================
  const { theme } = useTheme();
  const { selectedLocation, selectedRegion, clearFilters, setSelectedRegion } =
    useRegion();
  const insets = useSafeAreaInsets();

  // ==================== 포인트 시스템 ====================
  const {
    balance: points,
    history: pointsHistory,
    adCount: dailyAdCount,
    canWatchAd,
    maxAds,
    watchAdForPoints,
    spendPoints,
    addPoints,
  } = usePoints();

  // ==================== 찜/즐겨찾기 & 리마인더 ====================
  const { bookmarks, isBookmarked, toggleBookmark, isLoaded: bookmarksLoaded } = useBookmarks();
  const { hasReminder, scheduleReminder, cancelReminder } = useReminders();

  // ==================== Dimensions (메모이제이션) ====================
  const [dimensions, setDimensions] = useState(() => ({
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height,
  }));
  const { width: screenWidth, height: screenHeight } = dimensions;

  // ==================== Refs (성능 최적화) ====================
  // 패널 애니메이션: height 대신 translateY 사용 → useNativeDriver: true (Android JS 스레드 블로킹 해소)
  // translateY=0 → 패널 완전 확장 | translateY=(maxPH-100) → 100px만 보이는 축소 상태
  const _initH = Dimensions.get('window').height;
  const _initMaxPH = _initH - 100;
  const panelTranslateY = useRef(new Animated.Value(_initMaxPH - 100)).current;
  const panelTranslateYValueRef = useRef(_initMaxPH - 100);
  const panelStartTranslateY = useRef(_initMaxPH - 100);
  const panelAnimRef = useRef<Animated.CompositeAnimation | null>(null); // 애니메이션 충돌 방지
  const screenHeightRef = useRef(screenHeight); // PanResponder 내부용 최신 screenHeight
  screenHeightRef.current = screenHeight;
  const insetsBottomRef = useRef(insets.bottom); // PanResponder 내부용 최신 insets.bottom
  insetsBottomRef.current = insets.bottom;

  // maxPH 계산 헬퍼 (항상 최신 ref 사용 — PanResponder 내부에서도 안전)
  const getMaxPH = useCallback(() => Platform.OS === 'android'
    ? screenHeightRef.current - 100 - insetsBottomRef.current
    : screenHeightRef.current - 100, []);

  // 패널 애니메이션 헬퍼: toHeight → translateY 변환 후 GPU(native) 드라이버로 실행
  const animatePanel = useCallback((toHeight: number, callback?: () => void) => {
    if (panelAnimRef.current) {
      panelAnimRef.current.stop();
    }
    const toTranslate = getMaxPH() - toHeight;
    const anim = Animated.spring(panelTranslateY, {
      toValue: toTranslate,
      useNativeDriver: true, // ← GPU 스레드 실행 (Android 버벅임 핵심 해소)
      tension: 50,
      friction: 8,
    });
    panelAnimRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) panelAnimRef.current = null;
      callback?.();
    });
  }, [panelTranslateY, getMaxPH]);

  // translateY 값 추적
  useEffect(() => {
    const listenerId = panelTranslateY.addListener(({ value }) => {
      panelTranslateYValueRef.current = value;
    });
    return () => { panelTranslateY.removeListener(listenerId); };
  }, [panelTranslateY]);

  // 화면 크기 변경 시(회전 등) 축소 상태의 translateY 재동기화
  useEffect(() => {
    if (!isPanelExpanded) {
      const newMaxPH = Platform.OS === 'android'
        ? screenHeight - 100 - insets.bottom
        : screenHeight - 100;
      const collapsed = newMaxPH - 100;
      panelTranslateY.setValue(collapsed);
      panelTranslateYValueRef.current = collapsed;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenHeight, insets.bottom]);

  const scrollViewRef = useRef<ScrollView>(null);
  const monthHeightsRef = useRef<Record<string, number>>({});

  // 패널 내부 스크롤 상태 추적 (사용자 편의성 개선)
  const panelScrollRef = useRef<ScrollView>(null);
  const panelScrollYRef = useRef(0);
  const isPanelScrollAtTopRef = useRef(true);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUserScrollingRef = useRef(false);
  const previousEventsRef = useRef<EventsByDate>({});
  const isMountedRef = useRef(true); // 마운트 상태 추적 (메모리 누수 방지)
  const isFocusedRef = useRef(true); // 포커스 상태 추적 (마운트와 분리)
  const lastMonthUpdateRef = useRef(0); // 월 변경 throttle

  // ==================== 광고 시스템 (네이티브 빌드 후 활성화) ====================
  // const { showAd: showRewardedAd, loaded: rewardedAdLoaded } = useRewardedAd();
  // const { showAdOnNavigation } = useInterstitialAd();
  // ========================================================================

  const isDark = theme === "dark";

  // ==================== 마운트 상태 관리 ====================
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // preWarmReviews는 App.tsx 병렬 초기화에서 이미 실행됨 (중복 호출 제거)

  // ==================== Dimensions 리스너 (최적화) ====================
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      if (isMountedRef.current) {
        setDimensions({ width: window.width, height: window.height });
      }
    });
    return () => subscription?.remove();
  }, []);

  // ==================== 초기화 (InteractionManager로 UI 블로킹 방지) ====================
  const initialScreenHeightRef = useRef(screenHeight);
  if (initialScreenHeightRef.current === 0 && screenHeight > 0) {
    initialScreenHeightRef.current = screenHeight;
  }

  useEffect(() => {
    if (visibleMonths.length > 0 || initialScreenHeightRef.current === 0) return;

    const currentScreenH = initialScreenHeightRef.current;

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
            totalHeight += monthHeightsRef.current[key] || currentScreenH * 0.7;
          }

          const adjustedHeight = Math.max(0, totalHeight + 56);
          scrollViewRef.current?.scrollTo({
            y: adjustedHeight,
            animated: false,
          });
        });
      } catch (error) {
        secureLog.warn("초기화 실패");
        // 폴백: 현재 월만 표시
        if (isMountedRef.current) {
          const now = new Date();
          setVisibleMonths([
            { year: now.getFullYear(), month: now.getMonth() + 1 },
          ]);
          setCurrentMonth(now.getMonth() + 1);
          setCurrentYear(now.getFullYear());
          setIsInitialized(true);
        }
      }
    });

    return () => interactionHandle.cancel();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScreenHeightRef.current > 0]);

  // ==================== 패널 애니메이션 (최적화) ====================

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isPanelExpandedRef.current, // 축소 상태에선 탭도 캐치
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // 수직 제스처만 인식 (dy가 dx보다 클 때, 최소 5px 이동)
        return Math.abs(gestureState.dy) > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderTerminationRequest: () => true,
      onPanResponderGrant: () => {
        panelStartTranslateY.current = panelTranslateYValueRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const maxH = Platform.OS === 'android'
          ? screenHeightRef.current - 100 - insetsBottomRef.current
          : screenHeightRef.current - 100;
        const maxTranslate = maxH - 100;
        const newTranslate = panelStartTranslateY.current + gestureState.dy;
        if (newTranslate >= 0 && newTranslate <= maxTranslate) {
          panelTranslateY.setValue(newTranslate);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const threshold = 50;
        const maxH = Platform.OS === 'android'
          ? screenHeightRef.current - 100 - insetsBottomRef.current
          : screenHeightRef.current - 100;
        const maxTranslate = maxH - 100;
        const midTranslate = maxTranslate / 2;

        // 탭 감지: 거의 움직이지 않은 터치 → 축소 상태면 펼치기
        if (!isPanelExpandedRef.current && Math.abs(gestureState.dy) < 10 && Math.abs(gestureState.dx) < 10) {
          setIsPanelExpanded(true);
          animatePanel(maxH);
          return;
        }
        
        if (gestureState.dy < -threshold) {
          setIsPanelExpanded(true);
          animatePanel(maxH);
        } else if (gestureState.dy > threshold) {
          setIsPanelExpanded(false);
          animatePanel(100);
        } else {
          const ct = panelTranslateYValueRef.current;
          if (ct < midTranslate) {
            setIsPanelExpanded(true);
            animatePanel(maxH);
          } else {
            setIsPanelExpanded(false);
            animatePanel(100);
          }
        }
      },
    })
  ).current;

  // 패널 콘텐츠 영역 드래그 (ScrollView가 맨 위에 있을 때 아래로 드래그하면 패널 닫힘)
  const panelContentPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // 패널이 축소 상태면 절대 가로채지 않음
        const maxH = Platform.OS === 'android'
          ? screenHeightRef.current - 100 - insetsBottomRef.current
          : screenHeightRef.current - 100;
        const currentTranslate = panelTranslateYValueRef.current;
        if (currentTranslate >= maxH - 120) return false;

        const isAtTop = isPanelScrollAtTopRef.current;
        // 임계값 상향: 확실한 아래 방향 드래그(40px + 속도 0.3 이상)만 패널 닫기로 처리
        const isDraggingDown = gestureState.dy > 40 && gestureState.vy > 0.3;
        // 수직 판별 강화: x축 대비 y축이 2.5배 이상이어야 함
        const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 2.5;
        return isAtTop && isDraggingDown && isVertical;
      },
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderTerminationRequest: () => true,
      onPanResponderGrant: () => {
        panelStartTranslateY.current = panelTranslateYValueRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          const maxH = Platform.OS === 'android'
            ? screenHeightRef.current - 100 - insetsBottomRef.current
            : screenHeightRef.current - 100;
          const newTranslate = panelStartTranslateY.current + gestureState.dy;
          if (newTranslate <= maxH - 100) {
            panelTranslateY.setValue(newTranslate);
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const threshold = 50;
        const maxH = Platform.OS === 'android'
          ? screenHeightRef.current - 100 - insetsBottomRef.current
          : screenHeightRef.current - 100;
        const maxTranslate = maxH - 100;
        const midTranslate = maxTranslate / 2;
        
        if (gestureState.dy < -threshold) {
          setIsPanelExpanded(true);
          animatePanel(maxH);
        } else if (gestureState.dy > threshold) {
          setIsPanelExpanded(false);
          animatePanel(100);
        } else {
          const ct = panelTranslateYValueRef.current;
          if (ct < midTranslate) {
            setIsPanelExpanded(true);
            animatePanel(maxH);
          } else {
            setIsPanelExpanded(false);
            animatePanel(100);
          }
        }
      },
    })
  ).current;

  const expandPanel = useCallback(() => {
    setIsPanelExpanded(true);
    const maxH = Platform.OS === 'android'
      ? screenHeight - 100 - insets.bottom
      : screenHeight - 100;
    animatePanel(maxH);
  }, [animatePanel, screenHeight, insets.bottom]);

  const collapsePanel = useCallback(() => {
    setIsPanelExpanded(false);
    animatePanel(100);
  }, [animatePanel]);

  // ==================== UI 핸들러 (useCallback으로 최적화) ====================
  const handleGoToToday = useCallback(() => {
    const today = new Date();
    isUserScrollingRef.current = false;
    setCurrentMonth(today.getMonth() + 1);
    setCurrentYear(today.getFullYear());
  }, []);

  const handleNavigateSettings = useCallback(() => {
    navigation.navigate("Settings");
  }, [navigation]);

  const handleNavigateToEventDetail = useCallback((event: any, date: string) => {
    navigation.navigate('EventDetail', { event, date });
  }, [navigation]);

  const handleNavigateLocationPicker = useCallback(() => {
    navigation.navigate("LocationPicker");
  }, [navigation]);

  const handleDatePress = useCallback((date: string) => {
    setSelectedDate(date);
    setQuickFilter('all');
    expandPanel();
  }, [expandPanel]);

  const handleClearSelectedDate = useCallback(() => {
    setSelectedDate(null);
    setQuickFilter('all');
  }, []);

  const handleClearSearch = useCallback(() => {
    setDebouncedSearch('');
    setSearchClearSignal(c => c + 1);
  }, []);

  const handleTabAll = useCallback(() => handleSetPanelTab('all'), [handleSetPanelTab]);
  const handleTabBookmarks = useCallback(() => handleSetPanelTab('bookmarks'), [handleSetPanelTab]);

  const handleToggleDateExpand = useCallback((date: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }, []);

  const handleQuickFilter = useCallback((filter: 'all' | 'weekend' | 'age20s' | 'age30s' | 'thisWeek' | 'small' | 'large') => {
    setQuickFilter(filter);
    safeSetItem(QUICK_FILTER_KEY, filter).catch(() => {});
  }, []);

  const handleCloseNotificationPrompt = useCallback(() => {
    setNotificationPromptClosed(true);
  }, []);

  const handleCloseAdModal = useCallback(() => {
    setShowAdModal(false);
  }, []);

  const handleClosePointsModal = useCallback(() => {
    setShowPointsModal(false);
  }, []);

  const handleRegionPress = useCallback((region: string) => {
    if (selectedRegion === region) {
      clearFilters();
    } else {
      setSelectedRegion(region);
    }
  }, [selectedRegion, clearFilters, setSelectedRegion]);

  // ==================== 월 변경 시 자동 스크롤 ====================
  useEffect(() => {
    if (visibleMonths.length > 0 && !isUserScrollingRef.current) {
      const targetIndex = visibleMonths.findIndex(
        (m) => m.month === currentMonth && m.year === currentYear
      );

      if (targetIndex !== -1) {
        let totalHeight = 0;
        for (let i = 0; i < targetIndex && i < visibleMonths.length; i++) {
          const key = `${visibleMonths[i].year}-${visibleMonths[i].month}`;
          const height = monthHeightsRef.current[key] || screenHeight * 0.7;
          totalHeight += height;
        }

        // 월 헤더 높이를 빼서 월 헤더가 요일 헤더 바로 아래에 오도록 조정
        const monthHeaderHeight = -56;
        const adjustedHeight = Math.max(0, totalHeight - monthHeaderHeight);

        scrollViewRef.current?.scrollTo({
          y: adjustedHeight,
          animated: true,
        });
      }
    }
  }, [currentMonth, currentYear]);

  const visibleMonthTabs = useMemo(() => {
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
  }, [currentMonth, screenWidth]);

  const handleMonthTabPress = useCallback((idx: number) => {
    const tabMonths = visibleMonthTabs;
    const middleIndex = Math.floor(tabMonths.length / 2);
    const offset = idx - middleIndex;
    let newMonth = currentMonth + offset;
    let newYear = currentYear;
    if (newMonth < 1) { newMonth += 12; newYear--; }
    else if (newMonth > 12) { newMonth -= 12; newYear++; }
    isUserScrollingRef.current = false;
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  }, [visibleMonthTabs, currentMonth, currentYear]);

  const upcomingEvents = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    // thisWeek 범위: 한 번만 계산
    let weekEndTime = 0;
    if (quickFilter === 'thisWeek') {
      const endOfWeek = new Date(today);
      endOfWeek.setDate(endOfWeek.getDate() + (7 - today.getDay()));
      endOfWeek.setHours(23, 59, 59, 999);
      weekEndTime = endOfWeek.getTime();
    }

    const passesQuickFilter = (event: any, ts: number): boolean => {
      if (quickFilter === 'all') return true;
      if (quickFilter === 'weekend') {
        const dow = new Date(ts).getDay();
        return dow === 0 || dow === 5 || dow === 6;
      }
      if (quickFilter === 'thisWeek') return ts <= weekEndTime;
      if (quickFilter === 'age20s') {
        if (!event.ageRange) return false;
        const nums = event.ageRange.match(/\d+/g);
        if (!nums) return false;
        const min = parseInt(nums[0], 10);
        const max = nums[1] ? parseInt(nums[1], 10) : min;
        return min >= 20 && max < 40;
      }
      if (quickFilter === 'age30s') {
        if (!event.ageRange) return false;
        const nums = event.ageRange.match(/\d+/g);
        if (!nums) return false;
        const max = nums[1] ? parseInt(nums[1], 10) : parseInt(nums[0], 10);
        return max >= 30;
      }
      if (quickFilter === 'small') {
        const total = (event.maleCapacity || 0) + (event.femaleCapacity || 0);
        return total > 0 && total <= 20;
      }
      if (quickFilter === 'large') {
        const total = (event.maleCapacity || 0) + (event.femaleCapacity || 0);
        return total > 20;
      }
      return true;
    };

    const passesSearch = (event: any): boolean => {
      if (!q) return true;
      return (
        event.title?.toLowerCase().includes(q) ||
        event.location?.toLowerCase().includes(q) ||
        event.region?.toLowerCase().includes(q) ||
        event.description?.toLowerCase().includes(q) ||
        event.venue?.toLowerCase().includes(q) ||
        (event.tags && event.tags.some((t: string) => t.toLowerCase().includes(q)))
      );
    };

    // 선택된 날짜: 단순 순회
    if (selectedDate) {
      if (!events[selectedDate]) return [];
      const result: Array<{ date: string; event: any }> = [];
      for (const event of events[selectedDate]) {
        if (selectedRegion && event.region !== selectedRegion) continue;
        if (selectedLocation && event.location !== selectedLocation) continue;
        if (!passesSearch(event)) continue;
        result.push({ date: selectedDate, event });
      }
      result.sort((a, b) => (a.event.time || 'ZZ:ZZ').localeCompare(b.event.time || 'ZZ:ZZ'));
      return result;
    }

    // 전체 이벤트: 단일 for-of 순회 (flatMap + filter×4 대비 최대 5배 빠름)
    const result: Array<{ date: string; event: any; _ts: number }> = [];

    for (const [date, eventList] of Object.entries(events)) {
      const p = date.split('-');
      if (p.length !== 3) continue;
      const ts = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)).getTime();
      if (ts < todayTime) continue;

      for (const event of eventList) {
        if (selectedRegion && event.region !== selectedRegion) continue;
        if (selectedLocation && event.location !== selectedLocation) continue;
        if (!passesQuickFilter(event, ts)) continue;
        if (!passesSearch(event)) continue;
        result.push({ date, event, _ts: ts });
      }
    }

    // 정렬: 캐시된 _ts 재활용 (parseLocalDate 중복 호출 제거)
    result.sort((a, b) => {
      const diff = a._ts - b._ts;
      return diff !== 0 ? diff : (a.event.time || 'ZZ:ZZ').localeCompare(b.event.time || 'ZZ:ZZ');
    });

    return result as unknown as Array<{ date: string; event: any }>;
  }, [events, selectedDate, selectedRegion, selectedLocation, debouncedSearch, quickFilter]);

  // ==================== 추천 파티 (프로모션 광고 + 일반) ====================
  // 날짜별 그룹화 (렌더 함수에서 매번 재계산하지 않도록 useMemo 분리)
  const groupedUpcoming = useMemo(() => {
    if (selectedDate) return null; // 날짜 선택 시 불필요
    const grouped: { [key: string]: Array<{ date: string; event: any }> } = {};
    for (const item of upcomingEvents) {
      if (!grouped[item.date]) grouped[item.date] = [];
      grouped[item.date].push(item);
    }
    return grouped;
  }, [upcomingEvents, selectedDate]);

  // ==================== 패널 \uc774\ubca4\ud2b8 \ub9ac\uc2a4\ud2b8 \uc0ac\uc804\uc5f0\uc0b0 (memoized) ====================
  // groupedDateElements: \ub0a0\uc9dc\ubcc4 \uadf8\ub8f9 \ub80c\ub354\ub9c1 \ucee8\ud150\uce20.
  // groupedUpcoming / expandedDates / isDark \uac00 \ubc14\ub00c\uc9c0 \uc54a\uc73c\uba74 \uc7ac\uc0dd\uc131 \uc548 \ud568
  // (\ud328\ub110 \uc5f4\uae30/\ub2eb\uae30, \uc6d4 \uc2a4\ud06c\ub864 \ub4f1\uc5d0\uc11c \uc7ac\uc0dd\uc131 \ubc1c\uc0dd \uc548 \ud568)
  const groupedDateElements = useMemo(() => {
    if (!groupedUpcoming) return null;
    const dates = Object.keys(groupedUpcoming);
    return dates.map((date, dateIndex) => {
      const eventsForDate = groupedUpcoming[date];
      const eventDate = parseLocalDate(date);
      const day = eventDate.getDate();
      const monthName = MONTH_NAMES[eventDate.getMonth()];
      const isLastDate = dateIndex === dates.length - 1;
      const isDateExpanded = expandedDates.has(date);
      const totalCount = eventsForDate.length;
      const shouldCollapse = totalCount > MAX_COLLAPSED_EVENTS && !isDateExpanded;
      const visibleEvents = shouldCollapse ? eventsForDate.slice(0, MAX_COLLAPSED_EVENTS) : eventsForDate;
      const hiddenCount = totalCount - MAX_COLLAPSED_EVENTS;

      return (
        <View
          key={date}
          style={isLastDate ? gdStyles.rowLast : gdStyles.row}
        >
          {/* [왼쪽] 날짜 버블 + 연결선 */}
          <View style={gdStyles.bubbleCol}>
            <View style={[panelStyles.dateBubble, { backgroundColor: isDark ? '#334155' : '#ffffff' }]}>
              <Text style={[gdStyles.dayText, { color: isDark ? '#a78bfa' : '#ec4899' }]}>{day}</Text>
              <Text style={[gdStyles.monthText, { color: isDark ? '#a78bfa' : '#ec4899' }]}>{monthName}</Text>
            </View>
            {!isLastDate && <View style={panelStyles.dateLine} />}
          </View>

          {/* [오른쪽] 이벤트 리스트 */}
          <View style={gdStyles.eventCol}>
            {totalCount >= 5 && (
              <View style={gdStyles.countWrap}>
                <Text style={panelStyles.dateCountLabel}>{totalCount}개 일정</Text>
              </View>
            )}
            {visibleEvents.map((item, eventIndex) => (
              <EventCard
                key={`${date}-${item.event.id}-${eventIndex}`}
                event={item.event}
                date={item.date}
                onPress={handleNavigateToEventDetail}
                compact={true}
                marginBottom={eventIndex < visibleEvents.length - 1 || shouldCollapse ? 12 : 0}
              />
            ))}
            {shouldCollapse && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleToggleDateExpand(date)}
                style={panelStyles.moreBtn}
              >
                <Text style={panelStyles.moreBtnText}>+{hiddenCount}개 더 보기</Text>
              </TouchableOpacity>
            )}
            {isDateExpanded && totalCount > MAX_COLLAPSED_EVENTS && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleToggleDateExpand(date)}
                style={panelStyles.foldBtn}
              >
                <Text style={panelStyles.foldBtnText}>접기</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    });
  }, [groupedUpcoming, expandedDates, isDark, handleNavigateToEventDetail, handleToggleDateExpand]);

  // 날짜 그룹 데이터 변경 시 표시 개수 리셋
  useEffect(() => {
    if (groupedUpcoming) setVisibleDateGroups(INITIAL_VISIBLE_DATES);
  }, [groupedUpcoming]);

  // 더보기 핸들러
  const handleLoadMoreDates = useCallback(() => {
    setVisibleDateGroups(prev => prev + LOAD_MORE_DATES);
  }, []);

  // selectedDateElements: \ub0a0\uc9dc \uc120\ud0dd \uc2dc \uc774\ubca4\ud2b8 \ub9ac\uc2a4\ud2a4 \ucee8\ud150\uce20
  const selectedDateElements = useMemo(() => {
    if (!selectedDate) return null;
    const selectedDateKey = selectedDate;
    const isSelectedExpanded = expandedDates.has(selectedDateKey);
    const totalSelected = upcomingEvents.length;
    const shouldCollapseSelected = totalSelected > MAX_COLLAPSED_EVENTS && !isSelectedExpanded;
    const visibleSelected = shouldCollapseSelected ? upcomingEvents.slice(0, MAX_COLLAPSED_EVENTS) : upcomingEvents;
    const hiddenSelectedCount = totalSelected - MAX_COLLAPSED_EVENTS;
    return (
      <>
        {totalSelected >= 5 && (
          <View style={panelStyles.selectedDateCountLabel}>
            <Text style={panelStyles.selectedDateCountText}>{totalSelected}개 일정</Text>
          </View>
        )}
        {visibleSelected.map(({ date, event }, index) => (
          <EventCard
            key={`${date}-${event.id}-${index}`}
            event={event}
            date={date}
            onPress={handleNavigateToEventDetail}
            compact={false}
            marginBottom={12}
          />
        ))}
        {shouldCollapseSelected && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handleToggleDateExpand(selectedDateKey)}
            style={[panelStyles.moreBtn, { marginBottom: 12 }]}
          >
            <Text style={panelStyles.moreBtnText}>+{hiddenSelectedCount}개 더 보기</Text>
          </TouchableOpacity>
        )}
        {isSelectedExpanded && totalSelected > MAX_COLLAPSED_EVENTS && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handleToggleDateExpand(selectedDateKey)}
            style={[panelStyles.foldBtn, { marginTop: 0 }]}
          >
            <Text style={panelStyles.foldBtnText}>접기</Text>
          </TouchableOpacity>
        )}
      </>
    );
  }, [upcomingEvents, selectedDate, expandedDates, handleNavigateToEventDetail, handleToggleDateExpand]);

  // visibleMonths 중복 제거 + 최대 개수 제한 (정기 클린업)
  const MAX_VISIBLE_MONTHS = 24;
  React.useEffect(() => {
    setVisibleMonths((prev) => {
      let cleaned = deduplicateMonths(prev);
      if (cleaned.length > MAX_VISIBLE_MONTHS) {
        // 현재 월 기준으로 가장 가까운 MAX_VISIBLE_MONTHS개만 유지
        const currentIdx = cleaned.findIndex(
          (m) => m.year === currentYear && m.month === currentMonth
        );
        if (currentIdx >= 0) {
          const start = Math.max(0, currentIdx - Math.floor(MAX_VISIBLE_MONTHS / 2));
          cleaned = cleaned.slice(start, start + MAX_VISIBLE_MONTHS);
        } else {
          cleaned = cleaned.slice(-MAX_VISIBLE_MONTHS);
        }
      }
      return cleaned.length !== prev.length ? cleaned : prev;
    });
  }, [currentMonth, currentYear]);

  // ==================== 데이터 처리 함수 ====================

  // 이미 알림을 보낸 이벤트 추적 (중복 방지)
  const notifiedEventsRef = useRef(new Set<string>());

  // 새 일정 감지 함수
  const checkForNewEvents = useCallback(
    (oldEvents: EventsByDate, newEvents: EventsByDate) => {
      // 초기 로드 시에는 알림 보내지 않음
      if (Object.keys(oldEvents).length === 0) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      Object.keys(newEvents).forEach((date) => {
        const eventDate = parseLocalDate(date);
        eventDate.setHours(0, 0, 0, 0);

        // 오늘 이후의 일정만 확인
        if (eventDate < today) return;

        const oldEventIds = new Set(
          (oldEvents[date] || []).map((e) => `${e.id}-${e.title}`)
        );

        newEvents[date].forEach((event) => {
          const eventKey = `${date}:${event.id}-${event.title}`;

          // 이미 알림을 보낸 이벤트는 건너뜀
          if (notifiedEventsRef.current.has(eventKey)) return;

          // 새로 추가된 일정이면 알림 전송 (안전하게)
          if (!oldEventIds.has(`${event.id}-${event.title}`)) {
            try {
              const parsedNotifDate = parseLocalDate(date);
              const formattedDate = parsedNotifDate.toLocaleDateString("ko-KR", {
                month: "long",
                day: "numeric",
              });
              sendNewEventNotification(event.title, formattedDate);
              notifiedEventsRef.current.add(eventKey);

              // 메모리 관리: 500개 초과 시 오래된 항목 정리
              if (notifiedEventsRef.current.size > 500) {
                const entries = Array.from(notifiedEventsRef.current);
                notifiedEventsRef.current = new Set(entries.slice(-250));
              }
            } catch (notifError) {
              // Expo Go에서는 알림이 작동하지 않을 수 있음 (무시)
            }
          }
        });
      });
    },
    []
  );

  // 마지막 로드된 이벤트 참조 추적 (동일 객체 참조 시 setEvents 스킵 — 탭 전환 불필요 재계산 방지)
  const lastEventsRef = useRef<EventsByDate | null>(null);

  // 이벤트 데이터 로드 (최적화)
  const loadEventsData = useCallback(async () => {
    try {
      const loadedEvents = await loadEvents(false);

      if (!loadedEvents || typeof loadedEvents !== "object") {
        if (isMountedRef.current) {
          setEvents({});
          setAvailableRegions([]);
        }
        return;
      }

      // 동일 객체 참조(memCache 히트)면 setEvents 스킵 → upcomingEvents 등 전체 재계산 방지
      if (loadedEvents === lastEventsRef.current) {
        if (isMountedRef.current) setIsDataReady(true);
        return;
      }

      // 초기 로드 시 이전 데이터 저장
      previousEventsRef.current = loadedEvents;
      lastEventsRef.current = loadedEvents;

      if (isMountedRef.current) {
        setEvents(loadedEvents);

        // 지역 목록 추출을 InteractionManager로 지연 → setEvents 렌더가 먼저 완료됨
        InteractionManager.runAfterInteractions(() => {
          if (!isMountedRef.current) return;
          const regionCount = new Map<string, number>();
          for (const eventList of Object.values(loadedEvents)) {
            for (const event of eventList) {
              if (event?.region) {
                regionCount.set(
                  event.region,
                  (regionCount.get(event.region) || 0) + 1
                );
              }
            }
          }

          const sortedRegions = Array.from(regionCount.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([region]) => region);
          if (isMountedRef.current) setAvailableRegions(sortedRegions);
        });
      }
    } catch (error) {
      secureLog.warn("데이터 로드 실패");
      if (isMountedRef.current) {
        setEvents({});
        setAvailableRegions([]);
      }
    }
  }, []);

  // ==================== 데이터 로드 및 폴링 ====================
  // 패널 상태를 ref로 추적 (useFocusEffect 의존성 최소화)
  const isPanelExpandedRef = useRef(isPanelExpanded);
  const selectedDateRef = useRef(selectedDate);
  isPanelExpandedRef.current = isPanelExpanded;
  selectedDateRef.current = selectedDate;
  
  useFocusEffect(
    useCallback(() => {
      // 포커스 상태 추적 (마운트 상태와 분리)
      isFocusedRef.current = true;

      // 초기 데이터 로드 (안전하게)
      const loadData = async () => {
        try {
          await loadEventsData();
          if (isMountedRef.current) {
            setIsDataReady(true);
          }
        } catch (err) {
          secureLog.warn("초기 데이터 로드 실패");
          if (isMountedRef.current) {
            setIsDataReady(true); // 실패해도 UI 표시
          }
        }
      };

      loadData();

      // 폴링 설정 (배터리 최적화)
      pollIntervalRef.current = setInterval(async () => {
        if (!isFocusedRef.current || !isMountedRef.current) return;

        try {
          const latestEvents = await loadEvents(true);

          if (
            latestEvents &&
            typeof latestEvents === "object" &&
            isMountedRef.current
          ) {
            // 동일 참조(데이터 변경 없음) → 상태 업데이트 및 useMemo 체인 전부 스킵
            if (latestEvents === previousEventsRef.current) return;

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
      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          if (isPanelExpandedRef.current) {
            if (selectedDateRef.current) {
              setSelectedDate(null);
              return true;
            } else {
              collapsePanel();
              return true;
            }
          }
          return false;
        }
      );

      // 클린업 함수
      return () => {
        isFocusedRef.current = false;
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
    }, [loadEventsData, checkForNewEvents, collapsePanel])
  );



  // ==================== 로딩 화면 ====================
  // 알림 프롬프트 닫힌 후 광고 모달 표시 상태
  const [showAdModal, setShowAdModal] = useState(false);
  const [notificationPromptClosed, setNotificationPromptClosed] = useState(false);

  // 알림 프롬프트가 닫히면 광고 모달 표시
  useEffect(() => {
    if (notificationPromptClosed && isInitialized) {
      // 약간의 딜레이 후 광고 모달 표시
      const timer = setTimeout(() => {
        setShowAdModal(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [notificationPromptClosed, isInitialized]);

  // ==================== 재사용 렌더 조각 (memoized) ====================
  // 헤더 (연도·월탭·오늘버튼): 헤더 관련 state 변경 시에만 재생성
  const calendarHeader = useMemo(() => (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 0,
        backgroundColor: isDark ? "#1e293b" : "#ffffff",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 3,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          gap: 8,
        }}
      >
        {/* 왼쪽 영역 - flex로 자동 조절 */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}
        >
          <Text
            style={{
              fontSize: 28,
              fontWeight: "900",
              color: isDark ? "#f8fafc" : "#0f172a",
            }}
          >
            {currentYear}
          </Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleGoToToday}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 12,
              backgroundColor: isDark ? "#334155" : "#f1f5f9",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: isDark ? "#e2e8f0" : "#475569",
              }}
            >
              오늘
            </Text>
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
                backgroundColor: isDark ? "#a78bfa" : "#ec4899",
                flexDirection: "row",
                alignItems: "center",
                maxWidth: screenWidth - 280,
                flexShrink: 1,
              }}
            >
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: "#ffffff",
                  flexShrink: 1,
                }}
              >
                {selectedLocation || selectedRegion}
              </Text>
              <Text style={{ fontSize: 11, color: "#ffffff", marginLeft: 4 }}>
                ✕
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 오른쪽 영역 - 고정 너비 */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleNavigateSettings}
            style={{
              padding: 10,
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View
              style={{
                width: 22,
                height: 18,
                justifyContent: "space-between",
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 2,
                  backgroundColor: isDark ? "#f8fafc" : "#0f172a",
                  borderRadius: 2,
                }}
              />
              <View
                style={{
                  width: 22,
                  height: 2,
                  backgroundColor: isDark ? "#f8fafc" : "#0f172a",
                  borderRadius: 2,
                }}
              />
              <View
                style={{
                  width: 22,
                  height: 2,
                  backgroundColor: isDark ? "#f8fafc" : "#0f172a",
                  borderRadius: 2,
                }}
              />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* 월 탭 네비게이션 */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 0,
          paddingHorizontal: screenWidth >= 600 ? 40 : 10,
        }}
      >
        {visibleMonthTabs.map((monthNum, idx) => {
          const isActive = monthNum === currentMonth;
          return (
            <TouchableOpacity
              key={`${monthNum}-${idx}`}
              activeOpacity={0.7}
              onPress={() => handleMonthTabPress(idx)}
              style={{
                alignItems: "center",
                paddingVertical: 8,
                paddingHorizontal: 4,
              }}
            >
              <Text
                style={{
                  fontSize: isActive ? 16 : 13,
                  fontWeight: isActive ? "800" : "600",
                  color: isActive
                    ? isDark
                      ? "#a78bfa"
                      : "#ec4899"
                    : isDark
                    ? "#64748b"
                    : "#94a3b8",
                  letterSpacing: 0.5,
                }}
              >
                {MONTH_NAMES[monthNum - 1]}
              </Text>
              {isActive && (
                <View
                  style={{
                    width: 24,
                    height: 3,
                    backgroundColor: isDark ? "#a78bfa" : "#ec4899",
                    marginTop: 6,
                    borderRadius: 2,
                  }}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  ), [isDark, currentYear, selectedRegion, selectedLocation, screenWidth, visibleMonthTabs, currentMonth, handleGoToToday, clearFilters, handleNavigateSettings, handleMonthTabPress]);

  // 요일 헤더: isDark / screenWidth 변경 시에만 재생성
  const weekDayHeader = useMemo(() => (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: isDark ? "#1e293b" : "#ffffff",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
      }}
    >
      {["일", "월", "화", "수", "목", "금", "토"].map((day, index) => (
        <View key={day} style={{ width: screenWidth / 7, paddingVertical: 14 }}>
          <Text
            style={{
              textAlign: "center",
              fontSize: screenWidth / 7 < 50 ? 10 : 12,
              fontWeight: "700",
              letterSpacing: 0.5,
              color:
                index === 0
                  ? "#ef4444"
                  : index === 6
                  ? "#3b82f6"
                  : isDark
                  ? "#cbd5e1"
                  : "#475569",
            }}
          >
            {day}
          </Text>
        </View>
      ))}
    </View>
  ), [isDark, screenWidth]);

  // 지역 필터 바: 지역 목록 / 선택 필터 / isDark 변경 시에만 재생성
  const regionFilterBar = useMemo(() => (
    <View
      style={{
        backgroundColor: isDark ? "#1e293b" : "#ffffff",
        paddingVertical: 8,
        paddingHorizontal: 16,
      }}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={clearFilters}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 20,
            backgroundColor:
              !selectedRegion && !selectedLocation
                ? isDark ? "#a78bfa" : "#ec4899"
                : isDark ? "#334155" : "#f1f5f9",
            marginRight: 8,
            minWidth: 60,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              color:
                !selectedRegion && !selectedLocation
                  ? "#ffffff"
                  : isDark ? "#94a3b8" : "#64748b",
            }}
          >
            전체
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleNavigateLocationPicker}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 20,
            backgroundColor: isDark ? "#334155" : "#f1f5f9",
            marginRight: 8,
            minWidth: 60,
            alignItems: "center",
            borderWidth: 1,
            borderColor: isDark ? "#475569" : "#e2e8f0",
            borderStyle: "dashed",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: isDark ? "#94a3b8" : "#64748b" }}>
            + 상세
          </Text>
        </TouchableOpacity>

        {availableRegions.map((region) => (
          <TouchableOpacity
            key={region}
            activeOpacity={0.7}
            onPress={() => handleRegionPress(region)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 20,
              backgroundColor:
                selectedRegion === region
                  ? isDark ? "#a78bfa" : "#ec4899"
                  : isDark ? "#334155" : "#f1f5f9",
              marginRight: 8,
              minWidth: 60,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color:
                  selectedRegion === region
                    ? "#ffffff"
                    : isDark ? "#94a3b8" : "#64748b",
              }}
            >
              {region}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  ), [isDark, availableRegions, selectedRegion, selectedLocation, clearFilters, handleNavigateLocationPicker, handleRegionPress]);

  // ==================== 동적 스타일 (useMemo — 렌더마다 객체 재생성 방지) ====================
  // 훅은 early return 전에 선언해야 React 규칙 준수
  const rootStyle = useMemo(() => ({
    flex: 1,
    backgroundColor: isDark ? "#0f172a" : "#ffffff",
    paddingTop: insets.top,
    paddingBottom: Platform.OS === "android" ? insets.bottom : 0,
    paddingLeft: insets.left,
    paddingRight: insets.right,
  }), [isDark, insets.top, insets.bottom, insets.left, insets.right]);

  const panelContainerStyle = useMemo(() => [
    rnStyles.panelBase,
    {
      bottom: Platform.OS === "android" ? insets.bottom : 0,
      height: Platform.OS === 'android' ? screenHeight - 100 - insets.bottom : screenHeight - 100,
      transform: [{ translateY: panelTranslateY }],
      backgroundColor: isDark ? "#a78bfa" : "#ec4899",
      paddingBottom: Platform.OS === "ios" ? Math.max(insets.bottom, 30) : 16,
    },
  ], [isDark, insets.bottom, screenHeight, panelTranslateY]);

  const panelContentWrapStyle = useMemo(() => ({
    flex: 1,
    display: isPanelExpanded ? 'flex' as const : 'none' as const,
  }), [isPanelExpanded]);

  if (!isInitialized || screenHeight === 0 || screenWidth === 0) {
    return (
      <View
        style={[
          styles.loadingContainer,
          {
            backgroundColor: isDark ? "#0f172a" : "#ffffff",
            paddingTop: insets.top,
          },
        ]}
      >
        <ActivityIndicator
          size="large"
          color={isDark ? "#a78bfa" : "#ec4899"}
        />
        <Text
          style={[
            styles.loadingText,
            { color: isDark ? "#94a3b8" : "#64748b" },
          ]}
        >
          로딩 중...
        </Text>
      </View>
    );
  }

  return (
    <View style={rootStyle}>
      {/* 헤더 */}
      {calendarHeader}

      {/* 지역 필터 바 */}
      {regionFilterBar}

      {/* 요일 헤더 - 고정 */}
      {weekDayHeader}

      {/* 캘린더 */}
      <ScrollView
        ref={scrollViewRef}
        style={rnStyles.flex1}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!isPanelExpanded}
        scrollEventThrottle={Platform.OS === 'android' ? 32 : 16}
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

          // 사용자가 직접 스크롤할 때만 월 업데이트 (throttle 적용)
          if (isUserScrollingRef.current) {
            const now = Date.now();
            if (now - lastMonthUpdateRef.current < 100) return; // 100ms throttle

            // 즉시 월 계산 및 업데이트
            let accumulatedHeight = 0;
            let targetMonthIndex = 0;

            for (let i = 0; i < visibleMonths.length; i++) {
              if (!visibleMonths[i]) continue;
              const key = `${visibleMonths[i].year}-${visibleMonths[i].month}`;
              const height = monthHeightsRef.current[key] || screenHeight * 0.7;

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
                lastMonthUpdateRef.current = now;
              }
            }
          }

          // 무한 스크롤 (중복 방지 강화)
          if (scrollY + layoutHeight >= contentHeight - 500) {
            const lastMonth =
              visibleMonths.length > 0
                ? visibleMonths[visibleMonths.length - 1]
                : null;
            if (lastMonth) {
              let nextMonth = lastMonth.month + 1;
              let nextYear = lastMonth.year;
              if (nextMonth > 12) {
                nextMonth = 1;
                nextYear++;
              }

              setVisibleMonths((prev) => {
                if (prev.length >= MAX_VISIBLE_MONTHS) return prev;
                const key = `${nextYear}-${nextMonth}`;
                const exists = prev.some((m) => `${m.year}-${m.month}` === key);
                if (exists) return prev;
                return [...prev, { year: nextYear, month: nextMonth }];
              });
            }
          }

          if (scrollY <= 500) {
            const firstMonth =
              visibleMonths.length > 0 ? visibleMonths[0] : null;
            if (firstMonth) {
              let prevMonth = firstMonth.month - 1;
              let prevYear = firstMonth.year;
              if (prevMonth < 1) {
                prevMonth = 12;
                prevYear--;
              }

              setVisibleMonths((prev) => {
                if (prev.length >= MAX_VISIBLE_MONTHS) return prev;
                const key = `${prevYear}-${prevMonth}`;
                const exists = prev.some((m) => `${m.year}-${m.month}` === key);
                if (exists) return prev;

                const newMonths = [
                  { year: prevYear, month: prevMonth },
                  ...prev,
                ];

                // 스크롤 위치 보정
                requestAnimationFrame(() => {
                  const heightKey = `${prevYear}-${prevMonth}`;
                  const addedHeight =
                    monthHeightsRef.current[heightKey] || screenHeight * 0.7;
                  scrollViewRef.current?.scrollTo({
                    y: scrollY + addedHeight,
                    animated: false,
                  });
                });

                return newMonths;
              });
            }
          }
        }}
      >
        {visibleMonths.map((monthData) => (
          <View
            key={`${monthData.year}-${monthData.month}`}
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
              onDatePress={handleDatePress}
            />
          </View>
        ))}
      </ScrollView>

      {/* 하단 이벤트 리스트 패널 */}
      <Animated.View
        style={panelContainerStyle}
        renderToHardwareTextureAndroid={Platform.OS === 'android'}
      >
        {/* 드래그 핸들 */}
        <View
          {...panResponder.panHandlers}
          style={panelStyles.dragHandle}
        >
          <View style={panelStyles.dragBar} />
        </View>

        {/* 일정 헤더*/}
        <View style={panelStyles.panelHeaderRow}>
          <View style={panelStyles.panelHeaderLeft}>
            <Text style={panelStyles.panelTitle}>
              {selectedDate
                ? `${new Date(selectedDate + 'T00:00:00').getDate()}일 일정`
                : "일정"}
            </Text>
            {/* 일정 개수 뱃지 */}
            {panelTab === 'all' && upcomingEvents.length > 0 && (
              <View style={panelStyles.panelBadge}>
                <Text style={panelStyles.panelBadgeText}>
                  {upcomingEvents.length}
                </Text>
              </View>
            )}
            {selectedDate && (
              <TouchableOpacity
                onPress={handleClearSelectedDate}
                style={panelStyles.panelBackLink}
              >
                <Text style={panelStyles.panelBackText}>
                  ← 전체 일정 보기
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* X 버튼 - 패널이 확장되었을 때만 표시 */}
          {isPanelExpanded && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={collapsePanel}
              style={panelStyles.panelCloseBtn}
            >
              <Text style={panelStyles.panelCloseText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 패널 축소 시 열기 힌트 */}
        {!isPanelExpanded && (
          <Text style={panelStyles.hintText}>
            ↑ 탭하여 열기
          </Text>
        )}

        {/* 검색바 + 탭 (패널 확장 시에만 표시) */}
        {isPanelExpanded && (
          <View style={panelStyles.searchTabWrap}>
            {/* 검색바 */}
            <PanelSearchInput
              onDebouncedChange={setDebouncedSearch}
              clearSignal={searchClearSignal}
            />
            {/* 탭: 전체 / 찜 */}
            <View style={panelStyles.tabRow}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleTabAll}
                style={panelTab === 'all' ? panelStyles.tabActive : panelStyles.tabInactive}
              >
                <Text style={panelStyles.tabText}>
                  전체
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleTabBookmarks}
                style={[panelTab === 'bookmarks' ? panelStyles.tabActive : panelStyles.tabInactive, panelStyles.tabBookmarks]}
              >
                <Text style={panelStyles.tabText}>
                  ♥ 찜
                </Text>
                {bookmarks.length > 0 && (
                  <View style={panelStyles.tabBadge}>
                    <Text style={panelStyles.tabBadgeText}>
                      {bookmarks.length}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
            {/* 빠른 필터 칩 */}
            {panelTab === 'all' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={panelStyles.chipScrollView} contentContainerStyle={panelStyles.chipScrollContent}>
                {(selectedDate
                  ? [
                      { key: 'all' as const, label: '전체' },
                      { key: 'age20s' as const, label: '20대' },
                      { key: 'age30s' as const, label: '30대' },
                      { key: 'small' as const, label: '소규모' },
                      { key: 'large' as const, label: '대규모' },
                    ]
                  : [
                      { key: 'all' as const, label: '전체' },
                      { key: 'thisWeek' as const, label: '이번 주' },
                      { key: 'weekend' as const, label: '주말' },
                      { key: 'age20s' as const, label: '20대' },
                      { key: 'age30s' as const, label: '30대' },
                    ]
                ).map(chip => (
                  <TouchableOpacity
                    key={chip.key}
                    activeOpacity={0.7}
                    onPress={() => handleQuickFilter(chip.key)}
                    style={quickFilter === chip.key ? panelStyles.chipActive : panelStyles.chipInactive}
                  >
                    <Text style={quickFilter === chip.key ? panelStyles.chipTextActive : panelStyles.chipTextInactive}>
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        <View style={panelContentWrapStyle} {...panelContentPanResponder.panHandlers}>
          <ScrollView
            ref={panelScrollRef}
            showsVerticalScrollIndicator={false}
            style={rnStyles.flex1}
            nestedScrollEnabled={true}
            bounces={false}
            scrollEventThrottle={16}
            contentContainerStyle={rnStyles.panelScrollContent}
            onScroll={(e) => {
              const scrollY = e.nativeEvent.contentOffset.y;
              panelScrollYRef.current = scrollY;
              isPanelScrollAtTopRef.current = scrollY <= 0;
            }}
          >
          {/* 데이터 로딩 중 표시 */}
          {!isDataReady ? (
            <View style={panelStyles.loadingWrap}>
              <ActivityIndicator size="small" color="#ffffff" />
              <Text style={panelStyles.loadingSubtext}>
                이벤트를 불러오는 중...
              </Text>
            </View>
          ) :
          /* ===== 찜 탭 ===== */
          panelTab === 'bookmarks' ? (
            !bookmarksLoaded ? (
              <View style={panelStyles.loadingWrap}>
                <ActivityIndicator size="small" color="#a78bfa" />
                <Text style={panelStyles.loadingSubtext}>
                  불러오는 중...
                </Text>
              </View>
            ) : bookmarks.length === 0 ? (
              <View style={panelStyles.emptyBmWrap}>
                <Text style={panelStyles.emptyBmIcon}>♡</Text>
                <Text style={panelStyles.emptyBmText}>
                  찜한 파티가 없습니다
                </Text>
                <Text style={panelStyles.emptyBmSub}>
                  파티 상세에서 ♥ 버튼을 눌러보세요
                </Text>
              </View>
            ) : (
              bookmarks.map((bookmark, index) => {
                const { event, date } = bookmark;
                const eventDate = parseLocalDate(date);
                const month = eventDate.getMonth() + 1;
                const day = eventDate.getDate();
                const reminderSet = hasReminder(event.id, date);
                return (
                  <View
                    key={`bm-${event.id}-${date}`}
                    style={panelStyles.bmCard}
                  >
                    <View style={panelStyles.bmRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={panelStyles.bmDateText}>
                          {month}/{day} · {event.time || '시간 미정'}
                        </Text>
                        <Text style={panelStyles.bmTitle}>
                          {event.title}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => toggleBookmark(event, date)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={[panelStyles.bmHeart, { color: reminderSet ? '#ffffff' : 'rgba(255,255,255,0.6)' }]}>♥</Text>
                      </TouchableOpacity>
                    </View>
                    {event.subEvents && event.subEvents.length > 1 ? (
                      <View style={ecStyles.subRow}>
                        {event.subEvents.slice(0, 3).map((sub: any, si: number) => (
                          <View key={si} style={ecStyles.tag}>
                            <Text style={ecStyles.tagText} numberOfLines={1}>
                              {sub.location || sub.venue || `지점${si + 1}`}
                            </Text>
                          </View>
                        ))}
                        {event.subEvents.length > 3 && (
                          <View style={ecStyles.moreTag}>
                            <Text style={ecStyles.moreTagText}>+{event.subEvents.length - 3}</Text>
                          </View>
                        )}
                      </View>
                    ) : event.location ? (
                      <View style={ecStyles.locRow}>
                        <View style={ecStyles.tag}>
                          <Text style={ecStyles.tagText} numberOfLines={1}>
                            {event.location}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                    <View style={panelStyles.bmBtnRow}>
                      <TouchableOpacity
                        onPress={() => navigation.navigate('EventDetail', { event, date })}
                        style={panelStyles.bmBtn}
                      >
                        <Text style={panelStyles.bmBtnText}>
                          자세히 보기
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={async () => {
                          if (!event.id) return;
                          if (reminderSet) {
                            await cancelReminder(event.id, date);
                            Alert.alert('알림 해제', '해당 파티 알림이 해제되었습니다.');
                          } else {
                            const result = await scheduleReminder(event, date);
                            Alert.alert(
                              result.success ? '🔔 알림 등록' : '알림',
                              result.message
                            );
                          }
                        }}
                        style={reminderSet ? panelStyles.bmBtnActive : panelStyles.bmBtnInactive}
                      >
                        <Text style={panelStyles.bmBtnText}>
                          {reminderSet ? '🔔 알림 취소' : '🔔 알림'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )
          ) : (
          /* ===== 전체 일정 탭 ===== */
          upcomingEvents.length === 0 ? (
            <View>
              <Text style={panelStyles.emptyText}>
                예정된 일정이 없습니다
              </Text>
            </View>
          ) : (
            (() => {
              if (!selectedDate) {
                const totalDates = groupedDateElements?.length ?? 0;
                const hasMore = totalDates > visibleDateGroups;
                return (
                  <>
                    {groupedDateElements?.slice(0, visibleDateGroups)}
                    {hasMore && (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={handleLoadMoreDates}
                        style={panelStyles.loadMoreDatesBtn}
                      >
                        <Text style={panelStyles.loadMoreDatesBtnText}>
                          +{totalDates - visibleDateGroups}개 날짜 더보기
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                );
              }
              return selectedDateElements;
            })()
          )
          )}
          </ScrollView>
        </View>

        {/* 하단 SafeArea 여백 (홈버튼 가림 방지) */}
        {isPanelExpanded && <View style={rnStyles.safeAreaSpacer} />}


      </Animated.View>

      {/* 안드로이드 네비게이션 바 배경 - 다크모드 대응 */}
      {Platform.OS === "android" && insets.bottom > 0 && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: -insets.bottom,
            height: insets.bottom,
            backgroundColor: isDark ? "#0f172a" : "#ffffff",
          }}
        />
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

      {/* ==================== 초기 알림 설정 프롬프트 ==================== */}
      <NotificationPrompt 
        isDark={isDark} 
        onClose={handleCloseNotificationPrompt}
      />

      {/* ==================== 앱 시작 광고 팝업 모달 (비활성화 - 나중에 활성화 시 주석 해제) ==================== */}
      {/* {showAdModal && (
        <StartupAdModal 
          isDark={isDark}
          onClose={handleCloseAdModal}
        />
      )} */}

      {/* ==================== 포인트 모달 ==================== */}
      <PointsModal
        visible={showPointsModal}
        onClose={handleClosePointsModal}
        points={points}
        onSpendPoints={spendPoints}
        onWatchAd={watchAdForPoints}
        onAddPoints={addPoints}
        isDark={isDark}
        dailyAdCount={dailyAdCount}
        maxDailyAds={maxAds}
        canWatchAd={canWatchAd}
        history={pointsHistory}
      />
    </View>
  );
}

// ==================== EventCard 스타일 (렌더마다 객체 재생성 방지) ====================
const ecStyles = StyleSheet.create({
  container: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: 16 },
  title: { fontWeight: '700', color: '#ffffff', flex: 1, marginBottom: 6 },
  subRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  locRow: { flexDirection: 'row' },
  tag: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  moreTag: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  moreTagText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  time: { fontSize: 13, fontWeight: '600', color: '#e0e7ff' },
  detailBtn: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, alignSelf: 'flex-start' },
  detailBtnCompact: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  detailBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  detailBtnTextCompact: { fontSize: 12, fontWeight: '600' },
});

// ==================== PanelSearchInput 스타일 ====================
const psiStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.2)', borderRadius: 10, paddingHorizontal: 12, marginBottom: 8 },
  input: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 10 : 8, fontSize: 14, color: '#ffffff' },
  clearBtn: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
});

// ==================== 렌더 경로 공통 스타일 ====================
const rnStyles = StyleSheet.create({
  flex1: { flex: 1 },
  panelBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  panelScrollContent: { paddingBottom: 20 },
  safeAreaSpacer: { height: 20, backgroundColor: 'transparent' },
});

// ==================== 패널 공통 스타일 ====================
const gdStyles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: 24 },
  rowLast: { flexDirection: 'row', marginBottom: 0 },
  bubbleCol: { alignItems: 'center', marginRight: 16, alignSelf: 'stretch' },
  dayText: { fontSize: 16, fontWeight: '800' },
  monthText: { fontSize: 9, fontWeight: '600', marginTop: -2 },
  eventCol: { flex: 1 },
  countWrap: { marginBottom: 8 },
});

const panelStyles = StyleSheet.create({
  bmCard: { backgroundColor: 'rgba(255, 255, 255, 0.15)', borderRadius: 16, padding: 16, marginBottom: 12 },
  bmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  bmDateText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginBottom: 4 },
  bmTitle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  bmHeart: { fontSize: 18 },
  bmBtnRow: { flexDirection: 'row', gap: 8 },
  bmBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(255, 255, 255, 0.2)', borderRadius: 8 },
  bmBtnActive: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(255, 255, 255, 0.3)', borderRadius: 8 },
  bmBtnInactive: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 8 },
  bmBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
  // 날짜 버블
  dateBubble: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  dateLine: { flex: 1, width: 2, marginTop: 6, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1 },
  dateCountLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  moreBtn: { paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
  moreBtnText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  foldBtn: { paddingVertical: 8, alignItems: 'center', marginTop: 4 },
  foldBtnText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  loadMoreDatesBtn: { paddingVertical: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', marginTop: 16, marginBottom: 8 },
  loadMoreDatesBtnText: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  emptyText: { color: '#e0e7ff', fontSize: 14, fontStyle: 'italic', marginBottom: 16 },
  loadingWrap: { alignItems: 'center', paddingVertical: 30 },
  loadingSubtext: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 8 },
  emptyBmWrap: { alignItems: 'center', paddingVertical: 30 },
  emptyBmIcon: { color: '#e0e7ff', fontSize: 32, marginBottom: 12 },
  emptyBmText: { color: '#e0e7ff', fontSize: 14 },
  emptyBmSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 },
  // 탭
  tabActive: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.3)' },
  tabInactive: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)' },
  tabBookmarks: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tabText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  tabBadge: { backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabBadgeText: { fontSize: 10, fontWeight: '800', color: '#ffffff' },
  chipActive: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(167,139,250,0.5)' },
  chipInactive: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  chipTextActive: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  chipTextInactive: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.6)' },
  chipScrollView: { marginTop: 8 },
  chipScrollContent: { gap: 6 },
  // 패널 헤더
  panelHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  panelHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelTitle: { fontSize: 18, fontWeight: '800', color: '#ffffff', letterSpacing: 1 },
  panelBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  panelBadgeText: { fontSize: 12, fontWeight: '800', color: '#ffffff' },
  panelBackLink: { marginTop: 4 },
  panelBackText: { fontSize: 11, color: 'rgba(255, 255, 255, 0.7)' },
  panelCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.2)', justifyContent: 'center', alignItems: 'center' },
  panelCloseText: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  hintText: { fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginTop: 2 },
  dragHandle: { alignItems: 'center', paddingVertical: 6, marginBottom: 8 },
  dragBar: { width: 40, height: 5, backgroundColor: 'rgba(255, 255, 255, 0.5)', borderRadius: 3 },
  searchTabWrap: { marginBottom: 10 },
  tabRow: { flexDirection: 'row', gap: 6 },
  selectedDateCountLabel: { marginBottom: 8 },
  selectedDateCountText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
});

// ==================== 스타일시트 (성능 최적화) ====================
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "500",
  },
  adBannerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  // 자주 사용되는 컨테이너 스타일
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 8,
  },
  // 패널 관련 스타일
  panelHandle: {
    alignItems: "center",
    paddingVertical: 6,
    marginBottom: 8,
  },
  panelHandleBar: {
    width: 40,
    height: 5,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
    borderRadius: 3,
  },
  // 이벤트 카드 스타일
  eventCard: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    flex: 1,
  },
  eventTime: {
    fontSize: 13,
    fontWeight: "600",
    color: "#e0e7ff",
  },
  eventLocation: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.7)",
    marginLeft: 8,
  },
  linkButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderRadius: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  linkButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  noLinkBadge: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  noLinkText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    fontWeight: "600",
  },
});
