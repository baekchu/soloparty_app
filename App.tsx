import React, { useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
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
        {/* ======================================================================== */}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <RegionProvider>
          {/* ==================== 사용자 식별 + 광고 시스템 (네이티브 빌드 후 활성화) ==================== */}
          {/* 네이티브 빌드 후 활성화:
        <UserProvider>
          <RewardProvider>
            <AppContent />
          </RewardProvider>
        </UserProvider>
        */}
          <AppContent />
          {/* ======================================================================== */}
        </RegionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}