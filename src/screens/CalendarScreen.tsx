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
  AppState,
  StyleSheet,
  InteractionManager,
  ActivityIndicator,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadEvents, hasMemCache, onSWRUpdate } from "../utils/storage";
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
import { useToast } from "../contexts/ToastContext";
import { hapticLight, hapticSuccess } from "../utils/haptics";

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
const POLL_INTERVAL = 300000; // 5분 기본 폴링
const POLL_INTERVAL_BACKGROUND = 900000; // 15분 백그라운드 폴링 (배터리 절약)
const INITIAL_MONTHS_RANGE = 2; // 초기 로드 월 범위 (앞뒤 2개월 → 첫 렌더 속도 개선)

// 연령 필터 정규식 (루프 밖에서 한 번만 컴파일)
const AGE_RANGE_REGEX = /\d+/g;



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
  // compact/marginBottom 조합이 2×N가지 → useMemo로 배열 객체 재생성 방지
  const containerStyle = React.useMemo(
    () => [ecStyles.container, marginBottom !== 12 ? { marginBottom } : ecStyles.containerDefaultMargin],
    [marginBottom]
  );
  const innerStyle = compact ? ecStyles.innerCompactCombined : ecStyles.inner;
  const titleStyle = compact ? ecStyles.titleCompact : ecStyles.title;
  const subRowStyle = compact ? ecStyles.subRowCompact : ecStyles.subRow;
  const locRowStyle = compact ? ecStyles.locRowCompact : ecStyles.locRow;
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={handlePress} style={containerStyle}
      accessibilityLabel={`${sanitizeText(event.title, 100)}, ${event.time || '시간 미정'}`}
      accessibilityRole="button"
      accessibilityHint="이벤트 상세 보기"
    >
      <View style={innerStyle}>
        <View style={ecStyles.headerRow}>
          <View style={ecStyles.timeBadge}>
            <Text style={ecStyles.timeBadgeText}>{event.time || '시간 미정'}</Text>
          </View>
          <View style={ecStyles.arrowCircle}>
            <Text style={ecStyles.arrowText}>→</Text>
          </View>
        </View>
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
      </View>
    </TouchableOpacity>
  );
});

