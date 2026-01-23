import React, { useState, useEffect, useRef } from "react";
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { View, Text, Linking } from "react-native";
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

const Stack = createNativeStackNavigator<RootStackParamList>();

// 에러 화면
function ErrorScreen({ message }: { message: string }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#fce7f3' }}>
      <Text style={{ fontSize: 40, marginBottom: 20 }}>😢</Text>
      <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginBottom: 10 }}>앱 오류</Text>
      <Text style={{ fontSize: 14, color: '#666', textAlign: 'center' }}>{message}</Text>
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

  // 딥링크 처리 함수
  const handleDeepLink = (url: string | null) => {
    if (!url) return;
    
    // soloparty://event/이벤트ID?date=2026-01-24 형식 파싱
    const match = url.match(/soloparty:\/\/event\/([^?]+)\?date=([^&]+)/);
    if (match) {
      const [, eventId, date] = match;
      setPendingDeepLink({ eventId, date });
    }
  };

  useEffect(() => {
    let mounted = true;
    
    // AsyncStorage 초기화 후 앱 시작
    const initApp = async () => {
      try {
        await initAsyncStorage();
        
        // 딥링크 체크 (앱이 꺼져있다가 열릴 때)
        const initialUrl = await Linking.getInitialURL();
        handleDeepLink(initialUrl);
        
        // 1초 추가 대기 (스플래시 화면 표시)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (mounted) {
          setIsReady(true);
        }
      } catch (err) {
        console.error('앱 초기화 실패:', err);
        if (mounted) {
          // 초기화 실패해도 앱 계속 진행
          setIsReady(true);
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
  }, []);
  
  // 딥링크로 이벤트 페이지 이동
  useEffect(() => {
    if (isReady && pendingDeepLink && navigationRef.current) {
      // 딥링크에서 받은 이벤트 정보로 이동
      // 실제로는 Gist에서 해당 이벤트를 찾아야 하지만, 
      // 여기서는 기본 정보로 이동
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
