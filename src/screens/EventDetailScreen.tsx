/**
 * 이벤트 상세 화면 - 최적화 버전
 */

import React, { useMemo, useCallback, memo, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  Share,
  Platform,
  TextInput,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import useBookmarks from '../hooks/useBookmarks';
import useReminders from '../hooks/useReminders';
import useReviews from '../hooks/useReviews';
import { useShareInterstitialAd } from '../services/AdService';
import AdOverlay from '../components/AdOverlay';
import { HostProfileModal } from '../components/HostProfileModal';
import { useToast } from '../contexts/ToastContext';
import { hapticLight, hapticSuccess, hapticError, hapticSelection } from '../utils/haptics';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'EventDetail'>;
  route: RouteProp<RootStackParamList, 'EventDetail'>;
};

// ==================== 상수 ====================
const STORE_LINKS = {
  ios: 'https://apps.apple.com/us/app/%EC%86%94%EB%A1%9C%ED%8C%8C%ED%8B%B0/id6757147307',
  android: 'https://play.google.com/store/apps/details?id=com.soloparty.dating',
} as const;

const SHARE_CONFIG = {
  title: '솔로파티',
} as const;

// 보안: URL 검증 함수 (프로토콜 + 도메인 검증)
const isValidUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  // javascript:, data:, vbscript:, file: 등 위험한 프로토콜 차단
  if (/^(javascript|data|vbscript|file|ftp):/i.test(trimmed)) return false;
  // http/https만 허용
  return /^https?:\/\/.+/i.test(trimmed);
};

// 보안: 텍스트 이스케이프 (XSS 방지) — 공유 유틸에서 가져오기
import { sanitizeText, sanitizeColor } from '../utils/sanitize';

// 보안: 색상 값 검증 — 공유 유틸로 이전됨

// 상수: 렌더마다 재생성 방지
const STAR_ARRAY = [1, 2, 3, 4, 5] as const;
const EMPTY_REVIEWS: any[] = []; // 빈 리뷰 배열 불변 참조

// 정원 표시 컴포넌트 (memo로 최적화)
const CapacityBar = memo(({ 
  label,
  icon,
  capacity, 
  color, 
  isDark 
}: { 
  label: string;
  icon: string;
  capacity: number; 
  color: string;
  isDark: boolean;
}) => (
  <View style={[styles.attendanceItem, { flexDirection: 'row', alignItems: 'center' }]}>
    <Text style={{ fontSize: 20, marginRight: 10 }}>{icon}</Text>
    <Text style={[styles.attendanceLabel, { color: isDark ? '#c0c0d0' : '#374151', flex: 1 }]}>
      {label}
    </Text>
    <Text style={[styles.attendanceCount, { color: color, fontWeight: '700' }]}>
      {capacity}명
    </Text>
  </View>
));

