/**
 * 이벤트 상세 화면 - 최적화 버전
 */

import React, { useMemo, useCallback, memo } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useTheme } from '../contexts/ThemeContext';
// [광고 비활성화] 나중에 활성화 시 아래 주석 해제
// import InFeedAdBanner from '../components/InFeedAdBanner';

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
const sanitizeText = (text: string | undefined): string => {
  if (!text) return '';
  return String(text).slice(0, 500); // 길이 제한
};

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
      <View style={[styles.progressBarFill, { width: '100%', backgroundColor: color, opacity: 0.6 }]} />
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
  
  // 날짜 포맷팅 (memoized)
  const formattedDate = useMemo(() => {
    const d = new Date(date);
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
    Linking.openURL(`https://map.naver.com/v5/search/${encoded}`);
  }, [event.address, event.venue, event.location]);
  
  // 공유하기 (플랫폼별 스토어 링크)
  const handleShare = useCallback(async () => {
    const storeLink = Platform.OS === 'ios' ? STORE_LINKS.ios : STORE_LINKS.android;
    
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { url: storeLink }
          : { message: storeLink, title: SHARE_CONFIG.title },
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

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0f172a' : '#ffffff' }]}>
      {/* 헤더 */}
      <View style={[styles.header, { backgroundColor: isDark ? '#1e293b' : '#ffffff', paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backButton} onPress={handleGoBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[styles.backIcon, { color: isDark ? '#f8fafc' : '#0f172a' }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]} numberOfLines={1}>
          파티 상세
        </Text>
        <TouchableOpacity 
          style={[styles.shareButton, { backgroundColor: isDark ? '#374151' : '#f1f5f9' }]} 
          onPress={handleShare}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={[styles.shareIcon, { color: isDark ? '#f8fafc' : '#374151' }]}>공유</Text>
        </TouchableOpacity>
      </View>
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
      >
        {/* 메인 정보 카드 */}
        <View style={[styles.mainCard, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
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
                  {event.time}
                </Text>
              </View>
            )}
          </View>
          
          {/* 상세 설명 */}
          {(event.detailDescription || event.description) && (
            <Text style={[styles.description, { color: isDark ? '#cbd5e1' : '#475569' }]}>
              {event.detailDescription || event.description}
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
                  {event.ageRange}세
                </Text>
              </View>
            )}
          </View>
        </View>
          {/* [광고 비활성화] 나중에 활성화 시 아래 주석 해제
        <InFeedAdBanner index={0} isDark={isDark} />
          */}
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
                  {event.link}
                </Text>
              </View>
            </View>
            <Text style={[styles.linkArrow, { color: isDark ? '#f472b6' : '#ec4899' }]}>→</Text>
          </TouchableOpacity>
        )}
 {/* [광고 비활성화] 나중에 활성화 시 아래 주석 해제
        <InFeedAdBanner index={1} isDark={isDark} />
 */}
      </ScrollView>
       
      
      {/* 하단 참가 버튼 */}
      <View style={[styles.bottomBar, { backgroundColor: isDark ? '#1e293b' : '#ffffff', paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.bottomInfo}>
          <Text style={[styles.bottomLabel, { color: isDark ? '#94a3b8' : '#64748b' }]}>참가비</Text>
          <Text style={[styles.bottomPrice, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
            {event.price === 0 ? '무료' : event.price ? `${event.price.toLocaleString()}원` : '문의'}
          </Text>
        </View>
        <TouchableOpacity style={[styles.joinButton, { backgroundColor: '#ec4899' }]} onPress={handleJoin}>
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
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
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
  infoIcon: {
    fontSize: 20,
    marginRight: 14,
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
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    marginTop: 8,
    gap: 8,
  },
  mapButtonIcon: {
    fontSize: 18,
  },
  mapButtonText: {
    fontSize: 15,
    fontWeight: '700',
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
});
