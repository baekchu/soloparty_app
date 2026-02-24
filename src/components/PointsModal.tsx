/**
 * ==================== 포인트 모달 ====================
 * 
 * 기능:
 *   - 포인트 잔액 표시
 *   - 공짜 파티 참여
 *   - 친구 초대
 *   - 광고 보기로 포인트 적립
 *   - 포인트는 자동으로 클라우드 동기화 (서버 연동 시)
 * 
 * ========================================================================
 */

import React, { memo, useCallback, useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  ScrollView,
  Share,
  Platform,
} from 'react-native';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';
import { isTablet } from '../utils/responsive';
import { useShareInterstitialAd } from '../services/AdService';
import AdOverlay from './AdOverlay';

const STORE_LINKS = {
  ios: 'https://apps.apple.com/us/app/%EC%86%94%EB%A1%9C%ED%8C%8C%ED%8B%B0/id6757147307',
  android: 'https://play.google.com/store/apps/details?id=com.soloparty.dating',
} as const;

const SHARE_REWARD_POINTS = 50;
const MAX_DAILY_SHARES = 3;
const SHARE_COUNT_KEY = '@daily_share_count';

interface PointsModalProps {
  visible: boolean;
  onClose: () => void;
  points: number;
  onSpendPoints: (amount: number, reason: string) => Promise<boolean>;
  onWatchAd: () => Promise<{ success: boolean; message: string }>;
  onAddPoints?: (amount: number, reason: string) => Promise<boolean>;
  isDark: boolean;
  dailyAdCount?: number;
  maxDailyAds?: number;
  canWatchAd?: boolean;
  /** 포인트 히스토리 (최근 내역) */
  history?: Array<{ id: string; amount: number; reason: string; timestamp: number }>;
}

