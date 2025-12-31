import React, { useState, useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { View, Text, ActivityIndicator } from "react-native";
import { ThemeProvider, useTheme } from "./src/contexts/ThemeContext";
import { RegionProvider } from "./src/contexts/RegionContext";
import { NotificationPrompt } from "./src/components/NotificationPrompt";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { RootStackParamList } from "./src/types";

import CalendarScreen from "./src/screens/CalendarScreen";
import AddEventScreen from "./src/screens/AddEventScreen";
import SplashScreen from "./src/screens/SplashScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import LocationPickerScreen from "./src/screens/LocationPickerScreen";
import LegalScreen from "./src/screens/LegalScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppContent() {
  const { theme } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('앱 초기화 시작');
        // 네이티브 빌드에서는 더 긴 초기화 시간 필요
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('앱 초기화 완료');
      } catch (err) {
        console.error('앱 초기화 오류:', err);
        setError(String(err));
      }
    };
    
    initializeApp();
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#fce7f3' }}>
        <Text style={{ fontSize: 24, marginBottom: 16 }}>😢</Text>
        <Text style={{ fontSize: 18, color: '#0f172a', marginBottom: 10, fontWeight: 'bold' }}>앱 초기화 오류</Text>
        <Text style={{ fontSize: 14, color: '#666', textAlign: 'center' }}>{error}</Text>
        <Text style={{ fontSize: 12, color: '#999', marginTop: 20, textAlign: 'center' }}>
          앱을 다시 시작해주세요
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return <SplashScreen onLoadComplete={() => setIsLoading(false)} />;
  }

  return (
    <NavigationContainer>
      <NotificationPrompt isDark={theme === "dark"} />
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="MainTabs" component={CalendarScreen} />
        <Stack.Screen
          name="AddEvent"
          component={AddEventScreen}
          options={{
            presentation: "modal",
          }}
        />
        
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="LocationPicker"
          component={LocationPickerScreen}
          options={{
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="Legal"
          component={LegalScreen}
          options={{
            presentation: "modal",
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <RegionProvider>
          <AppContent />
        </RegionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}