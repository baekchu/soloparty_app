import React, { useState, useEffect, useRef } from "react";
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { View, Text, Linking, Appearance } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RootStackParamList, Event } from "./src/types";

// Screens
import CalendarScreen from "./src/screens/CalendarScreen";
import AddEventScreen from "./src/screens/AddEventScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import LocationPickerScreen from "./src/screens/LocationPickerScreen";
import LegalScreen from "./src/screens/LegalScreen";
import CouponScreen from "./src/screens/CouponScreen";
import EventDetailScreen from "./src/screens/EventDetailScreen";
import SplashScreen from "./src/screens/SplashScreen";

// Components
import { ErrorBoundary } from "./src/components/ErrorBoundary";

// Contexts
import { ThemeProvider, useTheme } from "./src/contexts/ThemeContext";
import { RegionProvider } from "./src/contexts/RegionContext";

// Utils
import { initAsyncStorage } from "./src/utils/asyncStorageManager";
import { AdManager } from "./src/services/AdService";
import { secureLog } from "./src/utils/secureStorage";

const Stack = createNativeStackNavigator<RootStackParamList>();

// 에러 화면
function ErrorScreen({ message }: { message: string }) {
  const isDark = Appearance.getColorScheme() === 'dark';
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: isDark ? '#0f172a' : '#fce7f3' }}>
      <Text style={{ fontSize: 40, marginBottom: 20 }}>😢</Text>
      <Text style={{ fontSize: 18, fontWeight: 'bold', color: isDark ? '#f8fafc' : '#0f172a', marginBottom: 10 }}>앱 오류</Text>
      <Text style={{ fontSize: 14, color: isDark ? '#94a3b8' : '#666', textAlign: 'center' }}>{message}</Text>
    </View>
  );
}

function AppNavigator() {
  const { theme } = useTheme();

  return (
    <>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={CalendarScreen} />
        <Stack.Screen name="AddEvent" component={AddEventScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="LocationPicker" component={LocationPickerScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="Legal" component={LegalScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="Coupon" component={CouponScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="EventDetail" component={EventDetailScreen} options={{ presentation: "card" }} />
      </Stack.Navigator>
    </>
  );
}

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
    let timeoutId: NodeJS.Timeout | null = null;
    
    // AsyncStorage 초기화 후 앱 시작
    const initApp = async () => {
      try {
        await initAsyncStorage();
        
        // 광고 시스템 초기화 (백그라운드)
        AdManager.initialize().catch(() => {});
        
        // 딥링크 체크 (앱이 꺼져있다가 열릴 때)
        const initialUrl = await Linking.getInitialURL();
        handleDeepLink(initialUrl);
        
        // 1초 추가 대기 (스플래시 화면 표시)
        await new Promise(resolve => {
          timeoutId = setTimeout(resolve, 1000);
        });
        
        if (mounted) {
          setIsReady(true);
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
      if (timeoutId) clearTimeout(timeoutId);
      linkSubscription.remove();
    };
  }, [handleDeepLink]);
  
  // 딥링크로 이벤트 페이지 이동 (최적화)
  useEffect(() => {
    if (!isReady || !pendingDeepLink || !navigationRef.current) return;
    
    // 짧은 지연 후 네비게이션 (UI 안정화)
    const timeoutId = setTimeout(() => {
      if (navigationRef.current) {
        const mockEvent: Event = {
          id: pendingDeepLink.eventId,
          title: '파티 정보 로딩 중...',
        };
        
        navigationRef.current.navigate('EventDetail', {
          event: mockEvent,
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
            <AppContent />
          </RegionProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
