/**
 * ==================== 포인트 & 쿠폰 화면 ====================
 * 
 * 기능:
 *   - 보유 포인트 및 쿠폰 현황 표시
 *   - 광고 시청으로 50P 적립 (6시간당 최대 10회)
 *   - 50,000P → 쿠폰 교환
 *   - 쿠폰 목록 및 사용
 * 
 * 광고 정보:
 *   - 유형: 보상형 동영상 광고 (Rewarded Video Ad)
 *   - 특징: 건너뛰기 불가, 전체 시청 필수
 *   - eCPM: $10-$20 (업계 최고 단가)
 *   - 예상 수익/회: ₩15-75 (한국 기준, $0.01-$0.05)
 *   - 사용자 보상: 50P/회
 * 
 * ========================================================================
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { usePoints } from '../hooks/usePoints';
import { useCoupons, Coupon } from '../hooks/useCoupons';
import { useRewardedAd } from '../services/AdService';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';

// ==================== 상수 정의 ====================
const SECTION_PADDING = 20;

interface CouponScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Coupon'>;
}

export default function CouponScreen({ navigation }: CouponScreenProps) {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  
  // 포인트 및 쿠폰 훅
  const { 
    balance, 
    isLoading: pointsLoading, 
    addPoints,
    spendPoints,
    // 광고 관련
    adCount,
    remainingAds,
    canWatchAd,
    timeUntilReset,
    adResetTime,
    maxAds,
    adRewardPoints,
    watchAdForPoints,
  } = usePoints();
  
  const {
    availableCoupons,
    history,
    totalExchanged,
    totalUsed,
    isLoading: couponsLoading,
    POINTS_PER_COUPON,
    exchangePointsForCoupon,
    useCoupon,
    verifyCouponByCode,
    canExchange,
    pointsNeededForCoupon,
  } = useCoupons();

  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [isExchanging, setIsExchanging] = useState(false);
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const resetTimeDisplayRef = useRef('');
  const [resetTimeDisplay, setResetTimeDisplay] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const adTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // 언마운트 시 광고 타이머 정리 + 상태 리셋
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
    };
  }, []);

  const isLoading = pointsLoading || couponsLoading;

  // 보상형 광고 (건너뛰기 불가 - 최고 단가)
  const { showAd: showRewardedAd, loaded: adLoaded, loading: adLoading } = useRewardedAd(
    async (rewardAmount) => {
      // 광고 시청 완료 시 타임아웃 정리 후 포인트 지급
      if (adTimeoutRef.current) {
        clearTimeout(adTimeoutRef.current);
        adTimeoutRef.current = null;
      }
      const result = await watchAdForPoints();
      if (!isMountedRef.current) return;
      setIsWatchingAd(false);
      
      Alert.alert(
        result.success ? '💰 적립 완료!' : '알림',
        result.message,
        [{ text: '확인' }]
      );
    }
  );

  // 리셋 시간 표시 업데이트 (1분마다, adResetTime에서 실시간 계산)
  useEffect(() => {
    const updateResetTime = () => {
      const remaining = Math.max(0, adResetTime - Date.now());
      if (remaining > 0) {
        const hours = Math.floor(remaining / (60 * 60 * 1000));
        const minutes = Math.ceil((remaining % (60 * 60 * 1000)) / (60 * 1000));
        resetTimeDisplayRef.current = `${hours}시간 ${minutes}분`;
        setResetTimeDisplay(resetTimeDisplayRef.current);
      } else {
        resetTimeDisplayRef.current = '';
        setResetTimeDisplay('');
      }
    };
    
    updateResetTime();
    const interval = setInterval(updateResetTime, 60000);
    return () => clearInterval(interval);
  }, [adResetTime]);

  // 보상형 광고 시청 핸들러 (건너뛰기 불가)
  // AD_CONFIG.disableAll 상태에서는 adLoaded가 항상 false이므로 watchAdForPoints 직접 호출
  const handleWatchAd = useCallback(async () => {
    if (!canWatchAd) {
      Alert.alert(
        '🚫 광고 한도 초과',
        `6시간당 최대 ${maxAds}개까지 시청 가능합니다.\n\n⏰ 리셋까지: ${resetTimeDisplayRef.current}`,
        [{ text: '확인' }]
      );
      return;
    }

    setIsWatchingAd(true);
    try {
      if (adLoaded) {
        // 실제 광고 SDK가 활성화된 경우: 보상형 광고 표시
        showRewardedAd();
        // 타임아웃: 60초 후에도 완료되지 않으면 자동 해제
        if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
        adTimeoutRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          setIsWatchingAd(false);
          adTimeoutRef.current = null;
          Alert.alert(
            '⏰ 광고 로드 실패',
            '광고를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.',
            [{ text: '확인' }]
          );
        }, 60000);
      } else {
        // 광고 SDK 비활성화 상태: watchAdForPoints로 직접 포인트 적립
        const result = await watchAdForPoints();
        Alert.alert(
          result.success ? '💰 적립 완료!' : '알림',
          result.message,
          [{ text: '확인' }]
        );
        setIsWatchingAd(false);
      }
    } catch (error) {
      Alert.alert('오류', '광고 로드 중 오류가 발생했습니다.');
      setIsWatchingAd(false);
    }
  }, [canWatchAd, adLoaded, maxAds, showRewardedAd, watchAdForPoints]);

  // 쿠폰 교환 핸들러
  const handleExchange = useCallback(async () => {
    if (!canExchange(balance)) {
      const needed = pointsNeededForCoupon(balance);
      Alert.alert(
        '포인트 부족',
        `쿠폰 교환에 ${needed.toLocaleString()}P가 더 필요합니다.\n\n현재 보유: ${balance.toLocaleString()}P\n필요 포인트: ${POINTS_PER_COUPON.toLocaleString()}P`,
        [{ text: '확인' }]
      );
      return;
    }

    Alert.alert(
      '쿠폰 교환',
      `${POINTS_PER_COUPON.toLocaleString()}P를 사용하여\n무료 이벤트 참가권을 받으시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '교환하기',
          onPress: async () => {
            setIsExchanging(true);
            try {
              const result = await exchangePointsForCoupon(balance, spendPoints, 'free_event', addPoints);
              
              Alert.alert(
                result.success ? '🎉 교환 완료!' : '교환 실패',
                result.message,
                [{ text: '확인' }]
              );
            } catch {
              Alert.alert('오류', '쿠폰 교환 중 오류가 발생했습니다.');
            } finally {
              setIsExchanging(false);
            }
          },
        },
      ]
    );
  }, [balance, canExchange, pointsNeededForCoupon, POINTS_PER_COUPON, exchangePointsForCoupon, spendPoints, addPoints]);

  // 쿠폰 사용 핸들러
  const handleUseCoupon = useCallback(async (coupon: Coupon) => {
    Alert.alert(
      '쿠폰 사용',
      `${coupon.name}을(를) 사용하시겠습니까?\n\n사용 후에는 취소할 수 없습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '사용하기',
          onPress: async () => {
            const result = await useCoupon(coupon.id);
            setShowCouponModal(false);
            setSelectedCoupon(null);
            
            Alert.alert(
              result.success ? '✅ 사용 완료!' : '사용 실패',
              result.message,
              [{ text: '확인' }]
            );
          },
        },
      ]
    );
  }, [useCoupon]);

  // 코드 인증 핸들러
  const handleVerifyCode = useCallback(async () => {
    if (!verifyCode.trim()) return;
    setIsVerifying(true);
    setVerifyResult(null);
    try {
      const result = await verifyCouponByCode(verifyCode);
      setVerifyResult({ success: result.success, message: result.message });
      if (result.success) {
        setVerifyCode('');
      }
    } catch {
      setVerifyResult({ success: false, message: '인증 중 오류가 발생했습니다.' });
    } finally {
      setIsVerifying(false);
    }
  }, [verifyCode, verifyCouponByCode]);

  // 코드 복사
  const handleCopyCode = useCallback(async (code: string) => {
    await Clipboard.setStringAsync(code);
    Alert.alert('복사 완료', '비밀 코드가 클립보드에 복사되었습니다.');
  }, []);

  // 뒤로가기
  const goBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // 쿠폰 선택
  const handleSelectCoupon = useCallback((coupon: Coupon) => {
    setSelectedCoupon(coupon);
    setShowCouponModal(true);
  }, []);

  // 날짜 포맷
  const formatDate = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  }, []);

  // 남은 일수 계산
  const getDaysLeft = useCallback((expiresAt: number) => {
    const now = Date.now();
    const diff = expiresAt - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return Math.max(0, days); // 음수 방지 (만료된 쿠폰)
  }, []);

  // 진행률 계산
  const progressPercent = useMemo(() => {
    return Math.min((balance / POINTS_PER_COUPON) * 100, 100);
  }, [balance, POINTS_PER_COUPON]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#0f172a' : '#ffffff' }]}>
        {/* 헤더 */}
        <View style={[styles.header, { backgroundColor: isDark ? '#1e293b' : '#ffffff', borderBottomColor: isDark ? '#334155' : '#e5e7eb' }]}>
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: isDark ? '#f8fafc' : '#0f172a' }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>쿠폰</Text>
          <View style={styles.headerSpacer} />
        </View>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={isDark ? '#a78bfa' : '#ec4899'} />
          <Text style={[styles.loadingText, { color: isDark ? '#94a3b8' : '#64748b' }]}>
            로딩 중...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#0f172a' : '#ffffff' }]}>
      {/* 헤더 */}
      <View style={[styles.header, { backgroundColor: isDark ? '#1e293b' : '#ffffff', borderBottomColor: isDark ? '#334155' : '#e5e7eb' }]}>
        <TouchableOpacity onPress={goBack} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: isDark ? '#f8fafc' : '#0f172a' }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
          포인트 & 쿠폰
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: Math.max(20, insets.bottom) }}
        showsVerticalScrollIndicator={false}
      >
        {/* 포인트 현황 카드 */}
        <View style={[styles.pointCard, { backgroundColor: isDark ? '#1e293b' : '#f9fafb' }]}>
          <Text style={[styles.pointLabel, { color: isDark ? '#94a3b8' : '#64748b' }]}>
            보유 포인트
          </Text>
          <Text style={[styles.pointValue, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
            {balance.toLocaleString()}P
          </Text>
          
          {/* 진행 바 */}
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { backgroundColor: isDark ? '#334155' : '#e5e7eb' }]}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    width: `${progressPercent}%`,
                    backgroundColor: progressPercent >= 100 ? '#10b981' : (isDark ? '#a78bfa' : '#ec4899'),
                  }
                ]} 
              />
            </View>
            <Text style={[styles.progressText, { color: isDark ? '#94a3b8' : '#64748b' }]}>
              {progressPercent >= 100 
                ? '🎉 쿠폰 교환 가능!' 
                : `쿠폰까지 ${pointsNeededForCoupon(balance).toLocaleString()}P 남음`}
            </Text>
          </View>

          {/* 교환 버튼 */}
          <TouchableOpacity
            onPress={handleExchange}
            disabled={isExchanging || !canExchange(balance)}
            style={[
              styles.exchangeButton,
              {
                backgroundColor: canExchange(balance) 
                  ? (isDark ? '#a78bfa' : '#ec4899')
                  : (isDark ? '#334155' : '#e5e7eb'),
              }
            ]}
          >
            {isExchanging ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={[
                styles.exchangeButtonText,
                { color: canExchange(balance) ? '#ffffff' : (isDark ? '#64748b' : '#9ca3af') }
              ]}>
                {canExchange(balance) 
                  ? `${POINTS_PER_COUPON.toLocaleString()}P → 쿠폰 교환`
                  : `${POINTS_PER_COUPON.toLocaleString()}P 필요`}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 광고 시청 섹션 */}
        <View style={[styles.adSection, { backgroundColor: isDark ? '#1e293b' : '#f9fafb' }]}>
          <View style={styles.adHeader}>
            <Text style={[styles.adTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
              📺 광고 시청으로 포인트 적립
            </Text>
            <View style={[styles.adBadge, { backgroundColor: isDark ? '#334155' : '#e5e7eb' }]}>
              <Text style={[styles.adBadgeText, { color: isDark ? '#a78bfa' : '#8b5cf6' }]}>
                {remainingAds}/{maxAds}
              </Text>
            </View>
          </View>
          
          <Text style={[styles.adDescription, { color: isDark ? '#94a3b8' : '#64748b' }]}>
            광고 1회 시청 시 {adRewardPoints}P 적립 • 6시간마다 {maxAds}회 가능
          </Text>
          
          {!canWatchAd && resetTimeDisplay !== '' && (
            <Text style={[styles.adResetText, { color: isDark ? '#f59e0b' : '#d97706' }]}>
              ⏰ 리셋까지: {resetTimeDisplay}
            </Text>
          )}
          
          <TouchableOpacity
            onPress={handleWatchAd}
            disabled={isWatchingAd || !canWatchAd}
            style={[
              styles.adButton,
              {
                backgroundColor: canWatchAd 
                  ? (isDark ? '#10b981' : '#059669')
                  : (isDark ? '#334155' : '#e5e7eb'),
              }
            ]}
          >
            {isWatchingAd ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={[
                styles.adButtonText,
                { color: canWatchAd ? '#ffffff' : (isDark ? '#64748b' : '#9ca3af') }
              ]}>
                {canWatchAd 
                  ? `🎬 광고 보고 ${adRewardPoints}P 받기`
                  : '⏳ 잠시 후 다시 시청 가능'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 통계 */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: isDark ? '#1e293b' : '#f9fafb' }]}>
            <Text style={[styles.statValue, { color: isDark ? '#a78bfa' : '#8b5cf6' }]}>
              {availableCoupons.length}
            </Text>
            <Text style={[styles.statLabel, { color: isDark ? '#94a3b8' : '#64748b' }]}>
              보유 쿠폰
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: isDark ? '#1e293b' : '#f9fafb' }]}>
            <Text style={[styles.statValue, { color: isDark ? '#10b981' : '#059669' }]}>
              {totalExchanged}
            </Text>
            <Text style={[styles.statLabel, { color: isDark ? '#94a3b8' : '#64748b' }]}>
              총 교환
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: isDark ? '#1e293b' : '#f9fafb' }]}>
            <Text style={[styles.statValue, { color: isDark ? '#f472b6' : '#ec4899' }]}>
              {totalUsed}
            </Text>
            <Text style={[styles.statLabel, { color: isDark ? '#94a3b8' : '#64748b' }]}>
              총 사용
            </Text>
          </View>
        </View>

        {/* 🔐 입장권 인증 섹션 */}
        <View style={[styles.section, { backgroundColor: isDark ? '#1e293b' : '#f9fafb' }]}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
            🔐 입장권 인증
          </Text>
          <Text style={[styles.adDescription, { color: isDark ? '#94a3b8' : '#64748b', marginBottom: 12 }]}>
            쿠폰의 비밀 코드를 입력하여 입장권을 인증하세요
          </Text>

          <View style={[styles.verifyInputRow, { borderColor: isDark ? '#334155' : '#e5e7eb' }]}>
            <TextInput
              style={[styles.verifyInput, { color: isDark ? '#f8fafc' : '#0f172a', backgroundColor: isDark ? '#0f172a' : '#ffffff' }]}
              placeholder="XXXX-XXXX-XXXX"
              placeholderTextColor={isDark ? '#4b5563' : '#9ca3af'}
              value={verifyCode}
              onChangeText={setVerifyCode}
              autoCapitalize="characters"
              maxLength={14}
              returnKeyType="done"
              onSubmitEditing={handleVerifyCode}
            />
            <TouchableOpacity
              onPress={handleVerifyCode}
              disabled={isVerifying || !verifyCode.trim()}
              style={[
                styles.verifyButton,
                { backgroundColor: verifyCode.trim() ? (isDark ? '#a78bfa' : '#ec4899') : (isDark ? '#334155' : '#e5e7eb') }
              ]}
            >
              {isVerifying ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={[styles.verifyButtonText, { color: verifyCode.trim() ? '#ffffff' : (isDark ? '#64748b' : '#9ca3af') }]}>
                  인증
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {verifyResult && (
            <View style={[
              styles.verifyResult,
              { backgroundColor: verifyResult.success ? (isDark ? '#064e3b' : '#d1fae5') : (isDark ? '#7f1d1d' : '#fee2e2') }
            ]}>
              <Text style={[
                styles.verifyResultText,
                { color: verifyResult.success ? (isDark ? '#6ee7b7' : '#065f46') : (isDark ? '#fca5a5' : '#991b1b') }
              ]}>
                {verifyResult.message}
              </Text>
            </View>
          )}
        </View>

        {/* 보유 쿠폰 목록 */}
        <View style={[styles.section, { backgroundColor: isDark ? '#1e293b' : '#f9fafb' }]}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
            🎟️ 보유 쿠폰
          </Text>
          
          {availableCoupons.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={[styles.emptyText, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                보유 중인 쿠폰이 없습니다
              </Text>
              <Text style={[styles.emptySubText, { color: isDark ? '#64748b' : '#9ca3af' }]}>
                {POINTS_PER_COUPON.toLocaleString()}P를 모아 쿠폰을 교환하세요!
              </Text>
            </View>
          ) : (
            availableCoupons.map((coupon) => {
              const daysLeft = getDaysLeft(coupon.expiresAt);
              const isExpired = daysLeft <= 0;
              const isExpiringSoon = daysLeft > 0 && daysLeft <= 7;
              
              return (
                <TouchableOpacity
                  key={coupon.id}
                  onPress={() => !isExpired && handleSelectCoupon(coupon)}
                  disabled={isExpired}
                  style={[
                    styles.couponItem,
                    { 
                      backgroundColor: isExpired
                        ? (isDark ? '#1a1a2e' : '#f1f5f9')
                        : (isDark ? '#0f172a' : '#ffffff'),
                      borderColor: isExpired
                        ? (isDark ? '#4b5563' : '#d1d5db')
                        : isExpiringSoon 
                          ? '#f59e0b' 
                          : (isDark ? '#334155' : '#e5e7eb'),
                      opacity: isExpired ? 0.6 : 1,
                    }
                  ]}
                >
                  <View style={styles.couponLeft}>
                    <Text style={styles.couponIcon}>{isExpired ? '🚫' : '🎟️'}</Text>
                  </View>
                  <View style={styles.couponContent}>
                    <View style={styles.couponNameRow}>
                      <Text style={[
                        styles.couponName,
                        { color: isDark ? '#f8fafc' : '#0f172a' },
                        isExpired && { textDecorationLine: 'line-through' },
                      ]}>
                        {coupon.name}
                      </Text>
                      {isExpired && (
                        <View style={styles.expiredBadge}>
                          <Text style={styles.expiredBadgeText}>만료됨</Text>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => handleCopyCode(coupon.secretCode)} activeOpacity={0.7}>
                      <Text style={[styles.couponCode, { color: isDark ? '#a78bfa' : '#8b5cf6' }]}>
                        🔑 {coupon.secretCode}
                      </Text>
                    </TouchableOpacity>
                    <Text style={[styles.couponExpiry, { color: isExpired ? '#ef4444' : isExpiringSoon ? '#f59e0b' : (isDark ? '#94a3b8' : '#64748b') }]}>
                      {isExpired ? '❌ 만료됨' : isExpiringSoon ? `⚠️ ${daysLeft}일 후 만료` : `만료: ${formatDate(coupon.expiresAt)}`}
                    </Text>
                  </View>
                  <View style={styles.couponRight}>
                    <Text style={[styles.couponArrow, { color: isDark ? '#94a3b8' : '#64748b' }]}>›</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* 최근 내역 */}
        {history.length > 0 && (
          <View style={[styles.section, { backgroundColor: isDark ? '#1e293b' : '#f9fafb' }]}>
            <Text style={[styles.sectionTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
              📋 최근 내역
            </Text>
            {history.slice(0, 5).map((item) => (
              <View key={item.id} style={styles.historyItem}>
                <View style={styles.historyLeft}>
                  <Text style={styles.historyIcon}>
                    {item.action === 'exchange' ? '🔄' : item.action === 'use' ? '✅' : '⏰'}
                  </Text>
                  <View>
                    <Text style={[styles.historyText, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
                      {item.action === 'exchange' ? '쿠폰 교환' : item.action === 'use' ? '쿠폰 사용' : '쿠폰 만료'}
                    </Text>
                    <Text style={[styles.historySubText, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                      {item.couponName}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.historyDate, { color: isDark ? '#64748b' : '#9ca3af' }]}>
                  {formatDate(item.timestamp)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* 안내 */}
        <View style={[styles.infoSection, { backgroundColor: isDark ? '#1e293b' : '#f9fafb' }]}>
          <Text style={[styles.infoTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
            💡 포인트 & 쿠폰 안내
          </Text>
          <Text style={[styles.infoText, { color: isDark ? '#94a3b8' : '#64748b' }]}>
            • 광고 1회 시청 시 {adRewardPoints}P 적립{'\n'}
            • 6시간마다 최대 {maxAds}개 광고 시청 가능{'\n'}
            • {POINTS_PER_COUPON.toLocaleString()}P 모으면 쿠폰으로 교환 가능{'\n'}
            • 쿠폰은 발급일로부터 90일간 유효{'\n'}
            • 앱을 삭제하지 않으면 포인트와 쿠폰이 유지됩니다
          </Text>
        </View>
      </ScrollView>

      {/* 쿠폰 상세 모달 */}
      <Modal
        visible={showCouponModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCouponModal(false)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
            {selectedCoupon && (
              <>
                <Text style={styles.modalEmoji}>🎟️</Text>
                <Text style={[styles.modalTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
                  {selectedCoupon.name}
                </Text>
                <Text style={[styles.modalDescription, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                  {selectedCoupon.description}
                </Text>

                {/* 비밀 코드 표시 */}
                <TouchableOpacity
                  onPress={() => handleCopyCode(selectedCoupon.secretCode)}
                  style={[styles.secretCodeBox, { backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e5e7eb' }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.secretCodeLabel, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                    🔑 비밀 코드 (탭하여 복사)
                  </Text>
                  <Text style={[styles.secretCodeText, { color: isDark ? '#a78bfa' : '#8b5cf6' }]}>
                    {selectedCoupon.secretCode}
                  </Text>
                </TouchableOpacity>

                <View style={[styles.modalDivider, { backgroundColor: isDark ? '#334155' : '#e5e7eb' }]} />
                <Text style={[styles.modalInfo, { color: isDark ? '#64748b' : '#9ca3af' }]}>
                  발급일: {formatDate(selectedCoupon.createdAt)}{'\n'}
                  만료일: {formatDate(selectedCoupon.expiresAt)}{'\n'}
                  남은 기간: {getDaysLeft(selectedCoupon.expiresAt)}일
                </Text>
                
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    onPress={() => {
                      setShowCouponModal(false);
                      setSelectedCoupon(null);
                    }}
                    style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#e5e7eb' }]}
                  >
                    <Text style={[styles.modalButtonText, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
                      닫기
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleUseCoupon(selectedCoupon)}
                    style={[styles.modalButton, { backgroundColor: isDark ? '#a78bfa' : '#ec4899' }]}
                  >
                    <Text style={[styles.modalButtonText, { color: '#ffffff' }]}>
                      사용하기
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ==================== 스타일시트 ====================
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
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
  pointCard: {
    margin: SECTION_PADDING,
    padding: SECTION_PADDING,
    borderRadius: 16,
  },
  pointLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  pointValue: {
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 16,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    textAlign: 'center',
  },
  exchangeButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  exchangeButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: SECTION_PADDING,
    marginBottom: SECTION_PADDING,
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  section: {
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
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySubText: {
    fontSize: 14,
  },
  couponItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  couponLeft: {
    marginRight: 12,
  },
  couponIcon: {
    fontSize: 32,
  },
  couponContent: {
    flex: 1,
  },
  couponName: {
    fontSize: 16,
    fontWeight: '600',
  },
  couponNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  expiredBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  expiredBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  couponExpiry: {
    fontSize: 13,
  },
  couponRight: {
    paddingLeft: 8,
  },
  couponArrow: {
    fontSize: 20,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 0,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  historyText: {
    fontSize: 15,
    fontWeight: '600',
  },
  historySubText: {
    fontSize: 13,
    marginTop: 2,
  },
  historyDate: {
    fontSize: 12,
  },
  infoSection: {
    marginHorizontal: SECTION_PADDING,
    marginBottom: SECTION_PADDING,
    padding: SECTION_PADDING,
    borderRadius: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 22,
  },
  // 광고 섹션 스타일
  adSection: {
    marginHorizontal: SECTION_PADDING,
    marginBottom: SECTION_PADDING,
    padding: SECTION_PADDING,
    borderRadius: 12,
  },
  adHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  adTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  adBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  adBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  adDescription: {
    fontSize: 13,
    marginBottom: 8,
  },
  adResetText: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  adButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  adButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SECTION_PADDING,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  modalEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalDivider: {
    width: '100%',
    height: 1,
    marginVertical: 16,
  },
  modalInfo: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  // ==================== 인증 섹션 스타일 ====================
  verifyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verifyInput: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    fontFamily: 'monospace',
  },
  verifyButton: {
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifyButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  verifyResult: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
  },
  verifyResultText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  // ==================== 쿠폰 코드 스타일 ====================
  couponCode: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 1,
    marginTop: 2,
    marginBottom: 2,
  },
  secretCodeBox: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 12,
  },
  secretCodeLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  secretCodeText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 3,
    fontFamily: 'monospace',
  },
});
