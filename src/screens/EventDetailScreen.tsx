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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import useBookmarks from '../hooks/useBookmarks';
import useReminders from '../hooks/useReminders';
import useReviews from '../hooks/useReviews';

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

// 보안: 텍스트 이스케이프 (XSS 방지)
const sanitizeText = (text: string | undefined, maxLen = 500): string => {
  if (!text) return '';
  return String(text).replace(/[\u200B-\u200D\uFEFF]/g, '').slice(0, maxLen);
};

// 보안: 색상 값 검증 (CSS injection 방지)
const sanitizeColor = (color: string | undefined, fallback: string): string => {
  if (!color || typeof color !== 'string') return fallback;
  // #hex 또는 rgb/rgba만 허용
  if (/^#([0-9a-fA-F]{3,8})$/.test(color.trim())) return color.trim();
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*[\d.]+)?\s*\)$/.test(color.trim())) return color.trim();
  return fallback;
};

// 상수: 렌더마다 재생성 방지
const STAR_ARRAY = [1, 2, 3, 4, 5] as const;

// 정원 표시 컴포넌트 (memo로 최적화)
const CapacityBar = memo(({ 
  label, 
  capacity, 
  color, 
  isDark 
}: { 
  label: string; 
  capacity: number; 
  color: string;
  isDark: boolean;
}) => (
  <View style={styles.attendanceItem}>
    <View style={styles.attendanceHeader}>
      <Text style={[styles.attendanceLabel, { color: isDark ? '#e2e8f0' : '#374151' }]}>
        {label}
      </Text>
      <Text style={[styles.attendanceCount, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
        {capacity}명
      </Text>
    </View>
    <View style={[styles.progressBarBg, { backgroundColor: isDark ? '#374151' : '#e5e7eb' }]}>
      <View style={[styles.progressBarFill, { width: '100%', backgroundColor: color }]} />
    </View>
  </View>
));

// 정보 카드 컴포넌트 (memo로 최적화)
const InfoCard = memo(({ 
  title, 
  content, 
  isDark,
  onPress 
}: { 
  title: string; 
  content: string | undefined; 
  isDark: boolean;
  onPress?: () => void;
}) => {
  if (!content) return null;
  
  const Wrapper = onPress ? TouchableOpacity : View;
  const safeContent = sanitizeText(content);
  
  return (
    <Wrapper 
      style={[styles.infoCard, { backgroundColor: isDark ? '#1e293b' : '#f8fafc' }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.infoContent}>
        <Text style={[styles.infoTitle, { color: isDark ? '#94a3b8' : '#64748b' }]}>
          {title}
        </Text>
        <Text 
          style={[styles.infoText, { color: isDark ? '#f8fafc' : '#0f172a' }, onPress && styles.linkText]}
          numberOfLines={2}
        >
          {safeContent}
        </Text>
      </View>
      {onPress && <Text style={styles.arrowIcon}>›</Text>}
    </Wrapper>
  );
});

export default function EventDetailScreen({ navigation, route }: Props) {
  const { event, date } = route.params;
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';

  // 찜/즐겨찾기 & 리마인더
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const { hasReminder, scheduleReminder, cancelReminder } = useReminders();
  const bookmarked = isBookmarked(event.id, date);
  const reminderSet = hasReminder(event.id, date);

  // 체크인 & 후기
  const {
    canCheckIn, isCheckedIn, doCheckIn,
    canWriteReview, hasReview, getReview, submitReview,
  } = useReviews();
  const checkedIn = isCheckedIn(event.id, date);
  const reviewExists = hasReview(event.id, date);
  const existingReview = getReview(event.id, date);
  const showCheckIn = canCheckIn(event.id, date);
  const showWriteReview = canWriteReview(event.id, date);

  // 후기 작성 UI 상태
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [showReviewForm, setShowReviewForm] = useState(false);
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
  
  // 공유하기 — 보내는 기기 기준 스토어 링크 1개만 깔끔하게
  const handleShare = useCallback(async () => {
    const storeLink = Platform.OS === 'ios' ? STORE_LINKS.ios : STORE_LINKS.android;
    
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { url: storeLink }
          : { message: `솔로파티 - 솔로들을 위한 파티 매칭 앱\n${storeLink}`, title: SHARE_CONFIG.title },
        {
          dialogTitle: SHARE_CONFIG.title,
          subject: SHARE_CONFIG.title,
        }
      );
    } catch { /* 공유 취소 무시 */ }
  }, []);
  
  // 참가 신청
  const handleJoin = useCallback(() => {
    if (!safeLink) {
      Alert.alert('알림', '참가 신청 링크가 없습니다.\n주최자에게 문의해주세요.');
      return;
    }
    Alert.alert('참가 신청', '참가 신청 페이지로 이동합니다.', [
      { text: '취소', style: 'cancel' },
      { text: '이동', onPress: handleOpenLink },
    ]);
  }, [safeLink, handleOpenLink]);

  // 뒤로가기 핸들러
  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);

  // 알림 토글 핸들러 (중복 탭 방지)
  const handleToggleReminder = useCallback(async () => {
    if (isProcessing.current) return;
    if (!event.id) {
      Alert.alert('알림', '이벤트 정보가 올바르지 않습니다.');
      return;
    }
    isProcessing.current = true;
    try {
      if (reminderSet) {
        await cancelReminder(event.id, date);
        Alert.alert('알림 해제', '해당 파티 알림이 해제되었습니다.');
      } else {
        const result = await scheduleReminder(event, date);
        Alert.alert(result.success ? '🔔 알림 등록' : '알림', result.message);
      }
    } finally {
      isProcessing.current = false;
    }
  }, [event, date, reminderSet, cancelReminder, scheduleReminder]);

  // 체크인 핸들러 (중복 탭 방지)
  const handleCheckIn = useCallback(async () => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    try {
      const result = await doCheckIn(event, date);
      Alert.alert(result.success ? '✅ 체크인' : '알림', result.message);
    } finally {
      isProcessing.current = false;
    }
  }, [event, date, doCheckIn]);

  // 후기 등록 핸들러 (중복 탭 방지)
  const handleSubmitReview = useCallback(async () => {
    if (isProcessing.current) return;
    if (reviewRating === 0) {
      Alert.alert('알림', '별점을 선택해주세요.');
      return;
    }
    if (reviewComment.trim().length === 0) {
      Alert.alert('알림', '한줄평을 입력해주세요.');
      return;
    }
    isProcessing.current = true;
    try {
      const result = await submitReview(event, date, reviewRating, reviewComment);
      Alert.alert(result.success ? '🎉 후기 등록' : '알림', result.message);
      if (result.success) {
        setShowReviewForm(false);
        setReviewRating(0);
        setReviewComment('');
      }
    } finally {
      isProcessing.current = false;
    }
  }, [event, date, reviewRating, reviewComment, submitReview]);

  // 후기 폼 취소
  const handleCancelReview = useCallback(() => {
    setShowReviewForm(false);
    setReviewRating(0);
    setReviewComment('');
  }, []);

  // 안전한 프로모션 색상 (memoized)
  const safePromoColor = useMemo(
    () => sanitizeColor(event.promotionColor, '#f59e0b'),
    [event.promotionColor]
  );

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0f172a' : '#ffffff' }]}>
      {/* 헤더 */}
      <View style={[styles.header, { backgroundColor: isDark ? '#1e293b' : '#ffffff', paddingTop: insets.top + 10, borderBottomColor: isDark ? '#334155' : '#e5e7eb' }]}>
        {/* 타이틀 - absolute로 정중앙 배치 */}
        <Text style={[styles.headerTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]} numberOfLines={1}>
          파티 상세
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={handleGoBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[styles.backIcon, { color: isDark ? '#f8fafc' : '#0f172a' }]}>‹</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {/* 알림 버튼 */}
          <TouchableOpacity
            style={[styles.shareButton, { backgroundColor: reminderSet ? (isDark ? '#a78bfa' : '#ec4899') : (isDark ? '#374151' : '#f1f5f9') }]}
            onPress={handleToggleReminder}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.shareIcon, { color: reminderSet ? '#ffffff' : (isDark ? '#f8fafc' : '#374151') }]}>
              {reminderSet ? '🔔' : '🔕'}
            </Text>
          </TouchableOpacity>
          {/* 찜 버튼 */}
          <TouchableOpacity
            style={[styles.shareButton, { backgroundColor: bookmarked ? '#ec4899' : (isDark ? '#374151' : '#f1f5f9') }]}
            onPress={() => toggleBookmark(event, date)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.shareIcon, { color: bookmarked ? '#ffffff' : (isDark ? '#f8fafc' : '#374151') }]}>
              {bookmarked ? '♥' : '♡'}
            </Text>
          </TouchableOpacity>
          {/* 공유 버튼 */}
          <TouchableOpacity 
            style={[styles.shareButton, { backgroundColor: isDark ? '#374151' : '#f1f5f9' }]} 
            onPress={handleShare}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.shareIcon, { color: isDark ? '#f8fafc' : '#374151' }]}>공유</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 메인 정보 카드 */}
        <View style={[styles.mainCard, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
          {/* 프로모션 뱃지 */}
          {event.promoted && (
            <View style={styles.promoBadgeRow}>
              <View style={[styles.promoBadge, { backgroundColor: safePromoColor }]}>
                <Text style={styles.promoBadgeText}>
                  {sanitizeText(event.promotionLabel, 20) || 'AD'}
                </Text>
              </View>
              {event.organizer && (
                <Text style={[styles.promoOrganizer, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                  {sanitizeText(event.organizer, 50)}
                </Text>
              )}
            </View>
          )}

          {/* 태그들 */}
          {event.tags && event.tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {event.tags.slice(0, 5).map((tag, index) => (
                <View key={index} style={[styles.tag, { backgroundColor: isDark ? '#374151' : '#fce7f3' }]}>
                  <Text style={[styles.tagText, { color: isDark ? '#f472b6' : '#ec4899' }]}>
                    #{sanitizeText(tag)}
                  </Text>
                </View>
              ))}
            </View>
          )}
          
          {/* 제목 */}
          <Text style={[styles.eventTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]} numberOfLines={2}>
            {sanitizeText(event.title)}
          </Text>
          
          {/* 날짜 & 시간 */}
          <View style={styles.dateTimeRow}>
            <View style={[styles.dateTimeBadge, { backgroundColor: isDark ? '#374151' : '#fce7f3' }]}>
              <Text style={styles.dateTimeIcon}>📅</Text>
              <Text style={[styles.dateTimeText, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
                {formattedDate}
              </Text>
            </View>
            {event.time && (
              <View style={[styles.dateTimeBadge, { backgroundColor: isDark ? '#374151' : '#e0e7ff' }]}>
                <Text style={styles.dateTimeIcon}>⏰</Text>
                <Text style={[styles.dateTimeText, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
                  {sanitizeText(event.time, 30)}
                </Text>
              </View>
            )}
          </View>
          
          {/* 상세 설명 */}
          {(event.detailDescription || event.description) && (
            <Text style={[styles.description, { color: isDark ? '#cbd5e1' : '#475569' }]}>
              {sanitizeText(event.detailDescription || event.description)}
            </Text>
          )}
        </View>
        
        {/* 정원 정보 */}
        <View style={[styles.sectionCard, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
              모집 정원
            </Text>
            {capacityInfo.hasAnyData && (
              <View style={[styles.remainingBadge, { backgroundColor: '#10b981' }]}>
                <Text style={styles.remainingText}>총 {capacityInfo.total}명</Text>
              </View>
            )}
          </View>
          
          {capacityInfo.hasMaleData && (
            <CapacityBar label="남자" capacity={capacityInfo.male} color="#3b82f6" isDark={isDark} />
          )}
          {capacityInfo.hasFemaleData && (
            <CapacityBar label="여자" capacity={capacityInfo.female} color="#ec4899" isDark={isDark} />
          )}
          {!capacityInfo.hasAnyData && (
            <Text style={[styles.noDataText, { color: isDark ? '#94a3b8' : '#64748b' }]}>
              정원 정보가 없습니다
            </Text>
          )}
          
          {/* 참가비 & 연령대 */}
          <View style={styles.additionalInfoRow}>
            {event.price !== undefined && (
              <View style={[styles.additionalInfoItem, { backgroundColor: isDark ? '#374151' : '#f1f5f9' }]}>
                <Text style={styles.additionalInfoIcon}>💰</Text>
                <Text style={[styles.additionalInfoText, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
                  {event.price === 0 ? '무료' : `${event.price.toLocaleString()}원`}
                </Text>
              </View>
            )}
            {event.ageRange && (
              <View style={[styles.additionalInfoItem, { backgroundColor: isDark ? '#374151' : '#f1f5f9' }]}>
                <Text style={styles.additionalInfoIcon}>🎂</Text>
                <Text style={[styles.additionalInfoText, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
                  {sanitizeText(event.ageRange, 20)}세
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* 장소 정보 */}
        <View style={[styles.sectionCard, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#f8fafc' : '#0f172a', marginBottom: 16 }]}>
            장소
          </Text>
          
          <InfoCard 

            title="장소명" 
            content={event.venue || event.location} 
            isDark={isDark}
          />
          <InfoCard 

            title="주소" 
            content={event.address} 
            isDark={isDark}
            onPress={event.address ? handleOpenMap : undefined}
          />
          <InfoCard 

            title="지역" 
            content={event.region} 
            isDark={isDark}
          />
          
          
        </View>
        
        {/* 주최자 정보 */}
        {/* {(event.organizer || event.contact) && (
          <View style={[styles.sectionCard, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
            <Text style={[styles.sectionTitle, { color: isDark ? '#f8fafc' : '#0f172a', marginBottom: 16 }]}>
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
            style={[styles.linkCard, { backgroundColor: isDark ? '#1e293b' : '#fce7f3' }]}
            onPress={handleOpenLink}
          >
            <View style={styles.linkContent}>
              <Text style={styles.linkIcon}>🔗</Text>
              <View>
                <Text style={[styles.linkTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
                  상세 정보 & 신청 페이지
                </Text>
                <Text style={[styles.linkUrl, { color: isDark ? '#94a3b8' : '#64748b' }]} numberOfLines={1}>
                  {sanitizeText(event.link, 100)}
                </Text>
              </View>
            </View>
            <Text style={[styles.linkArrow, { color: isDark ? '#f472b6' : '#ec4899' }]}>→</Text>
          </TouchableOpacity>
        )}

        {/* ==================== 체크인 & 후기 섹션 ==================== */}
        <View style={[styles.sectionCard, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#f8fafc' : '#0f172a', marginBottom: 16 }]}>
            📝 참가 후기
          </Text>

          {/* 체크인 버튼 (당일만 노출) */}
          {showCheckIn && (
            <View style={styles.reviewItemWrap}>
              <TouchableOpacity
                style={[styles.checkinBtn, { backgroundColor: isDark ? '#a78bfa' : '#ec4899' }]}
                onPress={handleCheckIn}
                activeOpacity={0.7}
              >
                <Text style={styles.checkinBtnIcon}>📍</Text>
                <Text style={styles.checkinBtnText}>파티 체크인하기</Text>
              </TouchableOpacity>
              <Text style={[styles.checkinHint, { color: isDark ? '#64748b' : '#94a3b8' }]}>
                {event.coordinates ? '⏰ 시간대 + 📍 위치(2km) 인증' : '⏰ 시간대 인증'}
                {'\n'}파티 시작 2시간 전부터 종료 3시간 후까지 가능
              </Text>
            </View>
          )}

          {/* 체크인 완료 상태 */}
          {checkedIn && !reviewExists && !showReviewForm && (
            <View style={styles.reviewItemWrap}>
              <View style={[styles.checkinDoneBadge, { backgroundColor: isDark ? '#374151' : '#f0fdf4' }]}>
                <Text style={styles.checkinDoneIcon}>✅</Text>
                <Text style={[styles.checkinDoneText, { color: isDark ? '#86efac' : '#16a34a' }]}>
                  체크인 완료
                </Text>
              </View>
              {showWriteReview && (
                <TouchableOpacity
                  style={[styles.writeReviewBtn, { backgroundColor: isDark ? '#374151' : '#fce7f3' }]}
                  onPress={() => setShowReviewForm(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.writeReviewIcon}>✏️</Text>
                  <Text style={[styles.writeReviewText, { color: isDark ? '#f8fafc' : '#ec4899' }]}>
                    후기 작성하기
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* 후기 작성 폼 */}
          {showReviewForm && (
            <View style={styles.reviewItemWrap}>
              <Text style={[styles.starLabel, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                별점을 선택해주세요
              </Text>
              <View style={styles.starRow}>
                {STAR_ARRAY.map((star) => (
                  <TouchableOpacity key={star} onPress={() => setReviewRating(star)}>
                    <Text style={[styles.starLarge, { opacity: star <= reviewRating ? 1 : 0.3 }]}>⭐</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={[styles.reviewInput, {
                  backgroundColor: isDark ? '#374151' : '#f1f5f9',
                  color: isDark ? '#f8fafc' : '#0f172a',
                }]}
                placeholder="한줄평을 남겨주세요 (최대 100자)"
                placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
                value={reviewComment}
                onChangeText={(t) => setReviewComment(t.slice(0, 100))}
                maxLength={100}
                returnKeyType="done"
              />

              <View style={styles.reviewBtnRow}>
                <TouchableOpacity
                  style={[styles.reviewCancelBtn, { backgroundColor: isDark ? '#374151' : '#e5e7eb' }]}
                  onPress={handleCancelReview}
                >
                  <Text style={[styles.reviewCancelText, { color: isDark ? '#f8fafc' : '#374151' }]}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reviewSubmitBtn, {
                    backgroundColor: reviewRating > 0 && reviewComment.trim().length > 0
                      ? (isDark ? '#a78bfa' : '#ec4899')
                      : (isDark ? '#374151' : '#e5e7eb'),
                  }]}
                  onPress={handleSubmitReview}
                >
                  <Text style={[styles.reviewSubmitText, {
                    color: reviewRating > 0 && reviewComment.trim().length > 0 ? '#ffffff' : (isDark ? '#64748b' : '#94a3b8'),
                  }]}>
                    등록하기
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 작성된 후기 표시 */}
          {reviewExists && existingReview && (
            <View style={[styles.existingReview, { backgroundColor: isDark ? '#374151' : '#fefce8' }]}>
              <View style={styles.starRowSmall}>
                {STAR_ARRAY.map((star) => (
                  <Text key={star} style={[styles.starSmall, { opacity: star <= existingReview.rating ? 1 : 0.3 }]}>
                    ⭐
                  </Text>
                ))}
              </View>
              <Text style={[styles.existingReviewComment, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
                {sanitizeText(existingReview.comment, 200)}
              </Text>
              <Text style={[styles.existingReviewMeta, { color: isDark ? '#64748b' : '#94a3b8' }]}>
                내가 작성한 후기
              </Text>
            </View>
          )}

          {/* 체크인 안내 (체크인 전 + 당일 아닌 경우) */}
          {!checkedIn && !showCheckIn && (
            <View style={styles.checkinGuide}>
              <Text style={[styles.checkinGuideText, { color: isDark ? '#64748b' : '#94a3b8' }]}>
                파티 당일에 체크인하면{'\n'}후기를 작성할 수 있습니다
              </Text>
            </View>
          )}
        </View>

      </ScrollView>
       
      
      {/* 하단 참가 버튼 */}
      <View style={[styles.bottomBar, { backgroundColor: isDark ? '#1e293b' : '#ffffff', paddingBottom: insets.bottom + 16, borderTopColor: isDark ? '#334155' : '#e5e7eb' }]}>
        <View style={styles.bottomInfo}>
          <Text style={[styles.bottomLabel, { color: isDark ? '#94a3b8' : '#64748b' }]}>참가비</Text>
          <Text style={[styles.bottomPrice, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
            {event.price === 0 ? '무료' : event.price ? `${event.price.toLocaleString()}원` : '문의'}
          </Text>
        </View>
        <TouchableOpacity style={[styles.joinButton, { backgroundColor: isDark ? '#a78bfa' : '#ec4899' }]} onPress={handleJoin}>
          <Text style={styles.joinButtonText}>참가 신청하기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    padding: 8,
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
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
  },
  mainCard: {
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
  },
  eventTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 16,
    lineHeight: 32,
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
    paddingVertical: 8,
    borderRadius: 12,
    gap: 8,
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
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
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
  },
  remainingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
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
    borderRadius: 12,
    gap: 8,
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
    borderRadius: 12,
    marginBottom: 10,
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
    padding: 20,
    borderRadius: 20,
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
    borderRadius: 14,
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
  // ==================== 체크인 & 후기 스타일 ====================
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
});
