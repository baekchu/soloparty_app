/**
 * ==================== 친구 초대 화면 ====================
 * 
 * 기능:
 *   - 내 초대 코드 표시 및 공유
 *   - 초대 코드 입력
 *   - 초대 통계 확인
 *   - 초대 보상 안내
 * 
 * ========================================================================
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../contexts/ThemeContext';
import { useUser } from '../contexts/UserContext';
import { useReward } from '../contexts/RewardContext';

export default function InviteScreen() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { inviteCode, getUserData, registerWithInviteCode } = useUser();
  const { addReward } = useReward();
  
  const [inputCode, setInputCode] = useState('');
  const [invitedCount, setInvitedCount] = useState(0);
  const [invitedBy, setInvitedBy] = useState<string | null>(null);

  useEffect(() => {
    loadUserStats();
  }, []);

  const loadUserStats = async () => {
    const userData = await getUserData();
    if (userData) {
      setInvitedCount(userData.invitedCount);
      setInvitedBy(userData.invitedBy);
    }
  };

  // 초대 코드 복사
  const copyInviteCode = async () => {
    if (inviteCode) {
      await Clipboard.setStringAsync(inviteCode);
      Alert.alert('✅ 복사 완료', '초대 코드가 클립보드에 복사되었습니다!');
    }
  };

  // 초대 코드 공유
  const shareInviteCode = async () => {
    if (!inviteCode) return;

    try {
      await Share.share({
        message: `🎉 솔로파티 앱에 초대합니다!\n\n초대 코드: ${inviteCode}\n\n초대 코드를 입력하면 친구와 나 모두 500원을 받을 수 있어요!\n\n지금 다운로드: [앱 다운로드 링크]`,
        title: '솔로파티 초대',
      });
    } catch (error) {
      console.error('공유 실패:', error);
    }
  };

  // 초대 코드 입력
  const submitInviteCode = async () => {
    if (!inputCode.trim()) {
      Alert.alert('오류', '초대 코드를 입력해주세요.');
      return;
    }

    if (inputCode.toUpperCase() === inviteCode) {
      Alert.alert('오류', '자신의 초대 코드는 입력할 수 없습니다.');
      return;
    }

    if (invitedBy) {
      Alert.alert('알림', '이미 초대 코드를 등록하셨습니다.');
      return;
    }

    const success = await registerWithInviteCode(inputCode.toUpperCase());
    
    if (success) {
      // 양쪽 모두 보상 지급
      await addReward(500, '친구 초대 보상');
      
      Alert.alert(
        '🎉 초대 코드 등록 완료!',
        '500원이 적립되었습니다!\n초대한 친구도 500원을 받았어요!',
        [{ text: '확인', onPress: loadUserStats }]
      );
      setInputCode('');
    } else {
      Alert.alert('오류', '유효하지 않은 초대 코드입니다.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#000000' : '#f8f9fa' }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 헤더 */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: isDark ? '#ffffff' : '#1a1a1a' }]}>
            친구 초대
          </Text>
          <Text style={[styles.headerSubtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
            친구를 초대하고 함께 보상을 받으세요!
          </Text>
        </View>

        {/* 내 초대 코드 */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1a1a1a' : '#ffffff' }]}>
          <View style={styles.codeHeader}>
            <Text style={[styles.cardTitle, { color: isDark ? '#ffffff' : '#1a1a1a' }]}>
              내 초대 코드
            </Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>👥 {invitedCount}명 초대</Text>
            </View>
          </View>

          <View style={styles.codeContainer}>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{inviteCode || '로딩중...'}</Text>
            </View>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.copyButton]}
              onPress={copyInviteCode}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>📋 복사</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.shareButton]}
              onPress={shareInviteCode}
              activeOpacity={0.7}
            >
              <Text style={[styles.buttonText, { color: '#ffffff' }]}>📤 공유</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 초대 코드 입력 */}
        {!invitedBy && (
          <View style={[styles.card, { backgroundColor: isDark ? '#1a1a1a' : '#ffffff' }]}>
            <Text style={[styles.cardTitle, { color: isDark ? '#ffffff' : '#1a1a1a' }]}>
              초대 코드 입력
            </Text>
            <Text style={[styles.cardSubtitle, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
              친구의 초대 코드를 입력하면 500원을 받을 수 있어요!
            </Text>

            <View style={styles.inputContainer}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? '#262626' : '#f3f4f6',
                    color: isDark ? '#ffffff' : '#1a1a1a',
                    borderColor: isDark ? '#404040' : '#e5e7eb',
                  },
                ]}
                placeholder="6자리 코드 입력 (예: ABC123)"
                placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                value={inputCode}
                onChangeText={setInputCode}
                autoCapitalize="characters"
                maxLength={6}
              />
              <TouchableOpacity
                style={styles.submitButton}
                onPress={submitInviteCode}
                activeOpacity={0.7}
              >
                <Text style={styles.submitButtonText}>등록</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {invitedBy && (
          <View style={[styles.card, styles.infoCard]}>
            <Text style={styles.infoText}>
              ✅ 이미 초대 코드를 등록하셨습니다!
            </Text>
          </View>
        )}

        {/* 보상 안내 */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1a1a1a' : '#ffffff' }]}>
          <Text style={[styles.cardTitle, { color: isDark ? '#ffffff' : '#1a1a1a' }]}>
            🎁 초대 보상
          </Text>
          
          <View style={styles.rewardItem}>
            <View style={styles.rewardIcon}>
              <Text style={styles.rewardEmoji}>👤</Text>
            </View>
            <View style={styles.rewardContent}>
              <Text style={[styles.rewardTitle, { color: isDark ? '#ffffff' : '#1a1a1a' }]}>
                초대받은 친구
              </Text>
              <Text style={[styles.rewardDesc, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                초대 코드 입력 시 즉시 500원 적립
              </Text>
            </View>
            <Text style={styles.rewardAmount}>+500원</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.rewardItem}>
            <View style={styles.rewardIcon}>
              <Text style={styles.rewardEmoji}>🎉</Text>
            </View>
            <View style={styles.rewardContent}>
              <Text style={[styles.rewardTitle, { color: isDark ? '#ffffff' : '#1a1a1a' }]}>
                초대한 나
              </Text>
              <Text style={[styles.rewardDesc, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
                친구가 코드 입력 시 자동으로 500원 적립
              </Text>
            </View>
            <Text style={styles.rewardAmount}>+500원</Text>
          </View>
        </View>

        {/* 통계 */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1a1a1a' : '#ffffff' }]}>
          <Text style={[styles.cardTitle, { color: isDark ? '#ffffff' : '#1a1a1a' }]}>
            📊 내 초대 통계
          </Text>
          
          <View style={styles.statRow}>
            <Text style={[styles.statLabel, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
              총 초대 인원
            </Text>
            <Text style={[styles.statValue, { color: isDark ? '#10b981' : '#059669' }]}>
              {invitedCount}명
            </Text>
          </View>

          <View style={styles.statRow}>
            <Text style={[styles.statLabel, { color: isDark ? '#9ca3af' : '#6b7280' }]}>
              초대 보상 합계
            </Text>
            <Text style={[styles.statValue, { color: isDark ? '#10b981' : '#059669' }]}>
              {(invitedCount * 500).toLocaleString()}원
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  badge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  codeContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  codeBox: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 32,
    paddingVertical: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#10b981',
    borderStyle: 'dashed',
  },
  codeText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#10b981',
    letterSpacing: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  copyButton: {
    backgroundColor: '#f3f4f6',
  },
  shareButton: {
    backgroundColor: '#10b981',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  inputContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 16,
    fontWeight: '600',
    borderWidth: 1,
  },
  submitButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#d1fae5',
  },
  infoText: {
    color: '#065f46',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  rewardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rewardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#d1fae5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rewardEmoji: {
    fontSize: 24,
  },
  rewardContent: {
    flex: 1,
  },
  rewardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  rewardDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  rewardAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10b981',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  statLabel: {
    fontSize: 15,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
});
