import React, { useState, useEffect, useRef } from "react";
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { View, Text, Linking, Appearance, InteractionManager } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RootStackParamList, Event } from "./src/types";

// Screens — CalendarScreen만 즉시 로드 (메인 화면), 나머지는 네비게이션 시점에 지연 로드
import CalendarScreen from "./src/screens/CalendarScreen";
import SplashScreen from "./src/screens/SplashScreen";

// 지연 로드 스크린 (초기 JS 평가 시간 150-300ms 절약)
let _AddEventScreen: any = null;
let _SettingsScreen: any = null;
let _LocationPickerScreen: any = null;
let _LegalScreen: any = null;
let _CouponScreen: any = null;
let _EventDetailScreen: any = null;

const getAddEventScreen = () => _AddEventScreen || (_AddEventScreen = require("./src/screens/AddEventScreen").default);
const getSettingsScreen = () => _SettingsScreen || (_SettingsScreen = require("./src/screens/SettingsScreen").default);
const getLocationPickerScreen = () => _LocationPickerScreen || (_LocationPickerScreen = require("./src/screens/LocationPickerScreen").default);
const getLegalScreen = () => _LegalScreen || (_LegalScreen = require("./src/screens/LegalScreen").default);
const getCouponScreen = () => _CouponScreen || (_CouponScreen = require("./src/screens/CouponScreen").default);
const getEventDetailScreen = () => _EventDetailScreen || (_EventDetailScreen = require("./src/screens/EventDetailScreen").default);

// Components
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { ScreenErrorBoundary } from "./src/components/ScreenErrorBoundary";

// Contexts
import { ThemeProvider, useTheme } from "./src/contexts/ThemeContext";
import { RegionProvider } from "./src/contexts/RegionContext";
import { ToastProvider } from "./src/contexts/ToastContext";

// Utils
import { initAsyncStorage } from "./src/utils/asyncStorageManager";
import { AdManager } from "./src/services/AdService";
import { secureLog } from "./src/utils/secureStorage";

const Stack = createNativeStackNavigator<RootStackParamList>();

// 에러 화면
function ErrorScreen({ message }: { message: string }) {
  const isDark = Appearance.getColorScheme() === 'dark';
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: isDark ? '#0c0c16' : '#fce7f3' }}>
      <Text style={{ fontSize: 40, marginBottom: 20 }}>😢</Text>
      <Text style={{ fontSize: 18, fontWeight: 'bold', color: isDark ? '#eaeaf2' : '#0f172a', marginBottom: 10 }}>앱 오류</Text>
      <Text style={{ fontSize: 14, color: isDark ? '#8888a0' : '#666', textAlign: 'center' }}>{message}</Text>
    </View>
  );
}

// Screen wrappers with per-screen error boundaries
const SafeCalendarScreen = (props: any) => (
  <ScreenErrorBoundary screenName="캘린더"><CalendarScreen {...props} /></ScreenErrorBoundary>
);
const SafeAddEventScreen = (props: any) => {
  const Screen = getAddEventScreen();
  return <ScreenErrorBoundary screenName="이벤트 추가"><Screen {...props} /></ScreenErrorBoundary>;
};
const SafeSettingsScreen = (props: any) => {
  const Screen = getSettingsScreen();
  return <ScreenErrorBoundary screenName="설정"><Screen {...props} /></ScreenErrorBoundary>;
};
const SafeLocationPickerScreen = (props: any) => {
  const Screen = getLocationPickerScreen();
  return <ScreenErrorBoundary screenName="위치 선택"><Screen {...props} /></ScreenErrorBoundary>;
};
const SafeLegalScreen = (props: any) => {
  const Screen = getLegalScreen();
  return <ScreenErrorBoundary screenName="법적 고지"><Screen {...props} /></ScreenErrorBoundary>;
};
const SafeCouponScreen = (props: any) => {
  const Screen = getCouponScreen();
  return <ScreenErrorBoundary screenName="쿠폰"><Screen {...props} /></ScreenErrorBoundary>;
};
const SafeEventDetailScreen = (props: any) => {
  const Screen = getEventDetailScreen();
  return <ScreenErrorBoundary screenName="이벤트 상세"><Screen {...props} /></ScreenErrorBoundary>;
};