const PointsModal = memo(({ 
  visible, onClose, points, onSpendPoints, onWatchAd, onAddPoints,
  isDark, dailyAdCount = 0, maxDailyAds = 10, canWatchAd: canWatchAdProp,
  history = [],
}: PointsModalProps) => {
  
  const remainingAds = useMemo(() => (maxDailyAds || 10) - (dailyAdCount || 0), [maxDailyAds, dailyAdCount]);
  const canWatchAd = canWatchAdProp ?? remainingAds > 0;
  const [isProcessing, setIsProcessing] = useState(false);
  const [dailyShareCount, setDailyShareCount] = useState(0);
  const shareStartTimeRef = React.useRef(0);
  const remainingShares = MAX_DAILY_SHARES - dailyShareCount;
  const canShare = remainingShares > 0;
  const { isShowing: isAdShowing, skipCountdown, canSkip, showAfterShare, dismiss: dismissAd } = useShareInterstitialAd();

  // 일일 공유 횟수 로드
  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const stored = await safeGetItem(SHARE_COUNT_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          // 타입 검증: 변조된 데이터 방어
          if (typeof parsed.count === 'number' && parsed.count >= 0 &&
              typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
            const today = new Date().toISOString().slice(0, 10);
            setDailyShareCount(parsed.date === today ? Math.min(parsed.count, MAX_DAILY_SHARES) : 0);
          }
        }
      } catch { /* ignore */ }
    })();
  }, [visible]);
  
  const handleFreeParty = useCallback(() => {
    if (points >= 50000) {
      Alert.alert(
        '🎉 파티 참여',
        '50,000P를 사용하여 파티에 참여하시겠습니까?',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '참여하기',
            onPress: async () => {
              const success = await onSpendPoints(50000, '솔로파티 무료 참여');
              if (success) {
                Alert.alert('✅ 참여 완료', '50,000P가 차감되었습니다!\n파티에 참여하세요!');
                onClose();
              } else {
                Alert.alert('오류', '포인트 차감에 실패했습니다. 다시 시도해주세요.');
              }
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

  const handleShareApp = useCallback(async () => {
    if (!canShare) {
      Alert.alert(
        '📢 오늘 공유 완료',
        `오늘은 이미 ${MAX_DAILY_SHARES}번 공유했어요.\n내일 다시 공유하면 포인트를 받을 수 있어요!`,
        [{ text: '확인' }]
      );
      return;
    }

    try {
      const storeLink = Platform.OS === 'ios' ? STORE_LINKS.ios : STORE_LINKS.android;
      const message = `🎉 솔로파티에서 소개팅 파티를 찾아보세요!\n\n솔로들을 위한 파티 일정을 한눈에 확인하고 참여할 수 있어요.\n\n지금 다운로드하세요 👇\n${storeLink}`;

      shareStartTimeRef.current = Date.now();
      const result = await Share.share({
        message,
        title: '솔로파티 - 소개팅 파티 캘린더',
      });

      if (result.action === Share.sharedAction) {
        // Android에서는 공유 다이얼로그를 열기만 해도 sharedAction 반환됨
        // 최소 3초 이상 다이얼로그가 열려있었는지 확인하여 악용 방지
        const shareElapsed = Date.now() - shareStartTimeRef.current;
        if (Platform.OS === 'android' && shareElapsed < 3000) {
          Alert.alert('📤 공유 확인', '공유가 완료되지 않은 것 같아요.\n실제로 공유해 주세요!', [{ text: '확인' }]);
          return;
        }

        // 공유 횟수 카운트 저장 (경쟁 조건 방지: updater 외부에서 계산)
        const newCount = dailyShareCount + 1;
        setDailyShareCount(newCount);
        const today = new Date().toISOString().slice(0, 10);
        await safeSetItem(SHARE_COUNT_KEY, JSON.stringify({ count: newCount, date: today }));

        if (onAddPoints) {
          const success = await onAddPoints(SHARE_REWARD_POINTS, '앱 공유 보상');
          if (success) {
            Alert.alert(
              '🎉 공유 완료!',
              `친구에게 공유되었습니다!\n${SHARE_REWARD_POINTS}P가 적립되었어요!\n(오늘 남은 횟수: ${MAX_DAILY_SHARES - newCount}회)`,
              [{ text: '확인' }]
            );
          }
        } else {
          Alert.alert('📤 공유 완료', '친구에게 공유되었습니다!', [{ text: '확인' }]);
        }

        // 공유 완료 후 광고 표시 (15초 후 건너뛰기 가능)
        showAfterShare();
      }
    } catch {
      // 공유 취소 시 무시
    }
  }, [canShare, onAddPoints, showAfterShare]);

  const handleWatchAd = useCallback(async () => {
    if (!canWatchAd) {
      Alert.alert(
        '🚫 광고 시청 한도 초과',
        `6시간 동안 ${maxDailyAds}개의 광고를 모두 시청했습니다.\n6시간 후 다시 시도해주세요!`,
        [{ text: '확인' }]
      );
      return;
    }
    
    setIsProcessing(true);
    try {
      const result = await onWatchAd();
      if (result.success) {
        Alert.alert('🎉 적립 완료', result.message, [{ text: '확인' }]);
      } else {
        Alert.alert('알림', result.message, [{ text: '확인' }]);
      }
    } catch {
      Alert.alert('오류', '광고 시청 중 오류가 발생했습니다.', [{ text: '확인' }]);
    } finally {
      setIsProcessing(false);
    }
  }, [canWatchAd, maxDailyAds, onWatchAd]);

  return (
    <>
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

              {/* 앱 공유하기 */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleShareApp}
                style={[
                  styles.secondaryButton,
                  { 
                    backgroundColor: isDark ? '#334155' : '#f1f5f9',
                    borderColor: isDark ? '#475569' : '#e2e8f0',
                    opacity: canShare ? 1 : 0.4,
                  }
                ]}
              >
                <Text style={[styles.secondaryButtonText, { color: isDark ? '#e2e8f0' : '#475569' }]}>
                  📤 앱 공유하기
                </Text>
                <Text style={[styles.secondaryButtonSubtext, { color: isDark ? '#94a3b8' : '#94a3b8' }]}>
                  {canShare
                    ? `+${SHARE_REWARD_POINTS}P · 남은 횟수: ${remainingShares}/${MAX_DAILY_SHARES}회`
                    : `오늘 공유 완료 (${dailyShareCount}/${MAX_DAILY_SHARES})`
                  }
                </Text>
              </TouchableOpacity>

              {/* 광고 보기 */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleWatchAd}
                disabled={!canWatchAd || isProcessing}
                style={[
                  styles.secondaryButton,
                  { 
                    backgroundColor: isDark ? '#1e293b' : '#f8f9fa',
                    borderColor: isDark ? '#334155' : '#e5e7eb',
                    opacity: canWatchAd && !isProcessing ? 1 : 0.4,
                  }
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.secondaryButtonText, { color: isDark ? '#e2e8f0' : '#475569' }]}>
                      📺 광고 보고 포인트 받기
                    </Text>
                    <Text style={[styles.secondaryButtonSubtext, { color: isDark ? '#94a3b8' : '#94a3b8' }]}>
                      {canWatchAd 
                        ? `+50P · 남은 횟수: ${remainingAds}/${maxDailyAds}회` 
                        : `6시간 후 다시 시청 가능 (${dailyAdCount}/${maxDailyAds})`
                      }
                    </Text>
                  </View>
                  {!canWatchAd && (
                    <Text style={{ fontSize: 20 }}>🚫</Text>
                  )}
                </View>
              </TouchableOpacity>
            </View>

            {/* 포인트 적립 내역 */}
            <View style={styles.historySection}>
              <Text style={[styles.historyTitle, { color: isDark ? '#cbd5e1' : '#64748b' }]}>
                최근 내역
              </Text>
              {history.length > 0 ? (
                history.slice(0, 5).map((item) => (
                  <View key={item.id} style={[
                    styles.historyItem,
                    { backgroundColor: isDark ? '#334155' : '#f8f9fa' }
                  ]}>
                    <View>
                      <Text style={[styles.historyReason, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
                        {item.reason}
                      </Text>
                      <Text style={[styles.historyDate, { color: isDark ? '#94a3b8' : '#94a3b8' }]}>
                        {new Date(item.timestamp).toLocaleDateString('ko-KR')}
                      </Text>
                    </View>
                    <Text style={[styles.historyAmount, { color: item.amount >= 0 ? '#10b981' : '#ef4444' }]}>
                      {item.amount >= 0 ? '+' : ''}{item.amount.toLocaleString()}P
                    </Text>
                  </View>
                ))
              ) : (
                <View style={[
                  styles.historyItem,
                  { backgroundColor: isDark ? '#334155' : '#f8f9fa' }
                ]}>
                  <Text style={[styles.historyReason, { color: isDark ? '#94a3b8' : '#94a3b8' }]}>
                    아직 내역이 없습니다
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>

    {/* 공유 후 광고 오버레이 (15초 후 건너뛰기 가능) */}
    <AdOverlay
      visible={isAdShowing}
      isDark={isDark}
      skipCountdown={skipCountdown}
      canSkip={canSkip}
      onDismiss={dismissAd}
    />
    </>
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
    maxWidth: isTablet() ? 600 : 420,
    maxHeight: isTablet() ? '80%' : '85%',
    borderRadius: 24,
    padding: isTablet() ? 32 : 24,
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