// 정보 카드 컴포넌트 (memo로 최적화)
const InfoCard = memo(({ 
  title, 
  content, 
  isDark,
  onPress,
  numberOfLines: numLines = 2,
}: { 
  title: string; 
  content: string | undefined; 
  isDark: boolean;
  onPress?: () => void;
  numberOfLines?: number;
}) => {
  if (!content) return null;
  
  const Wrapper = onPress ? TouchableOpacity : View;
  
  return (
    <Wrapper 
      style={[styles.infoCard, { backgroundColor: isDark ? '#141422' : '#f8fafc', borderColor: isDark ? '#2a2a44' : 'transparent' }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.infoContent}>
        <Text style={[styles.infoTitle, { color: isDark ? '#8888a0' : '#64748b' }]}>
          {title}
        </Text>
        <Text 
          style={[styles.infoText, { color: isDark ? '#eaeaf2' : '#0f172a' }, onPress && styles.linkText]}
          numberOfLines={numLines}
        >
          {content}
        </Text>
      </View>
      {onPress && <Text style={styles.arrowIcon}>›</Text>}
    </Wrapper>
  );
});

// ==================== 리뷰 폼 컴포넌트 (분리 — 상위 리렌더 방지) ====================
interface ReviewFormProps {
  isDark: boolean;
  onSubmit: (rating: number, comment: string) => void;
  onCancel: () => void;
}
const ReviewForm = memo(function ReviewForm({ isDark, onSubmit, onCancel }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const handleSubmit = useCallback(() => {
    onSubmit(rating, comment);
  }, [onSubmit, rating, comment]);

  const handleRating = useCallback((star: number) => {
    hapticSelection();
    setRating(star);
  }, []);

  const handleComment = useCallback((t: string) => {
    setComment(t.slice(0, 100));
  }, []);

  const isReady = rating > 0 && comment.trim().length > 0;

  return (
    <View style={styles.reviewItemWrap}>
      <Text style={[styles.starLabel, { color: isDark ? '#8888a0' : '#64748b' }]}>
        별점을 선택해주세요
      </Text>
      <View style={styles.starRow}>
        {STAR_ARRAY.map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => handleRating(star)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            style={rfStyles.starBtn}
            accessibilityLabel={`별점 ${star}점`}
            accessibilityRole="button"
          >
            <Text style={[styles.starLarge, { opacity: star <= rating ? 1 : 0.3 }]}>⭐</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={[styles.reviewInput, {
          backgroundColor: isDark ? '#1e1e32' : '#f1f5f9',
          color: isDark ? '#eaeaf2' : '#0f172a',
        }]}
        placeholder="한줄평을 남겨주세요 (최대 100자)"
        placeholderTextColor={isDark ? '#5c5c74' : '#94a3b8'}
        value={comment}
        onChangeText={handleComment}
        maxLength={100}
        returnKeyType="done"
      />

      <View style={styles.reviewBtnRow}>
        <TouchableOpacity
          style={[styles.reviewCancelBtn, { backgroundColor: isDark ? '#1e1e32' : '#e5e7eb' }]}
          onPress={onCancel}
        >
          <Text style={[styles.reviewCancelText, { color: isDark ? '#eaeaf2' : '#374151' }]}>취소</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.reviewSubmitBtn, {
            backgroundColor: isReady
              ? (isDark ? '#a78bfa' : '#ec4899')
              : (isDark ? '#1e1e32' : '#e5e7eb'),
          }]}
          onPress={handleSubmit}
        >
          <Text style={[styles.reviewSubmitText, {
            color: isReady ? '#ffffff' : (isDark ? '#5c5c74' : '#94a3b8'),
          }]}>
            등록하기
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});
const rfStyles = StyleSheet.create({
  starBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
});

export default function EventDetailScreen({ navigation, route }: Props) {
  // route.params 안전 검증 (잘못된 네비게이션 파라미터로 인한 크래시 방지)
  if (!route.params?.event || !route.params?.date) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 16, color: '#666', textAlign: 'center' }}>이벤트 정보를 불러올 수 없습니다.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#ec4899', borderRadius: 8 }}>
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }
  const { event: routeEvent, date } = route.params;
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';
  const scrollViewRef = useRef<ScrollView>(null);

  // 지점 선택 (subEvents가 있으면 지점 탭 표시)
  const hasSubEvents = routeEvent.subEvents && routeEvent.subEvents.length > 1;
  const [selectedBranchIdx, setSelectedBranchIdx] = useState(0);
  const safeIdx = hasSubEvents ? Math.min(selectedBranchIdx, routeEvent.subEvents!.length - 1) : 0;
  const event = hasSubEvents ? routeEvent.subEvents![safeIdx] : routeEvent;

  // 찜/즐겨찾기 & 리마인더
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const { hasReminder, scheduleReminder, cancelReminder } = useReminders();
  const { isShowing: isAdShowing, skipCountdown, canSkip, showAfterShare, dismiss: dismissAd } = useShareInterstitialAd();
  const { showToast } = useToast();
  const bookmarked = isBookmarked(event.id, date);
  const reminderSet = hasReminder(event.id, date);

  // 예약 & 체크인 & 후기
  const {
    canReserve, isReserved, doReserve, cancelReservation,
    canCheckIn, isCheckedIn, doCheckIn,
    canWriteReview, hasReview, getReview, submitReview,
    getReviewsByOrganizer,
  } = useReviews();
  const reserved = isReserved(event.id, date);
  const showReserve = canReserve(event.id, date);
  const checkedIn = isCheckedIn(event.id, date);
  const reviewExists = hasReview(event.id, date);
  const existingReview = getReview(event.id, date);
  const showCheckIn = canCheckIn(event.id, date);
  const showWriteReview = canWriteReview(event.id, date);

  // 후기 작성 UI 상태
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [showHostProfile, setShowHostProfile] = useState(false);
  const isProcessing = useRef(false); // 중복 탭 방지
  
  // 날짜 포맷팅 (memoized) - UTC 오프셋 방지를 위해 로컬 파싱
  const formattedDate = useMemo(() => {
    const parts = date.split('-');
    if (parts.length !== 3) return '날짜 미정';
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(y, m, day);
    if (isNaN(d.getTime())) return '날짜 미정';
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
  }, [date]);
  
  // 정원 정보 (memoized)
  const capacityInfo = useMemo(() => {
    const maleVal = event.maleCapacity;
    const femaleVal = event.femaleCapacity;
    const hasMale = typeof maleVal === 'number';
    const hasFemale = typeof femaleVal === 'number';
    const male = hasMale ? maleVal : 0;
    const female = hasFemale ? femaleVal : 0;
    
    return {
      male,
      female,
      hasMaleData: hasMale,
      hasFemaleData: hasFemale,
      hasAnyData: hasMale || hasFemale,
      total: male + female,
    };
  }, [event.maleCapacity, event.femaleCapacity]);

  // 테마 의존 색상 캐싱 (isDark 변경 시에만 재계산)
  const themeColors = useMemo(() => ({
    bg: isDark ? '#0c0c16' : '#ffffff',
    headerBg: isDark ? '#141422' : '#ffffff',
    headerBorder: isDark ? '#2a2a44' : '#e5e7eb',
    text: isDark ? '#eaeaf2' : '#0f172a',
    subText: isDark ? '#a0a0b8' : '#64748b',
    bodyText: isDark ? '#c0c0d0' : '#374151',
    cardBg: isDark ? '#141422' : '#ffffff',
    accent: isDark ? '#a78bfa' : '#ec4899',
    inactiveBg: isDark ? '#1e1e32' : '#f1f5f9',
    inactiveBorder: isDark ? '#2a2a44' : '#e5e7eb',
    buttonBg: isDark ? '#1e1e32' : '#f1f5f9',
    tagBg: isDark ? '#1e1e32' : '#fce7f3',
    tagText: isDark ? '#f472b6' : '#ec4899',
  }), [isDark]);
  
  // 안전한 URL 생성 (memoized) - http/https만 허용
  const safeLink = useMemo(() => {
    if (!event.link || !isValidUrl(event.link)) {
      // http가 없는 경우 https 추가 후 재검증
      if (event.link && !event.link.startsWith('http')) {
        const withHttps = `https://${event.link.trim()}`;
        return isValidUrl(withHttps) ? withHttps : null;
      }
      return null;
    }
    return event.link.trim();
  }, [event.link]);
  
  // 링크 열기 (보안 강화)
  const handleOpenLink = useCallback(async () => {
    if (!safeLink) {
      Alert.alert('알림', '유효하지 않은 링크입니다.');
      return;
    }
    
    try {
      const canOpen = await Linking.canOpenURL(safeLink);
      if (canOpen) {
        await Linking.openURL(safeLink);
      } else {
        Alert.alert('알림', '링크를 열 수 없습니다.');
      }
    } catch {
      Alert.alert('알림', '링크를 열 수 없습니다.');
    }
  }, [safeLink]);
  
  // 지도 앱 열기 (address 우선)
  const handleOpenMap = useCallback(async () => {
    // address가 있으면 address로 검색, 없으면 venue 또는 location으로 검색
    const query = event.address || event.venue || event.location;
    if (!query) {
      Alert.alert('알림', '지도 검색에 필요한 주소 정보가 없습니다.');
      return;
    }
    
    const encoded = encodeURIComponent(query);
    const mapUrls = Platform.OS === 'ios'
      ? [`nmap://search?query=${encoded}`, `kakaomap://search?q=${encoded}`]
      : [`nmap://search?query=${encoded}&appname=com.soloparty`, `kakaomap://search?q=${encoded}`, `geo:0,0?q=${encoded}`];
    
    // 네이티브 지도 앱 시도
    for (const url of mapUrls) {
      try {
        if (await Linking.canOpenURL(url)) {
          await Linking.openURL(url);
          return;
        }
      } catch {}
    }
    
    // 모든 네이티브 앱 실패 시 웹 네이버 지도
    try {
      await Linking.openURL(`https://map.naver.com/v5/search/${encoded}`);
    } catch { /* 웹 지도 오픈 실패 무시 */ }
  }, [event.address, event.venue, event.location]);
  
  // 공유하기 — 보내는 기기 기준 스토어 링크 1개만 깔끔하게 + 토스트/햅틱
  const handleShare = useCallback(async () => {
    const storeLink = Platform.OS === 'ios' ? STORE_LINKS.ios : STORE_LINKS.android;
    
    try {
      const result = await Share.share(
        Platform.OS === 'ios'
          ? { url: storeLink }
          : { message: `솔로파티 - 솔로들을 위한 파티 매칭 앱\n${storeLink}`, title: SHARE_CONFIG.title },
        {
          dialogTitle: SHARE_CONFIG.title,
          subject: SHARE_CONFIG.title,
        }
      );
      // 공유 완료 후 광고 표시 (15초 후 건너뛰기 가능)
      if (result.action === Share.sharedAction) {
        hapticSuccess();
        showToast({ message: '공유 완료!', type: 'success', icon: '🎉' });
        showAfterShare();
      }
    } catch { /* 공유 취소 무시 */ }
  }, [showAfterShare, showToast]);
  
  // 참가 신청
  const handleJoin = useCallback(() => {
    if (!safeLink) {
      Alert.alert('알림', '참가 신청 링크가 없습니다.\n주최자에게 문의해주세요.');
      return;
    }
    handleOpenLink();
  }, [safeLink, handleOpenLink]);

  // 찜 토글 핸들러 (Alert 없이 즉시 처리 + 토스트/햅틱)
  const handleToggleBookmark = useCallback(async () => {
    await toggleBookmark(event, date);
    hapticLight();
    if (bookmarked) {
      showToast({ message: '찜 목록에서 제거했어요', type: 'info', icon: '💔' });
    } else {
      showToast({ message: '찜 목록에 추가했어요', type: 'success', icon: '❤️' });
    }
  }, [event, date, bookmarked, toggleBookmark, showToast]);

  // 뒤로가기 핸들러
  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);

  // 알림 토글 핸들러 (중복 탭 방지 + 토스트/햅틱)
  const handleToggleReminder = useCallback(async () => {
    if (isProcessing.current) return;
    if (!event.id) {
      showToast({ message: '이벤트 정보가 올바르지 않아요', type: 'error' });
      return;
    }
    isProcessing.current = true;
    try {
      if (reminderSet) {
        await cancelReminder(event.id, date);
        hapticLight();
        showToast({ message: '알림이 해제되었어요', type: 'info', icon: '🔕' });
      } else {
        const result = await scheduleReminder(event, date);
        if (result.success) {
          hapticSuccess();
          showToast({ message: '알림이 설정되었어요', type: 'success', icon: '🔔' });
        } else {
          hapticError();
          showToast({ message: result.message, type: 'error' });
        }
      }
    } finally {
      isProcessing.current = false;
    }
  }, [event, date, reminderSet, cancelReminder, scheduleReminder, showToast]);

  // 참가 예약 핸들러
  const handleReserve = useCallback(async () => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    try {
      const result = await doReserve(event, date);
      if (result.success) {
        hapticSuccess();
        showToast({ message: '참가 예약이 완료되었어요!', type: 'success', icon: '🎫' });
      } else {
        showToast({ message: result.message, type: 'warning' });
      }
    } finally {
      isProcessing.current = false;
    }
  }, [event, date, doReserve, showToast]);

  // 예약 취소 핸들러
  const handleCancelReservation = useCallback(() => {
    Alert.alert(
      '예약 취소',
      '참가 예약을 취소하시겠습니까?',
      [
        { text: '아니요', style: 'cancel' },
        {
          text: '취소하기',
          style: 'destructive',
          onPress: async () => {
            const result = await cancelReservation(event.id, date);
            Alert.alert(result.success ? '알림' : '오류', result.message);
          },
        },
      ],
    );
  }, [event.id, date, cancelReservation]);

  // 체크인 핸들러 (중복 탭 방지 + 토스트/햅틱)
  const handleCheckIn = useCallback(async () => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    try {
      const result = await doCheckIn(event, date);
      if (result.success) {
        hapticSuccess();
        showToast({ message: '체크인 완료!', type: 'success', icon: '✅' });
      } else {
        hapticError();
        showToast({ message: result.message, type: 'error' });
      }
    } finally {
      isProcessing.current = false;
    }
  }, [event, date, doCheckIn, showToast]);

  // 후기 등록 핸들러 (ReviewForm에서 rating/comment 전달받음)
  const handleSubmitReview = useCallback(async (reviewRating: number, reviewComment: string) => {
    if (isProcessing.current) return;
    if (reviewRating === 0) {
      showToast({ message: '별점을 선택해주세요', type: 'warning', icon: '⭐' });
      return;
    }
    if (reviewComment.trim().length === 0) {
      showToast({ message: '한줄평을 입력해주세요', type: 'warning', icon: '✏️' });
      return;
    }
    isProcessing.current = true;
    try {
      const result = await submitReview(event, date, reviewRating, reviewComment);
      if (result.success) {
        hapticSuccess();
        showToast({ message: '후기가 등록되었어요!', type: 'success', icon: '🎉' });
        setShowReviewForm(false);
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      } else {
        hapticError();
        showToast({ message: result.message, type: 'error' });
      }
    } finally {
      isProcessing.current = false;
    }
  }, [event, date, submitReview, showToast]);

  // 후기 폼 취소
  const handleCancelReview = useCallback(() => {
    setShowReviewForm(false);
    Keyboard.dismiss();
  }, []);

  // 안전한 프로모션 색상 (memoized)
  const safePromoColor = useMemo(
    () => sanitizeColor(event.promotionColor, '#f59e0b'),
    [event.promotionColor]
  );

  // 사전 sanitize (InfoCard 내부 렌더에서 매번 호출 방지)
  const sanitized = useMemo(() => ({
    venue: event.venue || event.location ? sanitizeText((event.venue || event.location)!) : undefined,
    address: event.address ? sanitizeText(event.address) : undefined,
    region: event.region ? sanitizeText(event.region) : undefined,
    description: event.detailDescription || event.description ? sanitizeText((event.detailDescription || event.description)!) : undefined,
    organizer: event.organizer ? sanitizeText(event.organizer, 50) : undefined,
    contact: event.contact ? sanitizeText(event.contact) : undefined,
  }), [event.venue, event.location, event.address, event.region, event.detailDescription, event.description, event.organizer, event.contact]);

  // 주최자 리뷰 (memoized)
  // 주최자 리뷰 (memoized) — deps 최소화: organizer만 의존
  const organizerReviews = useMemo(
    () => event.organizer ? getReviewsByOrganizer(event.organizer) : EMPTY_REVIEWS,
    [event.organizer, getReviewsByOrganizer]
  );

  // 주최자 프로필 열기
  const handleOpenHostProfile = useCallback(() => {
    if (event.organizer) setShowHostProfile(true);
  }, [event.organizer]);

  const handleCloseHostProfile = useCallback(() => {
    setShowHostProfile(false);
  }, []);

  // 헤더 버튼 색상 메모이제이션
  const headerColors = useMemo(() => ({
    containerBg: isDark ? '#0c0c16' : '#ffffff',
    headerBg: isDark ? '#141422' : '#ffffff',
    headerBorder: isDark ? '#2a2a44' : '#e5e7eb',
    titleColor: isDark ? '#eaeaf2' : '#0f172a',
    reminderBg: reminderSet ? (isDark ? '#a78bfa' : '#ec4899') : (isDark ? '#1e1e32' : '#f1f5f9'),
    reminderIcon: reminderSet ? '#ffffff' : (isDark ? '#eaeaf2' : '#374151'),
    bookmarkBg: bookmarked ? '#ec4899' : (isDark ? '#1e1e32' : '#f1f5f9'),
    bookmarkIcon: bookmarked ? '#ffffff' : (isDark ? '#eaeaf2' : '#374151'),
    shareBg: isDark ? '#1e1e32' : '#f1f5f9',
    shareIcon: isDark ? '#eaeaf2' : '#374151',
  }), [isDark, reminderSet, bookmarked]);

  return (
    <View style={[styles.container, { backgroundColor: headerColors.containerBg }]}>
      {/* 헤더 */}
      <View style={[styles.header, { backgroundColor: headerColors.headerBg, paddingTop: insets.top + 10, borderBottomColor: headerColors.headerBorder }]}>
        {/* 타이틀 - absolute로 정중앙 배치 */}
        <Text style={[styles.headerTitle, { color: headerColors.titleColor }]} numberOfLines={1}>
          {sanitizeText(event.title, 20)}
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={handleGoBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="뒤로 가기" accessibilityRole="button">
          <Text style={[styles.backIcon, { color: headerColors.titleColor }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {/* 알림 버튼 */}
          <TouchableOpacity
            style={[styles.shareButton, { backgroundColor: headerColors.reminderBg }]}
            onPress={handleToggleReminder}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={reminderSet ? '알림 해제' : '알림 등록'}
            accessibilityRole="button"
          >
            <Text style={[styles.shareIcon, { color: headerColors.reminderIcon }]}>
              {reminderSet ? '🔔' : '🔕'}
            </Text>
          </TouchableOpacity>
          {/* 찜 버튼 */}
          <TouchableOpacity
            style={[styles.shareButton, { backgroundColor: headerColors.bookmarkBg }]}
            onPress={handleToggleBookmark}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={bookmarked ? '찜 해제' : '찜'}
            accessibilityRole="button"
          >
            <Text style={[styles.shareIcon, { color: headerColors.bookmarkIcon }]}>
              {bookmarked ? '♥' : '♡'}
            </Text>
          </TouchableOpacity>
          {/* 공유 버튼 */}
          <TouchableOpacity 
            style={[styles.shareButton, { backgroundColor: headerColors.shareBg }]} 
            onPress={handleShare}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="공유"
            accessibilityRole="button"
          >
            <Text style={[styles.shareIcon, { color: headerColors.shareIcon }]}>공유</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 지점 선택 탭 (subEvents가 2개 이상일 때만 표시) */}
        {hasSubEvents && (
          <View style={[styles.branchTabContainer, { backgroundColor: themeColors.cardBg }]}>
            <Text style={[styles.branchTabTitle, { color: themeColors.subText }]}>
              지점 선택
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.branchTabScroll}>
              {routeEvent.subEvents!.map((sub, idx) => {
                const isActive = idx === selectedBranchIdx;
                return (
                  <TouchableOpacity
                    key={sub.id || idx}
                    style={[
                      styles.branchTab,
                      { 
                        backgroundColor: isActive 
                          ? themeColors.accent
                          : themeColors.inactiveBg,
                        borderColor: isActive
                          ? themeColors.accent
                          : themeColors.inactiveBorder,
                      },
                    ]}
                    onPress={() => { setSelectedBranchIdx(idx); scrollViewRef.current?.scrollTo({ y: 0, animated: true }); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.branchTabText,
                      { color: isActive ? '#ffffff' : themeColors.bodyText },
                    ]}>
                      {sanitizeText(sub.location || sub.venue || `지점 ${idx + 1}`, 20)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* 메인 정보 카드 */}
        <View style={[styles.mainCard, { backgroundColor: isDark ? '#141422' : '#ffffff', borderWidth: isDark ? 1 : 0, borderColor: '#2a2a44' }]}>
          {/* 프로모션 뱃지 */}
          {event.promoted && (
            <View style={styles.promoBadgeRow}>
              <View style={[styles.promoBadge, { backgroundColor: safePromoColor }]}>
                <Text style={styles.promoBadgeText}>
                  {sanitizeText(event.promotionLabel, 20) || 'AD'}
                </Text>
              </View>
              {event.organizer && (
                <TouchableOpacity onPress={handleOpenHostProfile} activeOpacity={0.6}>
                  <Text style={[styles.promoOrganizer, { color: isDark ? '#a78bfa' : '#ec4899', textDecorationLine: 'underline' }]}>
                    {sanitizeText(event.organizer, 50)}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* 태그들 */}
          {event.tags && event.tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {event.tags.slice(0, 5).map((tag, index) => (
                <View key={index} style={[styles.tag, { backgroundColor: themeColors.tagBg }]}>
                  <Text style={[styles.tagText, { color: themeColors.tagText }]}>
                    #{sanitizeText(tag)}
                  </Text>
                </View>
              ))}
            </View>
          )}
          
          {/* 제목 */}
          <Text style={[styles.eventTitle, { color: isDark ? '#eaeaf2' : '#0f172a' }]} numberOfLines={2}>
            {sanitizeText(event.title)}
          </Text>
          
          {/* 날짜 & 시간 */}
          <View style={styles.dateTimeRow}>
            <View style={[styles.dateTimeBadge, { backgroundColor: isDark ? '#1e1e32' : '#fce7f3', borderColor: isDark ? '#2a2a44' : 'transparent' }]}>
              <Text style={styles.dateTimeIcon}>📅</Text>
              <Text style={[styles.dateTimeText, { color: isDark ? '#eaeaf2' : '#0f172a' }]}>
                {formattedDate}
              </Text>
            </View>
            {event.time && (
              <View style={[styles.dateTimeBadge, { backgroundColor: isDark ? '#1e1e32' : '#e0e7ff', borderColor: isDark ? '#2a2a44' : 'transparent' }]}>
                <Text style={styles.dateTimeIcon}>⏰</Text>
                <Text style={[styles.dateTimeText, { color: isDark ? '#eaeaf2' : '#0f172a' }]}>
                  {sanitizeText(event.time, 30)}
                </Text>
              </View>
            )}
          </View>
          
          {/* 상세 설명 */}
          {sanitized.description && (
            <Text style={[styles.description, { color: isDark ? '#a0a0b8' : '#475569' }]}>
              {sanitized.description}
            </Text>
          )}
        </View>
        
        {/* 정원 정보 */}
        <View style={[styles.sectionCard, { backgroundColor: isDark ? '#141422' : '#ffffff', borderWidth: isDark ? 1 : 0, borderColor: '#2a2a44' }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: isDark ? '#eaeaf2' : '#0f172a' }]}>
              모집 정원
            </Text>
            {capacityInfo.hasAnyData && (
              <View style={[styles.remainingBadge, { backgroundColor: '#10b981' }]}>
                <Text style={styles.remainingText}>총 {capacityInfo.total}명</Text>
              </View>
            )}
          </View>
          
          {capacityInfo.hasMaleData && (
            <CapacityBar label="남성" icon="👨" capacity={capacityInfo.male} color="#3b82f6" isDark={isDark} />
          )}
          {capacityInfo.hasFemaleData && (
            <CapacityBar label="여성" icon="👩" capacity={capacityInfo.female} color="#ec4899" isDark={isDark} />
          )}
          {!capacityInfo.hasAnyData && (
            <Text style={[styles.noDataText, { color: isDark ? '#8888a0' : '#64748b' }]}>
              정원 정보가 없습니다
            </Text>
          )}
          
          {/* 참가비 & 연령대 */}
          <View style={styles.additionalInfoRow}>
            {event.price !== undefined && (
              <View style={[styles.additionalInfoItem, { backgroundColor: isDark ? '#1e1e32' : '#f1f5f9', borderColor: isDark ? '#2a2a44' : 'transparent' }]}>
                <Text style={styles.additionalInfoIcon}>💰</Text>
                <Text style={[styles.additionalInfoText, { color: isDark ? '#eaeaf2' : '#0f172a' }]}>
                  {event.price === 0 ? '무료' : `${event.price.toLocaleString()}원`}
                </Text>
              </View>
            )}
            {event.ageRange && (
              <View style={[styles.additionalInfoItem, { backgroundColor: isDark ? '#1e1e32' : '#f1f5f9', borderColor: isDark ? '#2a2a44' : 'transparent' }]}>
                <Text style={styles.additionalInfoIcon}>🎂</Text>
                <Text style={[styles.additionalInfoText, { color: isDark ? '#eaeaf2' : '#0f172a' }]}>
                  {sanitizeText(event.ageRange, 20)}세
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* 장소 정보 */}
        <View style={[styles.sectionCard, { backgroundColor: isDark ? '#141422' : '#ffffff', borderWidth: isDark ? 1 : 0, borderColor: '#2a2a44' }]}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#eaeaf2' : '#0f172a', marginBottom: 16 }]}>
            장소
          </Text>
          
          <InfoCard 

            title="장소명" 
            content={sanitized.venue} 
            isDark={isDark}
          />
          <InfoCard 

            title="주소" 
            content={sanitized.address} 
            isDark={isDark}
            numberOfLines={4}
            onPress={event.address ? handleOpenMap : undefined}
          />
          <InfoCard 

            title="지역" 
            content={sanitized.region} 
            isDark={isDark}
          />
          
          
        </View>
        
        {/* 주최자 정보 */}
        {event.organizer && (
          <TouchableOpacity
            style={[styles.organizerCard, { backgroundColor: isDark ? '#141422' : '#ffffff' }]}
            onPress={handleOpenHostProfile}
            activeOpacity={0.7}
          >
            {/* 상단: 아바타 + 이름 + 화살표 */}
            <View style={styles.organizerRow}>
              <View style={[styles.organizerAvatarRing, { borderColor: isDark ? '#a78bfa' : '#ec4899' }]}>
                <View style={[styles.organizerAvatar, { backgroundColor: isDark ? '#a78bfa' : '#ec4899' }]}>
                  <Text style={styles.organizerAvatarText}>
                    {event.organizer.charAt(0).toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={styles.organizerInfo}>
                <View style={styles.organizerNameRow}>
                  <Text style={[styles.organizerName, { color: isDark ? '#eaeaf2' : '#0f172a' }]}>
                    {sanitizeText(event.organizer, 50)}
                  </Text>
                  <View style={[styles.organizerBadge, { backgroundColor: isDark ? '#241840' : '#fce7f3' }]}>
                    <Text style={[styles.organizerBadgeText, { color: isDark ? '#a78bfa' : '#ec4899' }]}>주최자</Text>
                  </View>
                </View>
                {organizerReviews.length > 0 ? (
                  <View style={styles.organizerMeta}>
                    <Text style={[styles.organizerStarText, { color: isDark ? '#fbbf24' : '#f59e0b' }]}>
                      ★ {(organizerReviews.reduce((s, r) => s + r.rating, 0) / organizerReviews.length).toFixed(1)}
                    </Text>
                    <Text style={[styles.organizerDot, { color: isDark ? '#2a2a44' : '#cbd5e1' }]}>·</Text>
                    <Text style={[styles.organizerSub, { color: isDark ? '#8888a0' : '#64748b' }]}>
                      리뷰 {organizerReviews.length}개
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.organizerSub, { color: isDark ? '#5c5c74' : '#94a3b8' }]}>
                    프로필 보기
                  </Text>
                )}
              </View>
              <View style={[styles.organizerArrowWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                <Text style={[styles.organizerArrow, { color: isDark ? '#5c5c74' : '#94a3b8' }]}>›</Text>
              </View>
            </View>

            {/* 별점 미니 바 (리뷰 있을 때만) */}
            {organizerReviews.length > 0 && (
              <View style={[styles.organizerRatingBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)' }]}>
                <View style={styles.organizerRatingBarInner}>
                  <View
                    style={[
                      styles.organizerRatingBarFill,
                      {
                        width: `${(organizerReviews.reduce((s, r) => s + r.rating, 0) / organizerReviews.length / 5) * 100}%`,
                        backgroundColor: isDark ? '#a78bfa' : '#ec4899',
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.organizerRatingLabel, { color: isDark ? '#5c5c74' : '#94a3b8' }]}>
                  {(organizerReviews.reduce((s, r) => s + r.rating, 0) / organizerReviews.length / 5 * 100).toFixed(0)}%
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* 주최자 정보 */}
        {/* {(event.organizer || event.contact) && (
          <View style={[styles.sectionCard, { backgroundColor: isDark ? '#141422' : '#ffffff' }]}>
            <Text style={[styles.sectionTitle, { color: isDark ? '#eaeaf2' : '#0f172a', marginBottom: 16 }]}>
              👤 주최자 정보
            </Text>
            
            <InfoCard 
   
              title="주최" 
              content={event.organizer} 
              isDark={isDark}
            />
            <InfoCard 

              title="연락처" 
              content={event.contact} 
              isDark={isDark}
            />
          </View>
        )} */}
        
        {/* 링크 */}
        {event.link && (
          <TouchableOpacity 
            style={[styles.linkCard, { backgroundColor: isDark ? '#141422' : '#fce7f3' }]}
            onPress={handleOpenLink}
          >
            <View style={styles.linkContent}>
              <Text style={styles.linkIcon}>🔗</Text>
              <View>
                <Text style={[styles.linkTitle, { color: isDark ? '#eaeaf2' : '#0f172a' }]}>
                  상세 정보 & 신청 페이지
                </Text>
                <Text style={[styles.linkUrl, { color: isDark ? '#8888a0' : '#64748b' }]} numberOfLines={1}>
                  {sanitizeText(event.link, 100)}
                </Text>
              </View>
            </View>
            <Text style={[styles.linkArrow, { color: isDark ? '#f472b6' : '#ec4899' }]}>→</Text>
          </TouchableOpacity>
        )}

        {/* ==================== 예약 & 체크인 & 후기 섹션 ==================== */}
        <View style={[styles.sectionCard, { backgroundColor: isDark ? '#141422' : '#ffffff', borderWidth: isDark ? 1 : 0, borderColor: '#2a2a44' }]}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#eaeaf2' : '#0f172a', marginBottom: 16 }]}>
            📝 참가 후기
          </Text>

          {/* 3단계 프로그레스: 예약 → 체크인 → 후기 */}
          <View style={styles.progressRow}>
            <View style={styles.progressStep}>
              <View style={[styles.progressDot, { backgroundColor: reserved || checkedIn ? (isDark ? '#86efac' : '#16a34a') : (isDark ? '#2a2a44' : '#cbd5e1') }]}>
                <Text style={styles.progressDotText}>{reserved || checkedIn ? '✓' : '1'}</Text>
              </View>
              <Text style={[styles.progressLabel, { color: isDark ? '#8888a0' : '#64748b' }]}>예약</Text>
            </View>
            <View style={[styles.progressLine, { backgroundColor: reserved || checkedIn ? (isDark ? '#86efac' : '#16a34a') : (isDark ? '#2a2a44' : '#cbd5e1') }]} />
            <View style={styles.progressStep}>
              <View style={[styles.progressDot, { backgroundColor: checkedIn ? (isDark ? '#86efac' : '#16a34a') : (isDark ? '#2a2a44' : '#cbd5e1') }]}>
                <Text style={styles.progressDotText}>{checkedIn ? '✓' : '2'}</Text>
              </View>
              <Text style={[styles.progressLabel, { color: isDark ? '#8888a0' : '#64748b' }]}>체크인</Text>
            </View>
            <View style={[styles.progressLine, { backgroundColor: reviewExists ? (isDark ? '#86efac' : '#16a34a') : (isDark ? '#2a2a44' : '#cbd5e1') }]} />
            <View style={styles.progressStep}>
              <View style={[styles.progressDot, { backgroundColor: reviewExists ? (isDark ? '#86efac' : '#16a34a') : (isDark ? '#2a2a44' : '#cbd5e1') }]}>
                <Text style={styles.progressDotText}>{reviewExists ? '✓' : '3'}</Text>
              </View>
              <Text style={[styles.progressLabel, { color: isDark ? '#8888a0' : '#64748b' }]}>후기</Text>
            </View>
          </View>

          {/* STEP 1: 참가 예약 버튼 (미예약 + 미체크인) */}
          {showReserve && !checkedIn && (
            <View style={styles.reviewItemWrap}>
              <TouchableOpacity
                style={[styles.checkinBtn, { backgroundColor: isDark ? '#6366f1' : '#8b5cf6' }]}
                onPress={handleReserve}
                activeOpacity={0.7}
              >
                <Text style={styles.checkinBtnIcon}>🎫</Text>
                <Text style={styles.checkinBtnText}>참가 예약하기</Text>
              </TouchableOpacity>
              <Text style={[styles.checkinHint, { color: isDark ? '#5c5c74' : '#94a3b8' }]}>
                예약 후 파티 당일에 체크인할 수 있습니다
              </Text>
            </View>
          )}

          {/* 예약 완료 상태 (체크인 전) */}
          {reserved && !checkedIn && !showCheckIn && (
            <View style={styles.reviewItemWrap}>
              <View style={[styles.checkinDoneBadge, { backgroundColor: isDark ? '#1e1e32' : '#eef2ff' }]}>
                <Text style={styles.checkinDoneIcon}>🎫</Text>
                <Text style={[styles.checkinDoneText, { color: isDark ? '#a5b4fc' : '#6366f1' }]}>
                  예약 완료 · 파티 당일에 체크인해주세요
                </Text>
              </View>
              <TouchableOpacity onPress={handleCancelReservation} activeOpacity={0.7}>
                <Text style={[styles.cancelReservationText, { color: isDark ? '#5c5c74' : '#94a3b8' }]}>
                  예약 취소
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 2: 체크인 버튼 (예약 완료 + 당일) */}
          {showCheckIn && (
            <View style={styles.reviewItemWrap}>
              <View style={[styles.checkinDoneBadge, { backgroundColor: isDark ? '#1e1e32' : '#eef2ff', marginBottom: 8 }]}>
                <Text style={styles.checkinDoneIcon}>🎫</Text>
                <Text style={[styles.checkinDoneText, { color: isDark ? '#a5b4fc' : '#6366f1' }]}>
                  예약 확인됨
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.checkinBtn, { backgroundColor: isDark ? '#a78bfa' : '#ec4899' }]}
                onPress={handleCheckIn}
                activeOpacity={0.7}
              >
                <Text style={styles.checkinBtnIcon}>📍</Text>
                <Text style={styles.checkinBtnText}>파티 체크인하기</Text>
              </TouchableOpacity>
              <Text style={[styles.checkinHint, { color: isDark ? '#5c5c74' : '#94a3b8' }]}>
                {event.coordinates ? '📍 위치 인증(500m) 필수 + ⏰ 시간 인증' : '⏰ 시간대 인증'}
                {'\n'}파티 시작 1시간 전 ~ 종료 1시간 후 | 하루 최대 3회
              </Text>
            </View>
          )}

          {/* 체크인 완료 상태 → STEP 3: 후기 작성 */}
          {checkedIn && !reviewExists && !showReviewForm && (
            <View style={styles.reviewItemWrap}>
              <View style={[styles.checkinDoneBadge, { backgroundColor: isDark ? '#1e1e32' : '#f0fdf4' }]}>
                <Text style={styles.checkinDoneIcon}>✅</Text>
                <Text style={[styles.checkinDoneText, { color: isDark ? '#86efac' : '#16a34a' }]}>
                  체크인 완료
                </Text>
              </View>
              {showWriteReview && (
                <TouchableOpacity
                  style={[styles.writeReviewBtn, { backgroundColor: isDark ? '#1e1e32' : '#fce7f3' }]}
                  onPress={() => { Keyboard.dismiss(); setShowReviewForm(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.writeReviewIcon}>✏️</Text>
                  <Text style={[styles.writeReviewText, { color: isDark ? '#eaeaf2' : '#ec4899' }]}>
                    후기 작성하기
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* 후기 작성 폼 */}
          {showReviewForm && (
            <ReviewForm
              isDark={isDark}
              onSubmit={handleSubmitReview}
              onCancel={handleCancelReview}
            />
          )}

          {/* 작성된 후기 표시 */}
          {reviewExists && existingReview && (
            <View style={[styles.existingReview, { backgroundColor: isDark ? '#1e1e32' : '#fefce8' }]}>
              <View style={styles.starRowSmall}>
                {STAR_ARRAY.map((star) => (
                  <Text key={star} style={[styles.starSmall, { opacity: star <= existingReview.rating ? 1 : 0.3 }]}>
                    ⭐
                  </Text>
                ))}
              </View>
              <Text style={[styles.existingReviewComment, { color: isDark ? '#eaeaf2' : '#0f172a' }]}>
                {sanitizeText(existingReview.comment, 200)}
              </Text>
              <Text style={[styles.existingReviewMeta, { color: isDark ? '#5c5c74' : '#94a3b8' }]}>
                내가 작성한 후기
              </Text>
            </View>
          )}

          {/* 안내 (예약도 체크인도 안 한 상태 + 예약 불가 = 이미 지남) */}
          {!checkedIn && !showCheckIn && !showReserve && !reserved && (
            <View style={styles.checkinGuide}>
              <Text style={[styles.checkinGuideText, { color: isDark ? '#5c5c74' : '#94a3b8' }]}>
                참가 예약 → 당일 체크인 → 후기 작성{'\n'}3단계를 완료하면 후기를 남길 수 있습니다
              </Text>
            </View>
          )}
        </View>

      </ScrollView>
       
      
      {/* 하단 참가 버튼 */}
      <View style={[styles.bottomBar, { backgroundColor: isDark ? '#141422' : '#ffffff', paddingBottom: insets.bottom + 16, borderTopColor: isDark ? '#2a2a44' : '#e5e7eb' }]}>
        <View style={styles.bottomInfo}>
          <Text style={[styles.bottomLabel, { color: isDark ? '#8888a0' : '#64748b' }]}>참가비</Text>
          <Text style={[styles.bottomPrice, { color: isDark ? '#eaeaf2' : '#0f172a' }]}>
            {event.price === 0 ? '무료' : event.price ? `${event.price.toLocaleString()}원` : '문의'}
          </Text>
        </View>
        <TouchableOpacity style={[styles.joinButton, { backgroundColor: isDark ? '#a78bfa' : '#ec4899' }]} onPress={handleJoin} accessibilityLabel="참가 신청하기" accessibilityRole="button">
          <Text style={styles.joinButtonText}>참가 신청하기</Text>
        </TouchableOpacity>
      </View>

      {/* 공유 후 광고 오버레이 (15초 후 건너뛰기 가능) */}
      <AdOverlay
        visible={isAdShowing}
        isDark={isDark}
        skipCountdown={skipCountdown}
        canSkip={canSkip}
        onDismiss={dismissAd}
      />

      {/* 주최자 프로필 모달 */}
      {event.organizer && (
        <HostProfileModal
          visible={showHostProfile}
          organizer={event.organizer}
          contact={event.contact}
          reviews={organizerReviews}
          isDark={isDark}
          onClose={handleCloseHostProfile}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // 지점 선택 탭
  branchTabContainer: {
    marginTop: -8,
    marginBottom: -8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  branchTabTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  branchTabScroll: {
    flexDirection: 'row',
  },
  branchTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
  },
  branchTabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backButton: {
    padding: 12,
  },
  backIcon: {
    fontSize: 24,
    fontWeight: '600',
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    zIndex: -1,
  },
  shareButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  shareIcon: {
    fontSize: 13,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
  },
  mainCard: {
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  tag: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 24,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  eventTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 18,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  dateTimeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  dateTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dateTimeIcon: {
    fontSize: 16,
  },
  dateTimeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
    marginTop: 8,
  },
  sectionCard: {
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  remainingBadge: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 24,
  },
  remainingText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  attendanceItem: {
    marginBottom: 16,
  },
  attendanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  attendanceLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  attendanceCount: {
    fontSize: 14,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  additionalInfoRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  additionalInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  additionalInfoIcon: {
    fontSize: 16,
  },
  additionalInfoText: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 12,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 15,
    fontWeight: '600',
  },
  linkText: {
    textDecorationLine: 'underline',
  },
  arrowIcon: {
    fontSize: 24,
    color: '#94a3b8',
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 22,
    borderRadius: 24,
  },
  linkContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
  },
  linkIcon: {
    fontSize: 24,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  linkUrl: {
    fontSize: 13,
    maxWidth: 200,
  },
  linkArrow: {
    fontSize: 24,
    fontWeight: '700',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  bottomInfo: {
    marginRight: 16,
  },
  bottomLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  bottomPrice: {
    fontSize: 20,
    fontWeight: '800',
  },
  joinButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  joinButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  noDataText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  // ==================== 프로모션 스타일 ====================
  promoBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  promoBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  promoBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  promoOrganizer: {
    fontSize: 12,
  },
  // ==================== 예약 & 체크인 & 후기 스타일 ====================
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  progressStep: {
    alignItems: 'center',
    gap: 4,
  },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressDotText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  progressLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 4,
    marginBottom: 18,
  },
  cancelReservationText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  reviewItemWrap: {
    marginBottom: 12,
  },
  checkinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  checkinBtnIcon: {
    fontSize: 18,
  },
  checkinBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  checkinHint: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
  checkinDoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  checkinDoneIcon: {
    fontSize: 16,
  },
  checkinDoneText: {
    fontSize: 14,
    fontWeight: '600',
  },
  writeReviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  writeReviewIcon: {
    fontSize: 14,
  },
  writeReviewText: {
    fontSize: 14,
    fontWeight: '700',
  },
  starLabel: {
    fontSize: 13,
    marginBottom: 8,
  },
  starRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  starLarge: {
    fontSize: 28,
  },
  starRowSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 4,
  },
  starSmall: {
    fontSize: 16,
  },
  reviewInput: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  reviewBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  reviewCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  reviewCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  reviewSubmitBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  reviewSubmitText: {
    fontSize: 14,
    fontWeight: '700',
  },
  existingReview: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 4,
  },
  existingReviewComment: {
    fontSize: 15,
    lineHeight: 22,
  },
  existingReviewMeta: {
    fontSize: 11,
    marginTop: 8,
  },
  checkinGuide: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  checkinGuideText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  // ==================== 주최자 프로필 카드 스타일 ====================
  organizerCard: {
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  organizerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  organizerAvatarRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  organizerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  organizerAvatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
  },
  organizerInfo: {
    flex: 1,
  },
  organizerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  organizerName: {
    fontSize: 16,
    fontWeight: '700',
  },
  organizerBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  organizerBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  organizerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  organizerDot: {
    fontSize: 12,
    fontWeight: '700',
  },
  organizerSub: {
    fontSize: 13,
  },
  organizerStarText: {
    fontSize: 14,
    fontWeight: '700',
  },
  organizerArrowWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  organizerArrow: {
    fontSize: 22,
    fontWeight: '600',
  },
  organizerRatingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  organizerRatingBarInner: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  organizerRatingBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  organizerRatingLabel: {
    fontSize: 12,
    fontWeight: '600',
    width: 34,
    textAlign: 'right',
  },
});