// AppNavigator 최적화 - 불필요한 리렌더링 방지
const AppNavigator = React.memo(() => {
  const { theme } = useTheme();
  
  // Stack.Navigator 설정을 useMemo로 최적화
  const screenOptions = React.useMemo(() => ({ headerShown: false }), []);
  const modalOptions = React.useMemo(() => ({ presentation: "modal" as const }), []);
  const cardOptions = React.useMemo(() => ({ presentation: "card" as const }), []);

  return (
    <>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="MainTabs" component={SafeCalendarScreen} />
        <Stack.Screen name="AddEvent" component={SafeAddEventScreen} options={modalOptions} />
        <Stack.Screen name="Settings" component={SafeSettingsScreen} options={modalOptions} />
        <Stack.Screen name="LocationPicker" component={SafeLocationPickerScreen} options={modalOptions} />
        <Stack.Screen name="Legal" component={SafeLegalScreen} options={modalOptions} />
        <Stack.Screen name="Coupon" component={SafeCouponScreen} options={modalOptions} />
        <Stack.Screen name="EventDetail" component={SafeEventDetailScreen} options={cardOptions} />
      </Stack.Navigator>
    </>
  );
});

function AppContent() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const [pendingDeepLink, setPendingDeepLink] = useState<{ eventId: string; date: string } | null>(null);

  // 딥링크 처리 함수 (useCallback으로 최적화)
  const handleDeepLink = React.useCallback((url: string | null) => {
    if (!url) return;
    
    try {
      // soloparty://event/이벤트ID?date=2026-01-24 형식 파싱
      const match = url.match(/soloparty:\/\/event\/([^?]+)\?date=([^&]+)/);
      if (match) {
        const [, eventId, date] = match;
        // 날짜 유효성 검증
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          // eventId 살균화 (영숫자, 하이픈, 언더스코어만 허용, 최대 100자)
          const sanitizedEventId = eventId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
          if (sanitizedEventId.length > 0) {
            setPendingDeepLink({ eventId: sanitizedEventId, date });
          }
        }
      }
    } catch (err) {
      secureLog.warn('딥링크 파싱 실패');
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    
    // AsyncStorage 초기화 후 앱 시작
    const initApp = async () => {
      try {
        await initAsyncStorage();
        
        // Critical path: 딥링크 + 데이터 프리페치만 대기 (앱 시작 속도 최적화)
        const [initialUrl] = await Promise.all([
          Linking.getInitialURL(),
          // 데이터 프리페치: CalendarScreen 마운트 전에 인메모리 캐시 준비
          require('./src/utils/storage').loadEvents(false).catch(() => {}),
        ]);
        
        handleDeepLink(initialUrl);
        
        if (mounted) {
          setIsReady(true);
          
          // Non-critical 초기화: 애니메이션/인터렉션 완료 후 실행 (첫 프레임 지연 없이)
          InteractionManager.runAfterInteractions(() => {
            const EventColorManager = require('./src/utils/eventColorManager').default;
            const { preWarmReviews } = require('./src/hooks/useReviews');
            EventColorManager.initialize().catch(() => {});
            AdManager.initialize().catch(() => {});
            preWarmReviews();
          });
        }
      } catch (err) {
        secureLog.error('앱 초기화 실패');
        if (mounted) {
          setError('앱을 시작하는 중 오류가 발생했습니다.\n앱을 다시 실행해주세요.');
        }
      }
    };
    
    initApp();
    
    // 딥링크 리스너 (앱이 실행 중일 때)
    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    return () => {
      mounted = false;
      linkSubscription.remove();
    };
  }, [handleDeepLink]);
  
  // 딥링크로 이벤트 페이지 이동 (최적화)
  useEffect(() => {
    if (!isReady || !pendingDeepLink || !navigationRef.current) return;
    
    // 짧은 지연 후 네비게이션 (UI 안정화)
    const timeoutId = setTimeout(() => {
      if (navigationRef.current) {
        // 안전한 Event 객체: EventDetail에서 참조하는 모든 필드에 기본값 제공
        // (불완전 객체 참조로 인한 크래시 방지)
        const safeEvent: Event = {
          id: pendingDeepLink.eventId,
          title: '파티 정보 로딩 중...',
          time: undefined,
          location: undefined,
          description: undefined,
          link: undefined,
          coordinates: undefined,
          region: undefined,
        };
        
        navigationRef.current.navigate('EventDetail', {
          event: safeEvent,
          date: pendingDeepLink.date,
        });
        
        setPendingDeepLink(null);
      }
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [isReady, pendingDeepLink]);

  if (error) {
    return <ErrorScreen message={error} />;
  }

  if (!isReady) {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <AppNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <RegionProvider>
            <ToastProvider>
              <AppContent />
            </ToastProvider>
          </RegionProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
