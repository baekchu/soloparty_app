import React, { useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useNotifications } from '../hooks/useNotifications';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { getContainerStyle, getResponsivePadding, getResponsiveFontSize } from '../utils/responsive';

interface SettingsScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
}

export default function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = useMemo(() => theme === 'dark', [theme]);
  const { 
    settings: notificationSettings, 
    toggleNotifications, 
    toggleNewEventAlerts, 
    toggleEventReminders 
  } = useNotifications();

  const handleNotificationToggle = useCallback(async (value: boolean) => {
    if (value) {
      const success = await toggleNotifications(true);
      if (!success) {
        Alert.alert(
          '알림 권한 필요',
          '알림을 받으려면 설정에서 알림 권한을 허용해주세요.',
          [{ text: '확인' }]
        );
      }
    } else {
      await toggleNotifications(false);
    }
  }, [toggleNotifications]);

  const handleTestNotification = useCallback(async () => {
    const { sendTestNotification } = require('../services/NotificationService');
    const success = await sendTestNotification();
    Alert.alert(
      success ? '✅ 테스트 성공' : '❌ 테스트 실패',
      success 
        ? '알림이 정상적으로 전송되었습니다!' 
        : '알림 권한을 확인해주세요.',
      [{ text: '확인' }]
    );
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0f172a' : '#ffffff' }} edges={['top', 'left', 'right']}>
      {/* 헤더 */}
      <View style={{ 
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: getResponsivePadding(), 
        paddingTop: 10,
        paddingBottom: 20, 
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#334155' : '#e5e7eb',
      }}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ padding: 8 }}
        >
          <Text style={{ fontSize: 24, color: isDark ? '#f8fafc' : '#0f172a' }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: getResponsiveFontSize(20), fontWeight: '700', color: isDark ? '#f8fafc' : '#0f172a' }}>
          설정
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={getContainerStyle(800)}>
        {/* 다크모드 설정 */}
        <View style={{
          margin: getResponsivePadding(),
          padding: getResponsivePadding(),
          backgroundColor: isDark ? '#1e293b' : '#f9fafb',
          borderRadius: 12,
        }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <View>
              <Text style={{
                fontSize: 18,
                fontWeight: '700',
                color: isDark ? '#f8fafc' : '#0f172a',
                marginBottom: 4,
              }}>
                다크 모드
              </Text>
              <Text style={{
                fontSize: 14,
                color: isDark ? '#94a3b8' : '#64748b',
              }}>
                {isDark ? '어두운 테마 사용 중' : '밝은 테마 사용 중'}
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#d1d5db', true: '#a78bfa' }}
              thumbColor={isDark ? '#ec4899' : '#f3f4f6'}
            />
          </View>
        </View>

        {/* 알림 설정 */}
        <View style={{
          marginHorizontal: getResponsivePadding(),
          marginBottom: getResponsivePadding(),
          padding: getResponsivePadding(),
          backgroundColor: isDark ? '#1e293b' : '#f9fafb',
          borderRadius: 12,
        }}>
          <Text style={{
            fontSize: 18,
            fontWeight: '700',
            color: isDark ? '#f8fafc' : '#0f172a',
            marginBottom: 16,
          }}>
            알림 설정
          </Text>

          {/* 알림 활성화 */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 16,
                fontWeight: '600',
                color: isDark ? '#f8fafc' : '#0f172a',
                marginBottom: 4,
              }}>
                알림 받기
              </Text>
              <Text style={{
                fontSize: 13,
                color: isDark ? '#94a3b8' : '#64748b',
              }}>
                {notificationSettings.enabled ? '알림이 활성화되었습니다' : '알림을 받으려면 활성화하세요'}
              </Text>
            </View>
            <Switch
              value={notificationSettings.enabled}
              onValueChange={handleNotificationToggle}
              trackColor={{ false: '#d1d5db', true: '#a78bfa' }}
              thumbColor={notificationSettings.enabled ? '#ec4899' : '#f3f4f6'}
            />
          </View>

          {/* 세부 알림 설정 (알림이 활성화된 경우에만 표시) */}
          {notificationSettings.enabled && (
            <>
              {/* 구분선 */}
              <View style={{
                height: 1,
                backgroundColor: isDark ? '#334155' : '#e5e7eb',
                marginBottom: 16,
              }} />

              {/* 새 일정 알림 */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    marginBottom: 4,
                  }}>
                    새 일정 알림
                  </Text>
                  <Text style={{
                    fontSize: 13,
                    color: isDark ? '#94a3b8' : '#64748b',
                  }}>
                    새로운 파티가 등록되면 알려드려요
                  </Text>
                </View>
                <Switch
                  value={notificationSettings.newEventAlerts}
                  onValueChange={toggleNewEventAlerts}
                  trackColor={{ false: '#d1d5db', true: '#a78bfa' }}
                  thumbColor={notificationSettings.newEventAlerts ? '#ec4899' : '#f3f4f6'}
                />
              </View>

              {/* 일정 리마인더 */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    marginBottom: 4,
                  }}>
                    일정 리마인더
                  </Text>
                  <Text style={{
                    fontSize: 13,
                    color: isDark ? '#94a3b8' : '#64748b',
                  }}>
                    파티 1시간 전에 알려드려요
                  </Text>
                </View>
                <Switch
                  value={notificationSettings.eventReminders}
                  onValueChange={toggleEventReminders}
                  trackColor={{ false: '#d1d5db', true: '#a78bfa' }}
                  thumbColor={notificationSettings.eventReminders ? '#ec4899' : '#f3f4f6'}
                />
              </View>

            
            </>
          )}
        </View>

        {/* 위치 설정 */}
        <View style={{
          marginHorizontal: getResponsivePadding(),
          marginBottom: getResponsivePadding(),
          padding: getResponsivePadding(),
          backgroundColor: isDark ? '#1e293b' : '#f9fafb',
          borderRadius: 12,
        }}>
          <TouchableOpacity
            onPress={() => {
              navigation.navigate('LocationPicker');
            }}
          >
            <View>
              <Text style={{
                fontSize: 18,
                fontWeight: '700',
                color: isDark ? '#f8fafc' : '#0f172a',
                marginBottom: 4,
              }}>
                위치 설정
              </Text>
              <Text style={{
                fontSize: 14,
                color: isDark ? '#94a3b8' : '#64748b',
              }}>
                지도에서 기본 위치 선택
              </Text>
            </View>
            <View style={{
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: [{ translateY: -12 }],
            }}>
              <Text style={{ fontSize: 24, color: isDark ? '#94a3b8' : '#64748b' }}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 앱 정보 */}
        <View style={{
          marginHorizontal: getResponsivePadding(),
          marginBottom: getResponsivePadding(),
          padding: getResponsivePadding(),
          backgroundColor: isDark ? '#1e293b' : '#f9fafb',
          borderRadius: 12,
        }}>
          <Text style={{
            fontSize: 18,
            fontWeight: '700',
            color: isDark ? '#f8fafc' : '#0f172a',
            marginBottom: 8,
          }}>
            앱 정보
          </Text>
          <Text style={{
            fontSize: 14,
            color: isDark ? '#94a3b8' : '#64748b',
            lineHeight: 20,
          }}>
            Solo Party v1.0.0{'\n'}
            특별한 만남을 위한 일정 관리{'\n\n'}
            © 2025 Solo Party. All rights reserved.{'\n'}
            본 앱의 모든 콘텐츠는 저작권법의 보호를 받습니다.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
