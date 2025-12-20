/**
 * ==================== 포인트 모달 ====================
 * 
 * 기능:
 *   - 포인트 잔액 표시
 *   - 공짜 파티 참여
 *   - 친구 초대
 *   - 광고 보기 (네이티브 빌드 후)
 * 
 * ========================================================================
 */

import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';

interface PointsModalProps {
  visible: boolean;
  onClose: () => void;
  points: number;
  onSpendPoints: (amount: number, reason: string) => void;
  isDark: boolean;
}

const PointsModal = memo(({ visible, onClose, points, onSpendPoints, isDark }: PointsModalProps) => {
  
  const handleFreeParty = useCallback(() => {
    if (points >= 50000) {
      Alert.alert(
        '🎉 참여 완료',
        '50,000P가 차감되었습니다!\n파티에 참여하세요!',
        [
          {
            text: '확인',
            onPress: () => {
              onSpendPoints(50000, '솔로파티 무료 참여');
              onClose();
            }
          }
        ]
      );
    } else {
      Alert.alert(
        '포인트 부족',
        `필요: 50,000P\n현재: ${points.toLocaleString()}P\n\n친구를 초대하거나 광고를 시청하여\n포인트를 모아보세요!`,
        [{ text: '확인' }]
      );
    }
  }, [points, onSpendPoints, onClose]);

  const handleInviteFriend = useCallback(() => {
    onClose();
    Alert.alert(
      '👥 친구 초대',
      '친구 1명 초대 시 500P 적립!\n(친구 초대 기능은 곧 출시됩니다)',
      [{ text: '확인' }]
    );
  }, [onClose]);

  const handleWatchAd = useCallback(() => {
    Alert.alert(
      '광고 시청',
      '광고 시스템은 네이티브 빌드 후 사용 가능합니다.\n\nnpx expo prebuild --clean\nnpx expo run:android',
      [{ text: '확인' }]
    );
  }, []);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={styles.overlay}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.container,
            { backgroundColor: isDark ? '#1e293b' : '#ffffff' }
          ]}
        >
          {/* 닫기 버튼 */}
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.closeText, { color: isDark ? '#94a3b8' : '#64748b' }]}>×</Text>
          </TouchableOpacity>

          <ScrollView 
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* 헤더 */}
            <View style={styles.header}>
              <View style={[
                styles.pointBadge,
                { backgroundColor: isDark ? '#a78bfa' : '#ec4899' }
              ]}>
                <Text style={styles.pointBadgeText}>P</Text>
              </View>
              <Text style={[styles.title, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
                포인트
              </Text>
            </View>

            {/* 잔액 카드 */}
            <View style={[
              styles.balanceCard,
              { backgroundColor: isDark ? '#334155' : '#f8f9fa' }
            ]}>
              <Text style={[styles.balanceLabel, { color: isDark ? '#cbd5e1' : '#64748b' }]}>
                보유 포인트
              </Text>
              <Text style={[styles.balanceAmount, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
                {points.toLocaleString()}P
              </Text>
              <Text style={[styles.balanceDesc, { color: isDark ? '#94a3b8' : '#94a3b8' }]}>
                50,000P = 파티 무료 참여
              </Text>
            </View>

            {/* 버튼들 */}
            <View style={styles.buttonsContainer}>
              {/* 공짜 파티 참여하기 */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleFreeParty}
                style={[
                  styles.primaryButton,
                  { 
                    backgroundColor: points >= 50000 
                      ? (isDark ? '#a78bfa' : '#ec4899')
                      : (isDark ? '#475569' : '#cbd5e1'),
                  }
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  🎉 공짜로 파티 참여하기
                </Text>
                <Text style={styles.primaryButtonSubtext}>
                  50,000P 필요
                </Text>
              </TouchableOpacity>

              {/* 친구 초대 */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleInviteFriend}
                style={[
                  styles.secondaryButton,
                  { 
                    backgroundColor: isDark ? '#334155' : '#f1f5f9',
                    borderColor: isDark ? '#475569' : '#e2e8f0',
                  }
                ]}
              >
                <Text style={[styles.secondaryButtonText, { color: isDark ? '#e2e8f0' : '#475569' }]}>
                  👥 친구 초대하기
                </Text>
                <Text style={[styles.secondaryButtonSubtext, { color: isDark ? '#94a3b8' : '#94a3b8' }]}>
                  +500P/명
                </Text>
              </TouchableOpacity>

              {/* 광고 보기 (비활성화) */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleWatchAd}
                style={[
                  styles.secondaryButton,
                  { 
                    backgroundColor: isDark ? '#1e293b' : '#f8f9fa',
                    borderColor: isDark ? '#334155' : '#e5e7eb',
                    opacity: 0.6,
                  }
                ]}
              >
                <Text style={[styles.secondaryButtonText, { color: isDark ? '#64748b' : '#94a3b8' }]}>
                  📺 광고 보고 포인트 받기
                </Text>
                <Text style={[styles.secondaryButtonSubtext, { color: isDark ? '#475569' : '#cbd5e1' }]}>
                  네이티브 빌드 후 사용 가능
                </Text>
              </TouchableOpacity>
            </View>

            {/* 포인트 적립 내역 */}
            <View style={styles.historySection}>
              <Text style={[styles.historyTitle, { color: isDark ? '#cbd5e1' : '#64748b' }]}>
                최근 내역
              </Text>
              <View style={[
                styles.historyItem,
                { backgroundColor: isDark ? '#334155' : '#f8f9fa' }
              ]}>
                <View>
                  <Text style={[styles.historyReason, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
                    테스트 포인트
                  </Text>
                  <Text style={[styles.historyDate, { color: isDark ? '#94a3b8' : '#94a3b8' }]}>
                    2025-12-20
                  </Text>
                </View>
                <Text style={[styles.historyAmount, { color: '#10b981' }]}>
                  +2,500P
                </Text>
              </View>
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
});

PointsModal.displayName = 'PointsModal';

export default PointsModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  closeText: {
    fontSize: 28,
    fontWeight: '300',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  pointBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  pointBadgeText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  balanceCard: {
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: '900',
    marginBottom: 8,
  },
  balanceDesc: {
    fontSize: 12,
    fontWeight: '500',
  },
  buttonsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  primaryButton: {
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  primaryButtonSubtext: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  secondaryButton: {
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  secondaryButtonSubtext: {
    fontSize: 11,
    fontWeight: '600',
  },
  historySection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  historyTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
  },
  historyReason: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 11,
    fontWeight: '500',
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: '800',
  },
});
