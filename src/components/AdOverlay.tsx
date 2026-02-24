/**
 * ==================== 공유 후 광고 오버레이 ====================
 * 
 * 15초 카운트다운 후 건너뛰기 가능한 전면 광고 오버레이.
 * SDK 미연동 시 앱 자체 프로모션을 표시하는 예시 화면.
 * 
 * PointsModal, EventDetailScreen 등에서 공통으로 사용.
 * ========================================================================
 */

import React, { memo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Animated,
  Dimensions,
  Image,
} from 'react-native';
import { isTablet } from '../utils/responsive';

interface AdOverlayProps {
  visible: boolean;
  isDark: boolean;
  skipCountdown: number;
  canSkip: boolean;
  onDismiss: () => void;
}

/**
 * 15초 광고 예시 오버레이
 * - 진행률 바 (상단)
 * - 솔로파티 자체 프로모션 콘텐츠 (SDK 미연동 시)
 * - 카운트다운 → "건너뛰기" 버튼
 */
const AdOverlay = memo(({ visible, isDark, skipCountdown, canSkip, onDismiss }: AdOverlayProps) => {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // 진입 애니메이션 + 진행률 바
  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      progressAnim.setValue(0);

      const fadeAnimation = Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      });

      const progressAnimation = Animated.timing(progressAnim, {
        toValue: 1,
        duration: 15000,
        useNativeDriver: false,
      });

      fadeAnimation.start();
      progressAnimation.start();

      return () => {
        fadeAnimation.stop();
        progressAnimation.stop();
      };
    }
  }, [visible, fadeAnim, progressAnim]);

  // 비가시 시 모든 애니메이션 정리 (리소스 절약)
  useEffect(() => {
    if (!visible) {
      fadeAnim.stopAnimation();
      progressAnim.stopAnimation();
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [visible, fadeAnim, progressAnim, pulseAnim]);

  // 건너뛰기 버튼 pulse 애니메이션
  useEffect(() => {
    if (canSkip && visible) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [canSkip, visible, pulseAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const bg = isDark ? '#0f172a' : '#ffffff';
  const cardBg = isDark ? '#1e293b' : '#f8f9fa';
  const textPrimary = isDark ? '#f8fafc' : '#0f172a';
  const textSecondary = isDark ? '#94a3b8' : '#64748b';
  const accent = isDark ? '#a78bfa' : '#ec4899';
  const accentLight = isDark ? 'rgba(167, 139, 250, 0.15)' : 'rgba(236, 72, 153, 0.08)';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => { if (canSkip) onDismiss(); }}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        {/* 상단 진행률 바 */}
        <View style={styles.progressBarContainer}>
          <Animated.View
            style={[
              styles.progressBar,
              { width: progressWidth, backgroundColor: accent },
            ]}
          />
        </View>

        <View style={[styles.container, { backgroundColor: bg }]}>
          {/* 카운트다운 / 건너뛰기 (우상단) */}
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              onPress={canSkip ? onDismiss : undefined}
              activeOpacity={canSkip ? 0.7 : 1}
              style={[
                styles.skipChip,
                {
                  backgroundColor: canSkip ? accent : (isDark ? '#334155' : '#e5e7eb'),
                },
              ]}
            >
              <Text style={[
                styles.skipChipText,
                { color: canSkip ? '#ffffff' : textSecondary },
              ]}>
                {canSkip ? '건너뛰기 ›' : `${skipCountdown}s`}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* === 예시 광고 콘텐츠 영역 === */}
          {/* SDK 연동 후 이 영역을 실제 동영상 광고로 교체 */}
          <View style={[styles.adContent, { backgroundColor: cardBg }]}>
            {/* 배경 그라디언트 효과 */}
            <View style={[styles.adGradient, { backgroundColor: accentLight }]} />
            
            {/* 로고 + 앱 이름 */}
            <View style={styles.adBrandRow}>
              <View style={[styles.adLogo, { backgroundColor: accent }]}>
                <Text style={styles.adLogoText}>SP</Text>
              </View>
              <View>
                <Text style={[styles.adBrandName, { color: textPrimary }]}>솔로파티</Text>
                <Text style={[styles.adBrandSub, { color: textSecondary }]}>광고 · AD</Text>
              </View>
            </View>

            {/* 메인 비주얼 영역 (동영상 자리) */}
            <View style={[styles.videoArea, { backgroundColor: isDark ? '#0f172a' : '#e2e8f0' }]}>
              <Text style={styles.videoEmoji}>🎉</Text>
              <Text style={[styles.videoTitle, { color: textPrimary }]}>
                소개팅 파티의 새로운 시작
              </Text>
              <Text style={[styles.videoSubtitle, { color: textSecondary }]}>
                매주 업데이트되는 파티 일정을{'\n'}한눈에 확인하세요
              </Text>
              {/* 재생 버튼 시각적 표시 */}
              <View style={[styles.playButton, { borderColor: accent }]}>
                <Text style={[styles.playIcon, { color: accent }]}>▶</Text>
              </View>
            </View>

            {/* CTA 영역 */}
            <View style={styles.ctaRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.ctaTitle, { color: textPrimary }]}>
                  지금 바로 참여해 보세요
                </Text>
                <Text style={[styles.ctaDesc, { color: textSecondary }]}>
                  포인트로 무료 파티 참여 가능!
                </Text>
              </View>
              <View style={[styles.ctaButton, { backgroundColor: accent }]}>
                <Text style={styles.ctaButtonText}>자세히</Text>
              </View>
            </View>
          </View>

          {/* 하단 안내 */}
          <Text style={[styles.footerText, { color: textSecondary }]}>
            솔로파티를 무료로 유지하는 데 도움이 돼요 🙏
          </Text>
        </View>
      </Animated.View>
    </Modal>
  );
});

AdOverlay.displayName = 'AdOverlay';
export default AdOverlay;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    zIndex: 10,
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  container: {
    width: '100%',
    maxWidth: isTablet() ? 480 : 380,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    gap: 12,
  },
  // 건너뛰기 칩
  skipChip: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 48,
    alignItems: 'center',
  },
  skipChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  // 광고 콘텐츠 영역
  adContent: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  adGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  adBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  adLogo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  adLogoText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  adBrandName: {
    fontSize: 14,
    fontWeight: '700',
  },
  adBrandSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  // 동영상 영역
  videoArea: {
    marginHorizontal: 12,
    borderRadius: 12,
    paddingVertical: 32,
    alignItems: 'center',
    gap: 8,
    position: 'relative',
  },
  videoEmoji: {
    fontSize: 48,
    marginBottom: 4,
  },
  videoTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  videoSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  playButton: {
    marginTop: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 18,
    marginLeft: 3,
  },
  // CTA 영역
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  ctaTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  ctaDesc: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  ctaButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  ctaButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  // 하단
  footerText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});
