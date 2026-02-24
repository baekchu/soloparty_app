import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, Alert, Platform, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useTheme } from '../contexts/ThemeContext';
import { useNotifications } from '../hooks/useNotifications';
import { clearCache } from '../utils/storage';
// import { PointsMigrationService } from '../services/PointsMigrationService'; // 로그인 기능 추가 시 활성화
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';

// ==================== 상수 정의 ====================
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.3';
const APP_NAME = 'Solo Party';
const SECTION_PADDING = 20;

interface SettingsScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
}

export default function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { theme, toggleTheme, isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { 
    settings: notificationSettings, 
    toggleNotifications, 
    toggleNewEventAlerts, 
    toggleEventReminders 
  } = useNotifications();

  // 포인트 & 쿠폰 정보 (로그인 기능 추가 시 활성화)
  // const { balance: points } = usePoints();
  // const { availableCoupons } = useCoupons();

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
          '알림을 받으시려면 설정에서 알림 권한을 허용해주세요.',
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

  // 캐시 삭제 핸들러
  const handleClearCache = useCallback(() => {
    Alert.alert(
      '캐시 삭제',
      '캐시된 이벤트 데이터를 삭제합니다.\n다음 접속 시 최신 데이터를 다시 불러옵니다.\n\n(찜, 알림 등 개인 데이터는 유지됩니다)',
      [
        { text: '취소', style: 'cancel' },
        { 
          text: '삭제', 
          style: 'destructive',
          onPress: async () => {
            try {
              await clearCache();
              Alert.alert('완료', '캐시가 삭제되었습니다.\n앱을 재시작하면 최신 데이터를 불러옵니다.');
            } catch {
              Alert.alert('오류', '캐시 삭제에 실패했습니다.');
            }
          },
        },
      ]
    );
  }, []);

  return (
    <SafeAreaView style={[settingsStyles.container, { backgroundColor: colors.bg }]}>
      {/* 헤더 */}
      <View style={[settingsStyles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={goBack} style={settingsStyles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[settingsStyles.backButtonText, { color: colors.text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[settingsStyles.headerTitle, { color: colors.text }]}>
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
        <View style={[settingsStyles.section, { backgroundColor: colors.card }]}>
          <View style={settingsStyles.settingRow}>
            <View>
              <Text style={[settingsStyles.sectionTitle, { color: colors.text, marginBottom: 4 }]}>
                다크 모드
              </Text>
              <Text style={[settingsStyles.descText, { color: colors.subtext }]}>
                {isDark ? '어두운 테마 사용 중' : '밝은 테마 사용 중'}
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.trackFalse, true: '#a78bfa' }}
              thumbColor={isDark ? '#ec4899' : '#f3f4f6'}
            />
          </View>
        </View>

        {/* 알림 설정 */}
        <View style={[settingsStyles.sectionHorizontal, { backgroundColor: colors.card }]}>
          <Text style={[settingsStyles.sectionTitle, { color: colors.text }]}>
            알림 설정
          </Text>

          {/* 알림 활성화 */}
          <View style={settingsStyles.settingRowMb}>
            <View style={settingsStyles.flex1}>
              <Text style={[settingsStyles.itemTitle, { color: colors.text }]}>
                알림 받기
              </Text>
              <Text style={[settingsStyles.itemDesc, { color: colors.subtext }]}>
                {notificationSettings.enabled ? '알림이 활성화되었습니다' : '알림을 받으시려면 활성화하세요'}
              </Text>
            </View>
            <Switch
              value={notificationSettings.enabled}
              onValueChange={handleNotificationToggle}
              trackColor={{ false: colors.trackFalse, true: '#a78bfa' }}
              thumbColor={notificationSettings.enabled ? '#ec4899' : '#f3f4f6'}
            />
          </View>

          {/* 세부 알림 설정 (알림이 활성화된 경우에만 표시) */}
          {notificationSettings.enabled && (
            <>
              <View style={[settingsStyles.thinDivider, { backgroundColor: colors.border }]} />

              {/* 새 일정 알림 */}
              <View style={settingsStyles.settingRowMb}>
                <View style={settingsStyles.flex1}>
                  <Text style={[settingsStyles.itemTitle, { color: colors.text }]}>
                    새 일정 알림
                  </Text>
                  <Text style={[settingsStyles.itemDesc, { color: colors.subtext }]}>
                    새로운 파티가 등록되면 알려드려요
                  </Text>
                </View>
                <Switch
                  value={notificationSettings.newEventAlerts}
                  onValueChange={toggleNewEventAlerts}
                  trackColor={{ false: colors.trackFalse, true: '#a78bfa' }}
                  thumbColor={notificationSettings.newEventAlerts ? '#ec4899' : '#f3f4f6'}
                />
              </View>

              {/* 일정 리마인더 */}
              <View style={settingsStyles.settingRow}>
                <View style={settingsStyles.flex1}>
                  <Text style={[settingsStyles.itemTitle, { color: colors.text }]}>
                    일정 리마인더
                  </Text>
                  <Text style={[settingsStyles.itemDesc, { color: colors.subtext }]}>
                    파티 1시간 전에 알려드려요
                  </Text>
                </View>
                <Switch
                  value={notificationSettings.eventReminders}
                  onValueChange={toggleEventReminders}
                  trackColor={{ false: colors.trackFalse, true: '#a78bfa' }}
                  thumbColor={notificationSettings.eventReminders ? '#ec4899' : '#f3f4f6'}
                />
              </View>
            </>
          )}
        </View>

        {/* 위치 설정 */}
        <View style={[settingsStyles.sectionHorizontal, { backgroundColor: colors.card }]}>
          <TouchableOpacity 
            onPress={navigateToLocationPicker}
            style={settingsStyles.settingRow}
          >
            <View style={settingsStyles.flex1}>
              <Text style={[settingsStyles.sectionTitle, { color: colors.text, marginBottom: 4 }]}>
                위치 설정
              </Text>
              <Text style={[settingsStyles.descText, { color: colors.subtext }]}>
                지도에서 기본 위치 선택
              </Text>
            </View>
            <Text style={[settingsStyles.arrowText, { color: colors.subtext }]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* 약관 및 법적정보 */}
        <View style={[settingsStyles.sectionHorizontal, { backgroundColor: colors.card }]}>
          <Text style={[settingsStyles.sectionTitle, { color: colors.text }]}>
            약관 및 법적정보
          </Text>

          <TouchableOpacity onPress={() => navigateToLegal('terms')} style={settingsStyles.menuItem}>
            <Text style={[settingsStyles.menuText, { color: colors.text }]}>이용약관</Text>
            <Text style={[settingsStyles.menuArrow, { color: colors.subtext }]}>›</Text>
          </TouchableOpacity>

          <View style={[settingsStyles.divider, { backgroundColor: colors.border }]} />

          <TouchableOpacity onPress={() => navigateToLegal('privacy')} style={settingsStyles.menuItem}>
            <Text style={[settingsStyles.menuText, { color: colors.text }]}>개인정보처리방침</Text>
            <Text style={[settingsStyles.menuArrow, { color: colors.subtext }]}>›</Text>
          </TouchableOpacity>

          <View style={[settingsStyles.divider, { backgroundColor: colors.border }]} />

          <TouchableOpacity onPress={() => navigateToLegal('copyright')} style={settingsStyles.menuItem}>
            <Text style={[settingsStyles.menuText, { color: colors.text }]}>저작권 정보</Text>
            <Text style={[settingsStyles.menuArrow, { color: colors.subtext }]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* 데이터 관리 */}
        <View style={[settingsStyles.sectionHorizontal, { backgroundColor: colors.card }]}>
          <Text style={[settingsStyles.sectionTitle, { color: colors.text }]}>
            데이터 관리
          </Text>
          <TouchableOpacity onPress={handleClearCache} style={settingsStyles.menuItem}>
            <Text style={[settingsStyles.menuText, { color: colors.text }]}>캐시 삭제</Text>
            <Text style={[settingsStyles.menuArrow, { color: colors.subtext }]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* 앱 정보 */}
        <View style={[settingsStyles.section, { backgroundColor: colors.card }]}>
          <Text style={[settingsStyles.sectionTitle, { color: colors.text }]}>
            앱 정보
          </Text>
          <Text style={[settingsStyles.appInfoText, { color: colors.subtext }]}>
            {APP_NAME} v{APP_VERSION}{'\n'}
            특별한 만남을 위한 일정 관리{'\n\n'}
            © 2026 {APP_NAME}. All rights reserved.
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
    borderRadius: 16,
  },
  sectionHorizontal: {
    marginHorizontal: SECTION_PADDING,
    marginBottom: SECTION_PADDING,
    padding: SECTION_PADDING,
    borderRadius: 16,
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
  settingRowMb: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  flex1: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemDesc: {
    fontSize: 13,
  },
  descText: {
    fontSize: 14,
  },
  thinDivider: {
    height: 1,
    marginBottom: 16,
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
  menuText: {
    fontSize: 16,
  },
  menuArrow: {
    fontSize: 20,
  },
  arrowText: {
    fontSize: 24,
  },
  appInfoText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
