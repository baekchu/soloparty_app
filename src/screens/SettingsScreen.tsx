import React, { useMemo, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, Alert, Platform, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useNotifications } from '../hooks/useNotifications';
import { usePoints } from '../hooks/usePoints';
import { useCoupons } from '../hooks/useCoupons';
// import { PointsMigrationService } from '../services/PointsMigrationService'; // 로그인 기능 추가 시 활성화
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';

// ==================== 상수 정의 ====================
const APP_VERSION = '1.0.0';
const APP_NAME = 'Solo Party';
const SECTION_PADDING = 20;

interface SettingsScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
}

export default function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = useMemo(() => theme === 'dark', [theme]);
  const insets = useSafeAreaInsets();
  const { 
    settings: notificationSettings, 
    toggleNotifications, 
    toggleNewEventAlerts, 
    toggleEventReminders 
  } = useNotifications();

  // 포인트 & 쿠폰 정보
  const { balance: points } = usePoints();
  const { availableCoupons } = useCoupons();

  // 마이그레이션 상태 (로그인 기능 추가 시 활성화)
  // const [migrationStatus, setMigrationStatus] = useState<{
  //   isMigrated: boolean;
  //   hasData: boolean;
  // }>({ isMigrated: false, hasData: false });
  //
  // useEffect(() => {
  //   const checkMigration = async () => {
  //     const status = await PointsMigrationService.previewMigrationData();
  //     setMigrationStatus({ isMigrated: status.isMigrated, hasData: status.hasData });
  //   };
  //   checkMigration();
  // }, []);

  // 알림 토글 핸들러
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

  // 네비게이션 핸들러
  const navigateToLocationPicker = useCallback(() => {
    navigation.navigate('LocationPicker');
  }, [navigation]);

  const navigateToLegal = useCallback((type: 'terms' | 'privacy' | 'copyright') => {
    navigation.navigate('Legal', { type });
  }, [navigation]);

  const navigateToCoupon = useCallback(() => {
    navigation.navigate('Coupon');
  }, [navigation]);

  const goBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <SafeAreaView style={[settingsStyles.container, { backgroundColor: isDark ? '#0f172a' : '#ffffff' }]}>
      {/* 헤더 */}
      <View style={[settingsStyles.header, { backgroundColor: isDark ? '#1e293b' : '#ffffff', borderBottomColor: isDark ? '#334155' : '#e5e7eb' }]}>
        <TouchableOpacity onPress={goBack} style={settingsStyles.backButton}>
          <Text style={[settingsStyles.backButtonText, { color: isDark ? '#f8fafc' : '#0f172a' }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[settingsStyles.headerTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
          설정
        </Text>
        <View style={settingsStyles.headerSpacer} />
      </View>

      <ScrollView 
        style={settingsStyles.scrollView} 
        contentContainerStyle={{ paddingBottom: Math.max(20, insets.bottom) }}
        showsVerticalScrollIndicator={false}
      >
        {/* 다크모드 설정 */}
        <View style={[settingsStyles.section, { backgroundColor: isDark ? '#1e293b' : '#f9fafb' }]}>
          <View style={settingsStyles.settingRow}>
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
        <View style={[settingsStyles.sectionHorizontal, { backgroundColor: isDark ? '#1e293b' : '#f9fafb' }]}>
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
        <View style={[settingsStyles.sectionHorizontal, { backgroundColor: isDark ? '#1e293b' : '#f9fafb' }]}>
          <TouchableOpacity onPress={navigateToLocationPicker}>
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

        {/* 포인트 & 쿠폰 */}
        {/* <View style={[settingsStyles.sectionHorizontal, { backgroundColor: isDark ? '#1e293b' : '#f9fafb' }]}>
          <TouchableOpacity 
            onPress={navigateToCoupon}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{
                fontSize: 18,
                fontWeight: '700',
                color: isDark ? '#f8fafc' : '#0f172a',
                marginBottom: 4,
              }}>
                🎟️ 포인트 & 쿠폰
              </Text>
              <Text style={{
                fontSize: 14,
                color: isDark ? '#94a3b8' : '#64748b',
              }}>
                {points.toLocaleString()}P · 쿠폰 {availableCoupons.length}장
              </Text>
            </View>
            <Text style={{ fontSize: 24, color: isDark ? '#94a3b8' : '#64748b' }}>›</Text>
          </TouchableOpacity>
        </View> */}

        {/* 약관 및 정책 */}
        <View style={[settingsStyles.sectionHorizontal, { backgroundColor: isDark ? '#1e293b' : '#f9fafb' }]}>
          <Text style={{
            fontSize: 18,
            fontWeight: '700',
            color: isDark ? '#f8fafc' : '#0f172a',
            marginBottom: 16,
          }}>
            약관 및 정책
          </Text>

          {/* 이용약관 */}
          <TouchableOpacity
            onPress={() => navigateToLegal('terms')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 12,
            }}
          >
            <Text style={{
              fontSize: 16,
              color: isDark ? '#f8fafc' : '#0f172a',
            }}>
              이용약관
            </Text>
            <Text style={{ fontSize: 20, color: isDark ? '#94a3b8' : '#64748b' }}>›</Text>
          </TouchableOpacity>

          {/* 구분선 */}
          <View style={[settingsStyles.divider, { backgroundColor: isDark ? '#334155' : '#e5e7eb' }]} />

          {/* 개인정보처리방침 */}
          <TouchableOpacity
            onPress={() => navigateToLegal('privacy')}
            style={settingsStyles.menuItem}
          >
            <Text style={{
              fontSize: 16,
              color: isDark ? '#f8fafc' : '#0f172a',
            }}>
              개인정보처리방침
            </Text>
            <Text style={{ fontSize: 20, color: isDark ? '#94a3b8' : '#64748b' }}>›</Text>
          </TouchableOpacity>

          {/* 구분선 */}
          <View style={[settingsStyles.divider, { backgroundColor: isDark ? '#334155' : '#e5e7eb' }]} />

          {/* 저작권 정보 */}
          <TouchableOpacity
            onPress={() => navigateToLegal('copyright')}
            style={settingsStyles.menuItem}
          >
            <Text style={{
              fontSize: 16,
              color: isDark ? '#f8fafc' : '#0f172a',
            }}>
              저작권 정보
            </Text>
            <Text style={{ fontSize: 20, color: isDark ? '#94a3b8' : '#64748b' }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* 앱 정보 */}
        <View style={[settingsStyles.section, { backgroundColor: isDark ? '#1e293b' : '#f9fafb' }]}>
          <Text style={[settingsStyles.sectionTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
            앱 정보
          </Text>
          <Text style={[settingsStyles.appInfoText, { color: isDark ? '#94a3b8' : '#64748b' }]}>
            {APP_NAME} v{APP_VERSION}{'\n'}
            특별한 만남을 위한 일정 관리{'\n\n'}
            © 2025 {APP_NAME}. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ==================== 스타일시트 ====================
const settingsStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SECTION_PADDING,
    paddingTop: SECTION_PADDING,
    paddingBottom: SECTION_PADDING,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 24,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    margin: SECTION_PADDING,
    padding: SECTION_PADDING,
    borderRadius: 12,
  },
  sectionHorizontal: {
    marginHorizontal: SECTION_PADDING,
    marginBottom: SECTION_PADDING,
    padding: SECTION_PADDING,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  appInfoText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