// ==================== 검색바 (분리된 컴포넌트 — 타이핑 시 부모 리렌더 방지) ====================
interface PanelSearchInputProps {
  onDebouncedChange: (text: string) => void;
  clearSignal: number;
  isDark: boolean;
}
const PanelSearchInput = React.memo(({ onDebouncedChange, clearSignal, isDark }: PanelSearchInputProps) => {
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
    }, 350);
  }, []);

  const handleClear = React.useCallback(() => {
    setValue('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onChangeRef.current('');
  }, []);

  return (
    <View style={[psiStyles.container, {
      backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    }]}>
      <TextInput
        style={[psiStyles.input, { color: isDark ? '#eaeaf2' : '#0f172a' }]}
        placeholder="제목, 장소, 태그 검색..."
        placeholderTextColor={isDark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.35)'}
        value={value}
        onChangeText={handleChange}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={handleClear} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[psiStyles.clearBtn, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)' }]}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

// ==================== 힌트 쉬머 애니메이션 ====================
const HINT_TEXT = '↑ 전체 일정 보기';
const HINT_CHARS = HINT_TEXT.split('');
const CHAR_COUNT = HINT_CHARS.length;
const CYCLE_DELAY = 30000;        // 30초 대기

const HintShimmer = React.memo(() => {
  const progress = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const runCycle = () => {
      if (stopped) return;
      progress.setValue(-1);
      Animated.timing(progress, {
        toValue: CHAR_COUNT,
        duration: CHAR_COUNT * 100,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !stopped) {
          timer = setTimeout(runCycle, CYCLE_DELAY);
        }
      });
    };

    timer = setTimeout(runCycle, 2000);
    return () => { stopped = true; clearTimeout(timer); };
  }, []);

  return (
    <View style={panelStyles.hintRow}>
      {HINT_CHARS.map((ch, i) => (
        <Animated.Text
          key={i}
          style={[
            panelStyles.hintChar,
            {
              opacity: progress.interpolate({
                inputRange: [i - 1.5, i, i + 1.5],
                outputRange: [0.4, 1, 0.4],
                extrapolate: 'clamp',
              }),
            },
          ]}
        >
          {ch}
        </Animated.Text>
      ))}
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
  // 지역 목록은 events에서 자동 파생 (별도 state 불필요)
  const availableRegions = useMemo(() => {
    const regionCount = new Map<string, number>();
    for (const eventList of Object.values(events)) {
      for (const event of eventList) {
        if (event?.region) {
          regionCount.set(event.region, (regionCount.get(event.region) || 0) + 1);
        }
      }
    }
    return Array.from(regionCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([region]) => region);
  }, [events]);
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
  const { bookmarks, toggleBookmark, isLoaded: bookmarksLoaded } = useBookmarks();
  const { hasReminder, scheduleReminder, cancelReminder } = useReminders();
  const { showToast } = useToast();

  // 북마크 날짜 포맷 사전 캐싱 (bookmarks 변경 시에만 재계산)
  const bookmarkDateLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const { date } of bookmarks) {
      if (map.has(date)) continue;
      const parts = date.split('-');
      if (parts.length === 3) {
        map.set(date, `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`);
      }
    }
    return map;
  }, [bookmarks]);

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
      if (finished && panelAnimRef.current === anim) panelAnimRef.current = null;
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
      onStartShouldSetPanResponder: () => true, // 핸들 영역은 항상 터치 캐치 (축소/확장 모두)
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // 수직 제스처만 인식 (dy가 dx보다 클 때, 최소 5px 이동)
        return Math.abs(gestureState.dy) > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderTerminationRequest: () => false, // 안드로이드에서 ScrollView에 제스처 빼앗기지 않도록
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
          setSelectedDate(null);
          setQuickFilter('all');
          animatePanel(100);
        } else {
          const ct = panelTranslateYValueRef.current;
          if (ct < midTranslate) {
            setIsPanelExpanded(true);
            animatePanel(maxH);
          } else {
            setIsPanelExpanded(false);
            setSelectedDate(null);
            setQuickFilter('all');
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
        // 안드로이드: 더 낮은 임계값 (터치 감도 차이 보정)
        const dyThreshold = Platform.OS === 'android' ? 20 : 40;
        const vyThreshold = Platform.OS === 'android' ? 0.15 : 0.3;
        const verticalBias = Platform.OS === 'android' ? 1.5 : 2.5;
        const isDraggingDown = gestureState.dy > dyThreshold && gestureState.vy > vyThreshold;
        const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * verticalBias;
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
          setSelectedDate(null);
          setQuickFilter('all');
          animatePanel(100);
        } else {
          const ct = panelTranslateYValueRef.current;
          if (ct < midTranslate) {
            setIsPanelExpanded(true);
            animatePanel(maxH);
          } else {
            setIsPanelExpanded(false);
            setSelectedDate(null);
            setQuickFilter('all');
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
    setSelectedDate(null);
    setQuickFilter('all');
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

  // ==================== 1단계: events 변경 시에만 정렬 (O(n log n) — 비용 큰 부분) ====================
  const sortedBaseEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    const result: Array<{ date: string; event: any; _ts: number; _dow: number }> = [];
    for (const [date, eventList] of Object.entries(events)) {
      const p = date.split('-');
      if (p.length !== 3) continue;
      const d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
      const ts = d.getTime();
      if (ts < todayTime) continue;
      const dow = d.getDay();
      for (const event of eventList) {
        result.push({ date, event, _ts: ts, _dow: dow });
      }
    }
    result.sort((a, b) => {
      const diff = a._ts - b._ts;
      return diff !== 0 ? diff : (a.event.time || 'ZZ:ZZ').localeCompare(b.event.time || 'ZZ:ZZ');
    });
    return result;
  }, [events]);

  // ==================== 2단계: 필터/검색 변경 시 가벼운 filter만 (정렬 재실행 없음) ====================
  const upcomingEvents = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();

    // 선택된 날짜: 단순 순회
    if (selectedDate) {
      if (!events[selectedDate]) return [];
      const result: Array<{ date: string; event: any }> = [];
      for (const event of events[selectedDate]) {
        if (selectedRegion && event.region !== selectedRegion) continue;
        if (selectedLocation && event.location !== selectedLocation) continue;
        
        // 검색어가 있을 때만 텍스트 검색
        if (q) {
          const matchesSearch = 
            event.title?.toLowerCase().includes(q) ||
            event.location?.toLowerCase().includes(q) ||
            event.region?.toLowerCase().includes(q) ||
            event.description?.toLowerCase().includes(q) ||
            event.venue?.toLowerCase().includes(q) ||
            (event.tags && event.tags.some((t: string) => t.toLowerCase().includes(q)));
          if (!matchesSearch) continue;
        }
        
        result.push({ date: selectedDate, event });
      }
      result.sort((a, b) => (a.event.time || 'ZZ:ZZ').localeCompare(b.event.time || 'ZZ:ZZ'));
      return result;
    }

    // thisWeek 범위
    let weekEndTime = 0;
    if (quickFilter === 'thisWeek') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(today);
      endOfWeek.setDate(endOfWeek.getDate() + (7 - today.getDay()));
      endOfWeek.setHours(23, 59, 59, 999);
      weekEndTime = endOfWeek.getTime();
    }

    // 사전 정렬된 리스트에서 filter만 수행 (O(n) — sort 없음)
    const result: Array<{ date: string; event: any }> = [];
    for (const item of sortedBaseEvents) {
      const event = item.event;

      // 지역/위치 필터
      if (selectedRegion && event.region !== selectedRegion) continue;
      if (selectedLocation && event.location !== selectedLocation) continue;

      // 퀵필터
      if (quickFilter !== 'all') {
        if (quickFilter === 'weekend') {
          if (item._dow !== 0 && item._dow !== 5 && item._dow !== 6) continue;
        } else if (quickFilter === 'thisWeek') {
          if (item._ts > weekEndTime) continue;
        } else if (quickFilter === 'age20s') {
          if (!event.ageRange) continue;
          AGE_RANGE_REGEX.lastIndex = 0;
          const nums = event.ageRange.match(AGE_RANGE_REGEX);
          if (!nums) continue;
          const min = parseInt(nums[0], 10);
          const max = nums[1] ? parseInt(nums[1], 10) : min;
          if (!(min >= 20 && max < 40)) continue;
        } else if (quickFilter === 'age30s') {
          if (!event.ageRange) continue;
          AGE_RANGE_REGEX.lastIndex = 0;
          const nums = event.ageRange.match(AGE_RANGE_REGEX);
          if (!nums) continue;
          const max = nums[1] ? parseInt(nums[1], 10) : parseInt(nums[0], 10);
          if (max < 30) continue;
        } else if (quickFilter === 'small') {
          const total = (event.maleCapacity || 0) + (event.femaleCapacity || 0);
          if (!(total > 0 && total <= 20)) continue;
        } else if (quickFilter === 'large') {
          const total = (event.maleCapacity || 0) + (event.femaleCapacity || 0);
          if (total <= 20) continue;
        }
      }

      // 검색 (검색어가 있을 때만 텍스트 검색 수행 — 조기 탈출로 연산 50% 감소)
      if (q) {
        const matchesSearch = 
          event.title?.toLowerCase().includes(q) ||
          event.location?.toLowerCase().includes(q) ||
          event.region?.toLowerCase().includes(q) ||
          event.description?.toLowerCase().includes(q) ||
          event.venue?.toLowerCase().includes(q) ||
          (event.tags && event.tags.some((t: string) => t.toLowerCase().includes(q)));
        if (!matchesSearch) continue;
      }

      result.push({ date: item.date, event });
    }

    return result;
  }, [sortedBaseEvents, events, selectedDate, selectedRegion, selectedLocation, debouncedSearch, quickFilter]);

  // ==================== 추천 파티 (프로모션 광고 + 일반) ====================
  // 날짜별 그룹화 + 하루마다 순서 로테이션 (상단 노출 이벤트가 매일 바뀜)
  const groupedUpcoming = useMemo(() => {
    if (selectedDate) return null; // 날짜 선택 시 불필요
    const grouped: { [key: string]: Array<{ date: string; event: any }> } = {};
    for (const item of upcomingEvents) {
      if (!grouped[item.date]) grouped[item.date] = [];
      grouped[item.date].push(item);
    }
    // 오늘 날짜 기반 로테이션 오프셋 (하루마다 변경)
    const now = new Date();
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
    for (const date of Object.keys(grouped)) {
      const arr = grouped[date];
      if (arr.length <= 3) continue; // 3개 이하면 로테이션 불필요
      const offset = dayOfYear % arr.length;
      if (offset > 0) {
        grouped[date] = arr.slice(offset).concat(arr.slice(0, offset));
      }
    }
    return grouped;
  }, [upcomingEvents, selectedDate]);

  // ==================== 패널 \uc774\ubca4\ud2b8 \ub9ac\uc2a4\ud2b8 \uc0ac\uc804\uc5f0\uc0b0 (memoized) ====================
  // groupedDateElements: \ub0a0\uc9dc\ubcc4 \uadf8\ub8f9 \ub80c\ub354\ub9c1 \ucee8\ud150\uce20.
  // groupedUpcoming / expandedDates / isDark \uac00 \ubc14\ub00c\uc9c0 \uc54a\uc73c\uba74 \uc7ac\uc0dd\uc131 \uc548 \ud568
  // (\ud328\ub110 \uc5f4\uae30/\ub2eb\uae30, \uc6d4 \uc2a4\ud06c\ub864 \ub4f1\uc5d0\uc11c \uc7ac\uc0dd\uc131 \ubc1c\uc0dd \uc548 \ud568)
  // 날짜 버블 색상 메모이제이션 (렌더마다 인라인 객체 재생성 방지)
  const bubbleColors = useMemo(() => ({
    bg: { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.35)' },
    text: { color: '#ffffff' },
  }), [isDark]);

  // 날짜 파싱 사전 캐시: groupedUpcoming 변경 시에만 한 번 파싱 (parseLocalDate 반복 호출 제거)
  const parsedDateMap = useMemo(() => {
    if (!groupedUpcoming) return null;
    const map = new Map<string, { day: number; monthName: string }>();
    for (const date of Object.keys(groupedUpcoming)) {
      const d = parseLocalDate(date);
      map.set(date, { day: d.getDate(), monthName: MONTH_NAMES[d.getMonth()] });
    }
    return map;
  }, [groupedUpcoming]);

  const groupedDateElements = useMemo(() => {
    if (!groupedUpcoming || !parsedDateMap) return null;
    const dates = Object.keys(groupedUpcoming);
    return dates.map((date, dateIndex) => {
      const eventsForDate = groupedUpcoming[date];
      const parsed = parsedDateMap.get(date)!;
      const day = parsed.day;
      const monthName = parsed.monthName;
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
            <View style={[panelStyles.dateBubble, bubbleColors.bg]}>
              <Text style={[gdStyles.dayText, bubbleColors.text]}>{day}</Text>
              <Text style={[gdStyles.monthText, bubbleColors.text]}>{monthName}</Text>
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
  }, [groupedUpcoming, parsedDateMap, expandedDates, isDark, handleNavigateToEventDetail, handleToggleDateExpand, bubbleColors]);

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

  // 패널 전체일정 콘텐츠 사전 계산 (IIFE + slice 제거)
  const panelAllEventsContent = useMemo(() => {
    if (upcomingEvents.length === 0) return null;
    if (!selectedDate && groupedDateElements) {
      const totalDates = groupedDateElements.length;
      const hasMore = totalDates > visibleDateGroups;
      return (
        <>
          {groupedDateElements.slice(0, visibleDateGroups)}
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
  }, [upcomingEvents.length, selectedDate, groupedDateElements, visibleDateGroups, selectedDateElements, handleLoadMoreDates]);

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
      const todayTime = today.getTime();

      // old 데이터 전체를 한 번에 Set으로 구성 (id만 사용 — title 포함 시 거짓 양성)
      const oldEventSet = new Set<string>();
      for (const [date, eventList] of Object.entries(oldEvents)) {
        for (const event of eventList) {
          oldEventSet.add(`${date}:${event.id}`);
        }
      }

      for (const [date, eventList] of Object.entries(newEvents)) {
        const p = date.split('-');
        if (p.length !== 3) continue;
        const ts = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)).getTime();
        if (ts < todayTime) continue;

        for (const event of eventList) {
          const eventKey = `${date}:${event.id}`;
          if (notifiedEventsRef.current.has(eventKey)) continue;

          if (!oldEventSet.has(eventKey)) {
            try {
              const parsedNotifDate = parseLocalDate(date);
              const formattedDate = parsedNotifDate.toLocaleDateString("ko-KR", {
                month: "long",
                day: "numeric",
              });
              sendNewEventNotification(event.title, formattedDate);
              notifiedEventsRef.current.add(eventKey);

              if (notifiedEventsRef.current.size > 2000) {
                const entries = Array.from(notifiedEventsRef.current);
                notifiedEventsRef.current = new Set(entries.slice(-1000));
              }
            } catch (notifError) {
              // Expo Go에서는 알림이 작동하지 않을 수 있음
            }
          }
        }
      }
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
      }
    } catch (error) {
      secureLog.warn("데이터 로드 실패");
      if (isMountedRef.current) {
        setEvents({});
      }
    }
  }, []);

  // ==================== 데이터 로드 및 폴링 ====================
  // 패널 상태를 ref로 추적 (useFocusEffect 의존성 최소화)
  const isPanelExpandedRef = useRef(isPanelExpanded);
  const selectedDateRef = useRef(selectedDate);
  isPanelExpandedRef.current = isPanelExpanded;
  selectedDateRef.current = selectedDate;
  
  // SWR 백그라운드 업데이트 구독: 캐시 반환 후 네트워크에서 새 데이터 도착 시 자동 갱신
  useEffect(() => {
    const unsubscribe = onSWRUpdate((freshData) => {
      if (!isMountedRef.current || !isFocusedRef.current) return;
      if (freshData === previousEventsRef.current) return;
      checkForNewEvents(previousEventsRef.current, freshData);
      setEvents(freshData);
      previousEventsRef.current = freshData;
      lastEventsRef.current = freshData;
    });
    return unsubscribe;
  }, [checkForNewEvents]);

  useFocusEffect(
    useCallback(() => {
      // 포커스 상태 추적 (마운트 상태와 분리)
      isFocusedRef.current = true;

      // 초기 데이터 로드 — InteractionManager로 네비게이션 애니메이션 차단 방지
      const interactionHandle = InteractionManager.runAfterInteractions(() => {
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
      });

      // 폴링 설정 (AppState-aware: 백그라운드에서는 간격 늘림)
      const appStateRef = { current: AppState.currentState };
      
      const startPolling = () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        const interval = appStateRef.current === 'active' ? POLL_INTERVAL : POLL_INTERVAL_BACKGROUND;
        pollIntervalRef.current = setInterval(async () => {
          if (!isFocusedRef.current || !isMountedRef.current) return;

          try {
            const latestEvents = await loadEvents(true);

            if (
              latestEvents &&
              typeof latestEvents === "object" &&
              isMountedRef.current
            ) {
              if (latestEvents === previousEventsRef.current) return;
              checkForNewEvents(previousEventsRef.current, latestEvents);
              setEvents(latestEvents);
              previousEventsRef.current = latestEvents;
            }
          } catch (error) {
            // 실패 시 조용히 무시
          }
        }, interval);
      };
      startPolling();

      // AppState 변경 시 폴링 간격 조정 + 포그라운드 복귀 시 즉시 새로고침
      const appStateSub = AppState.addEventListener('change', (nextState) => {
        const wasBackground = appStateRef.current !== 'active';
        appStateRef.current = nextState;
        if (nextState === 'active' && wasBackground && isFocusedRef.current && isMountedRef.current) {
          // 포그라운드 복귀: 즉시 데이터 갱신 + 폴링 간격 복원
          loadEventsData().then(() => { if (isMountedRef.current) setIsDataReady(true); }).catch(() => {});
          startPolling();
        } else if (nextState !== 'active') {
          // 백그라운드 진입: 긴 간격으로 전환
          startPolling();
        }
      });

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
        interactionHandle.cancel();
        appStateSub.remove();
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
        backgroundColor: isDark ? "#141422" : "#ffffff",
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
              color: isDark ? "#eaeaf2" : "#0f172a",
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
              backgroundColor: isDark ? "#1e1e32" : "#f1f5f9",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: isDark ? "#c0c0d0" : "#2a2a44",
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
                  backgroundColor: isDark ? "#eaeaf2" : "#0f172a",
                  borderRadius: 2,
                }}
              />
              <View
                style={{
                  width: 22,
                  height: 2,
                  backgroundColor: isDark ? "#eaeaf2" : "#0f172a",
                  borderRadius: 2,
                }}
              />
              <View
                style={{
                  width: 22,
                  height: 2,
                  backgroundColor: isDark ? "#eaeaf2" : "#0f172a",
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
        backgroundColor: isDark ? "#141422" : "#ffffff",
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
                  : "#2a2a44",
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
        backgroundColor: isDark ? "#141422" : "#ffffff",
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
                : isDark ? "#1e1e32" : "#f1f5f9",
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
                  : isDark ? "#8888a0" : "#64748b",
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
            backgroundColor: isDark ? "#1e1e32" : "#f1f5f9",
            marginRight: 8,
            minWidth: 60,
            alignItems: "center",
            borderWidth: 1,
            borderColor: isDark ? "#2a2a44" : "#e2e8f0",
            borderStyle: "dashed",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: isDark ? "#8888a0" : "#64748b" }}>
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
                  : isDark ? "#1e1e32" : "#f1f5f9",
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
                    : isDark ? "#8888a0" : "#64748b",
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
    backgroundColor: isDark ? "#0c0c16" : "#ffffff",
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
            backgroundColor: isDark ? "#0c0c16" : "#ffffff",
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
            { color: isDark ? "#8888a0" : "#64748b" },
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
        {!isPanelExpanded && <HintShimmer />}

        {/* 검색바 + 탭 (패널 확장 시에만 표시) */}
        {isPanelExpanded && (
          <View style={panelStyles.searchTabWrap}>
            {/* 검색바 */}
            <PanelSearchInput
              onDebouncedChange={setDebouncedSearch}
              clearSignal={searchClearSignal}
              isDark={isDark}
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
              bookmarks.map((bookmark) => {
                const { event, date } = bookmark;
                const dateLabel = bookmarkDateLabels.get(date) ?? date;
                const reminderSet = hasReminder(event.id, date);
                return (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    key={`bm-${event.id}-${date}`}
                    style={panelStyles.bmCard}
                    onPress={() => navigation.navigate('EventDetail', { event, date })}
                  >
                    <View style={panelStyles.bmRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={panelStyles.bmDateText}>
                          {dateLabel} · {event.time || '시간 미정'}
                        </Text>
                        <Text style={panelStyles.bmTitle}>
                          {event.title}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          toggleBookmark(event, date);
                          hapticLight();
                          showToast({ message: bookmarks.some((b: any) => b.eventId === event.id && b.date === date) ? '찜 목록에서 제거했어요' : '찜 목록에 추가했어요', type: 'success', icon: '❤️' });
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel="찜하기"
                        accessibilityRole="button"
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
                      <View style={panelStyles.bmBtn}>
                        <Text style={panelStyles.bmBtnText}>
                          자세히 보기
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={async () => {
                          if (!event.id) return;
                          if (reminderSet) {
                            await cancelReminder(event.id, date);
                            hapticLight();
                            showToast({ message: '알림이 해제되었어요', type: 'info', icon: '🔕' });
                          } else {
                            const result = await scheduleReminder(event, date);
                            if (result.success) {
                              hapticSuccess();
                              showToast({ message: '알림이 설정되었어요', type: 'success', icon: '🔔' });
                            } else {
                              showToast({ message: result.message, type: 'error' });
                            }
                          }
                        }}
                        style={reminderSet ? panelStyles.bmBtnActive : panelStyles.bmBtnInactive}
                      >
                        <Text style={panelStyles.bmBtnText}>
                          {reminderSet ? '🔔 알림 취소' : '🔔 알림'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
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
          ) : panelAllEventsContent
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
            backgroundColor: isDark ? "#0c0c16" : "#ffffff",
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

// ==================== EventCard 스타일 (모던 글래스 카드) ====================
const ecStyles = StyleSheet.create({
  container: { borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  containerDefaultMargin: { marginBottom: 12 },
  inner: { padding: 16, backgroundColor: 'rgba(255,255,255,0.10)' },
  innerCompact: { padding: 14 },
  // compact 조합 캐시 (렌더마다 배열 생성 방지)
  innerCompactCombined: { padding: 14, backgroundColor: 'rgba(255,255,255,0.10)' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  timeBadge: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  timeBadgeText: { fontSize: 12, fontWeight: '700', color: '#ffffff', letterSpacing: 0.3 },
  arrowCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  arrowText: { fontSize: 14, color: '#ffffff', fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '700', color: '#ffffff', flex: 1, marginBottom: 8, lineHeight: 22 },
  titleCompact: { fontSize: 15, fontWeight: '700', color: '#ffffff', flex: 1, marginBottom: 8, lineHeight: 22 },
  subRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  subRowCompact: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  locRow: { flexDirection: 'row', marginBottom: 8 },
  locRowCompact: { flexDirection: 'row', marginBottom: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  tagIcon: { fontSize: 10 },
  tagText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  moreTag: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  moreTagText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  detailBtn: { marginTop: 12, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  detailBtnCompact: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10 },
  detailBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  detailBtnTextCompact: { fontSize: 12, fontWeight: '600' },
});

// ==================== PanelSearchInput 스타일 ====================
const psiStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.12)', borderRadius: 14, paddingHorizontal: 14, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
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
  bmCard: { backgroundColor: 'rgba(255, 255, 255, 0.10)', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  bmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  bmDateText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginBottom: 4 },
  bmTitle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  bmHeart: { fontSize: 18 },
  bmBtnRow: { flexDirection: 'row', gap: 8 },
  bmBtn: { paddingVertical: 7, paddingHorizontal: 14, backgroundColor: 'rgba(255, 255, 255, 0.12)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  bmBtnActive: { paddingVertical: 7, paddingHorizontal: 14, backgroundColor: 'rgba(255, 255, 255, 0.22)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  bmBtnInactive: { paddingVertical: 7, paddingHorizontal: 14, backgroundColor: 'rgba(255, 255, 255, 0.06)', borderRadius: 10 },
  bmBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
  // 날짜 버블
  dateBubble: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' },
  dateLine: { flex: 1, width: 2, marginTop: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 1 },
  dateCountLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  moreBtn: { paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  moreBtnText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  foldBtn: { paddingVertical: 8, alignItems: 'center', marginTop: 4 },
  foldBtnText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  loadMoreDatesBtn: { paddingVertical: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', marginTop: 16, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  loadMoreDatesBtnText: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.8)', letterSpacing: 0.2 },
  emptyText: { color: '#d0d0e8', fontSize: 14, fontStyle: 'italic', marginBottom: 16 },
  loadingWrap: { alignItems: 'center', paddingVertical: 30 },
  loadingSubtext: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 8 },
  emptyBmWrap: { alignItems: 'center', paddingVertical: 30 },
  emptyBmIcon: { color: '#d0d0e8', fontSize: 32, marginBottom: 12 },
  emptyBmText: { color: '#d0d0e8', fontSize: 14 },
  emptyBmSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 },
  // 탭
  tabActive: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  tabInactive: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)' },
  tabBookmarks: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tabText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  tabBadge: { backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabBadgeText: { fontSize: 10, fontWeight: '800', color: '#ffffff' },
  chipActive: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  chipInactive: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  chipTextActive: { fontSize: 12, fontWeight: '700', color: '#ffffff', letterSpacing: 0.2 },
  chipTextInactive: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.55)' },
  chipScrollView: { marginTop: 8 },
  chipScrollContent: { gap: 6 },
  // 패널 헤더
  panelHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  panelHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelTitle: { fontSize: 18, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },
  panelBadge: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  panelBadgeText: { fontSize: 12, fontWeight: '800', color: '#ffffff' },
  panelBackLink: { marginTop: 2, paddingVertical: 6, paddingHorizontal: 8, marginLeft: -8, borderRadius: 8 },
  panelBackText: { fontSize: 13, fontWeight: '600', color: 'rgba(255, 255, 255, 0.8)' },
  panelCloseBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255, 255, 255, 0.12)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  panelCloseText: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  hintRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 2 },
  hintChar: { fontSize: 12, color: '#ffffff', fontWeight: '500' },
  dragHandle: { alignItems: 'center', paddingVertical: 12, marginBottom: 4 },
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
    backgroundColor: "rgba(255, 255, 255, 0.10)",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
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
    color: "#d0d0e8",
  },
  eventLocation: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.7)",
    marginLeft: 8,
  },
  linkButton: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 12,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
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
