/**
 * 파티 주최자 프로필 모달 (Premium Design)
 *
 * 주최자 이름, 연락처, 평균 별점, 리뷰 목록을 표시합니다.
 * 서버 없이 로컬 리뷰 데이터만 사용합니다.
 *
 * 디자인 시스템(Colors, Radius, Shadows)을 활용하여
 * 앱 전체와 일관된 프리미엄 UI를 제공합니다.
 */

import React, { memo, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  FlatList,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sanitizeText } from '../utils/sanitize';
import type { EventReview } from '../hooks/useReviews';

// ==================== 상수 ====================
const STAR_ARRAY = [1, 2, 3, 4, 5] as const;
const AVATAR_SIZE = 76;
const MAX_VISIBLE_REVIEWS = 50;

// ==================== 디자인 토큰 (앱 디자인 시스템 기반) ====================
interface ThemeTokens {
  bg: string;
  surface: string;
  surfaceElevated: string;
  heroBg: string;
  heroAccent: string;
  border: string;
  text: string;
  textSec: string;
  textTer: string;
  accent: string;
  accentSoft: string;
  star: string;
  starBg: string;
  barFill: string;
  barBg: string;
  reviewBg: string;
  reviewBorder: string;
  tagBg: string;
  tagText: string;
  shadow: string;
  handle: string;
}

const DT: { light: ThemeTokens; dark: ThemeTokens } = {
  // 라이트
  light: {
    bg: '#ffffff',
    surface: '#f8fafc',
    surfaceElevated: '#ffffff',
    heroBg: '#fdf2f8',            // 핑크 틴트
    heroAccent: '#fce7f3',
    border: '#f1f5f9',
    text: '#0f172a',
    textSec: '#64748b',
    textTer: '#94a3b8',
    accent: '#ec4899',
    accentSoft: '#fce7f3',
    star: '#f59e0b',
    starBg: '#fef3c7',
    barFill: '#ec4899',
    barBg: '#f1f5f9',
    reviewBg: '#fafafa',
    reviewBorder: '#f1f5f9',
    tagBg: '#f1f5f9',
    tagText: '#475569',
    shadow: '#64748b',
    handle: '#cbd5e1',
  },
  // 다크
  dark: {
    bg: '#0f172a',
    surface: '#1e293b',
    surfaceElevated: '#1e293b',
    heroBg: '#1e1b2e',            // 보라 틴트
    heroAccent: '#2e1f4d',
    border: '#334155',
    text: '#f8fafc',
    textSec: '#94a3b8',
    textTer: '#64748b',
    accent: '#a78bfa',
    accentSoft: '#2e1f4d',
    star: '#fbbf24',
    starBg: 'rgba(251,191,36,0.12)',
    barFill: '#a78bfa',
    barBg: '#334155',
    reviewBg: '#162032',
    reviewBorder: '#1e293b',
    tagBg: '#334155',
    tagText: '#94a3b8',
    shadow: '#000000',
    handle: '#475569',
  },
};

const getTheme = (isDark: boolean): ThemeTokens => isDark ? DT.dark : DT.light;

// ==================== 타입 ====================
interface HostProfileModalProps {
  readonly visible: boolean;
  readonly organizer: string;
  readonly contact?: string;
  readonly reviews: EventReview[];
  readonly isDark: boolean;
  readonly onClose: () => void;
}

// ==================== 별점 텍스트 (반복 렌더링 최적화) ====================
const StarRow = memo<{ rating: number; size?: number }>(({ rating, size = 13 }) => (
  <View style={styles.starRowInline}>
    {STAR_ARRAY.map((s) => (
      <Text key={s} style={{ fontSize: size, opacity: s <= rating ? 1 : 0.2 }}>
        ★
      </Text>
    ))}
  </View>
));

// ==================== 평점 분포 바 ====================
const RatingDistBar = memo<{
  star: number;
  count: number;
  maxCount: number;
  t: ThemeTokens;
}>(({ star, count, maxCount, t }) => {
  const ratio = maxCount > 0 ? count / maxCount : 0;
  return (
    <View style={styles.distRow}>
      <Text style={[styles.distLabel, { color: t.textSec }]}>{star}</Text>
      <View style={[styles.distBarBg, { backgroundColor: t.barBg }]}>
        <View
          style={[
            styles.distBarFill,
            {
              width: `${Math.max(ratio * 100, count > 0 ? 4 : 0)}%`,
              backgroundColor: t.barFill,
            },
          ]}
        />
      </View>
      <Text style={[styles.distCount, { color: t.textTer }]}>{count}</Text>
    </View>
  );
});

// ==================== 리뷰 카드 ====================
const ReviewCard = memo<{ review: EventReview; t: ThemeTokens }>(({ review, t }) => {
  const dateStr = useMemo(() => {
    const d = new Date(review.createdAt);
    if (isNaN(d.getTime())) return '';
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return `${d.getFullYear()}.${month < 10 ? '0' : ''}${month}.${day < 10 ? '0' : ''}${day}`;
  }, [review.createdAt]);

  return (
    <View style={[styles.reviewCard, { backgroundColor: t.reviewBg, borderColor: t.reviewBorder }]}>
      {/* 상단: 별점 + 날짜 */}
      <View style={styles.reviewTop}>
        <View style={styles.reviewRatingPill}>
          <Text style={[styles.reviewRatingIcon, { color: t.star }]}>★</Text>
          <Text style={[styles.reviewRatingNum, { color: t.text }]}>{review.rating}.0</Text>
        </View>
        <Text style={[styles.reviewDateText, { color: t.textTer }]}>{dateStr}</Text>
      </View>
      {/* 파티 이름 태그 */}
      <View style={[styles.reviewTag, { backgroundColor: t.accentSoft }]}>
        <Text style={[styles.reviewTagText, { color: t.accent }]} numberOfLines={1}>
          🎉 {sanitizeText(review.eventTitle, 40)}
        </Text>
      </View>
      {/* 코멘트 */}
      <Text style={[styles.reviewBody, { color: t.text }]}>
        {sanitizeText(review.comment, 200)}
      </Text>
    </View>
  );
});

// ==================== 통계 카드 (아이콘 + 숫자 + 라벨) ====================
const StatCard = memo<{
  icon: string;
  value: string;
  label: string;
  t: ThemeTokens;
  highlight?: boolean;
}>(({ icon, value, label, t, highlight }) => (
  <View style={[styles.statCard, { backgroundColor: highlight ? t.accentSoft : t.surface }]}>
    <Text style={styles.statIcon}>{icon}</Text>
    <Text style={[styles.statValue, { color: highlight ? t.accent : t.text }]}>{value}</Text>
    <Text style={[styles.statLabel, { color: t.textSec }]}>{label}</Text>
  </View>
));

// ==================== 메인 컴포넌트 ====================
export const HostProfileModal = memo<HostProfileModalProps>(
  ({ visible, organizer, contact, reviews, isDark, onClose }) => {
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = Dimensions.get('window');
    const sheetMaxHeight = windowHeight * 0.92;
    const t = getTheme(isDark);

    // ---- 통계 ----
    const stats = useMemo(() => {
      if (reviews.length === 0) {
        return { avg: 0, total: 0, distribution: [0, 0, 0, 0, 0], maxDist: 0 };
      }
      const total = reviews.length;
      const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
      const avg = sum / total;

      const distribution = [0, 0, 0, 0, 0];
      reviews.forEach((r) => {
        const idx = Math.max(0, Math.min(4, r.rating - 1));
        distribution[idx]++;
      });
      const maxDist = Math.max(...distribution);

      return { avg, total, distribution, maxDist };
    }, [reviews]);

    // 고유 파티 수
    const partyCount = useMemo(() => {
      return new Set(reviews.map((r) => r.eventId)).size;
    }, [reviews]);

    // 평균 별점 텍스트
    const avgText = stats.total > 0 ? stats.avg.toFixed(1) : '-';

    // 닫기 핸들러
    const handleClose = useCallback(() => onClose(), [onClose]);

    return (
      <Modal
        visible={visible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={handleClose}
      >
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={[styles.overlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.45)' }]}>
            {/* 시트 영역 — 이 안을 터치해도 이벤트 전파 차단 */}
            <TouchableWithoutFeedback onPress={() => {}}>
              <View
                style={[
                  styles.sheet,
                  {
                    maxHeight: sheetMaxHeight,
                    backgroundColor: t.bg,
                    paddingBottom: insets.bottom + 20,
                    ...Platform.select({
                      ios: { shadowColor: t.shadow, shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 20 },
                      android: { elevation: 24 },
                    }),
                  },
                ]}
              >
                {/* 닫기 버튼 (우상단) */}
                <TouchableOpacity
                  style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' }]}
                  onPress={handleClose}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.closeBtnText, { color: t.textSec }]}>✕</Text>
                </TouchableOpacity>

                {/* ============ 히어로 섹션 ============ */}
                <View style={[styles.hero, { backgroundColor: t.heroBg }]}>
                  {/* 아바타 링 */}
                  <View style={[styles.avatarRing, { borderColor: t.accent }]}>
                    <View style={[styles.avatar, { backgroundColor: t.accent }]}>
                      <Text style={styles.avatarLetter}>
                        {organizer.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {/* 이름 */}
                  <Text style={[styles.heroName, { color: t.text }]}>
                    {sanitizeText(organizer, 50)}
                  </Text>

                  {/* 연락처 */}
                  {contact && (
                    <View style={[styles.contactPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                      <Text style={[styles.contactIcon]}>📞</Text>
                      <Text style={[styles.contactVal, { color: t.textSec }]}>
                        {sanitizeText(contact, 50)}
                      </Text>
                    </View>
                  )}

                  {/* 요약 별점 (큰 사이즈) */}
                  {stats.total > 0 && (
                    <View style={styles.heroRating}>
                      <Text style={[styles.heroAvg, { color: t.star }]}>{avgText}</Text>
                      <StarRow rating={Math.round(stats.avg)} size={18} />
                    </View>
                  )}
                </View>

                {/* ============ 통계 카드 행 ============ */}
                <View style={styles.statsRow}>
                  <StatCard icon="⭐" value={avgText} label="평균 별점" t={t} highlight={stats.total > 0} />
                  <StatCard icon="💬" value={stats.total.toString()} label="리뷰" t={t} />
                  <StatCard icon="🎉" value={partyCount > 0 ? partyCount.toString() : '-'} label="파티" t={t} />
                </View>

                {/* ============ 리뷰 목록 (FlatList) ============ */}
                {reviews.length === 0 ? (
                  <View style={[styles.section, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
                    <View style={styles.empty}>
                      <View style={[styles.emptyCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}>
                        <Text style={styles.emptyIcon}>💬</Text>
                      </View>
                      <Text style={[styles.emptyTitle, { color: t.textSec }]}>
                        아직 리뷰가 없습니다
                      </Text>
                      <Text style={[styles.emptySub, { color: t.textTer }]}>
                        파티에 참가하고 첫 리뷰를 남겨보세요!
                      </Text>
                    </View>
                  </View>
                ) : (
                  <FlatList
                    data={reviews.slice(0, MAX_VISIBLE_REVIEWS)}
                    keyExtractor={(item) => `${item.eventId}-${item.date}`}
                    renderItem={({ item }) => <ReviewCard review={item} t={t} />}
                    contentContainerStyle={styles.reviewListContent}
                    showsVerticalScrollIndicator={false}
                    ListHeaderComponent={
                      <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: t.text }]}>참가자 리뷰</Text>
                        <View style={[styles.countBadge, { backgroundColor: t.accentSoft }]}>
                          <Text style={[styles.countBadgeText, { color: t.accent }]}>{stats.total}</Text>
                        </View>
                      </View>
                    }
                    ListFooterComponent={
                      reviews.length > MAX_VISIBLE_REVIEWS ? (
                        <Text style={[styles.moreText, { color: t.textTer }]}>
                          + {reviews.length - MAX_VISIBLE_REVIEWS}개의 리뷰가 더 있습니다
                        </Text>
                      ) : null
                    }
                  />
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  },
);

// ==================== 스타일 ====================
const styles = StyleSheet.create({
  // ---- 오버레이 & 시트 ----
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    // maxHeight는 inline style에서 동적으로 설정
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // ---- 리뷰 목록 ----
  reviewListContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },

  // ---- 히어로 ----
  hero: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  avatarRing: {
    width: AVATAR_SIZE + 8,
    height: AVATAR_SIZE + 8,
    borderRadius: (AVATAR_SIZE + 8) / 2,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    includeFontPadding: false,
  },
  heroName: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  contactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    marginBottom: 4,
  },
  contactIcon: {
    fontSize: 13,
  },
  contactVal: {
    fontSize: 13,
    fontWeight: '500',
  },
  heroRating: {
    alignItems: 'center',
    marginTop: 14,
  },
  heroAvg: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
    includeFontPadding: false,
  },
  starRowInline: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 2,
  },

  // ---- 통계 카드 행 ----
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginTop: -14,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 16,
  },
  statIcon: {
    fontSize: 20,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    includeFontPadding: false,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },

  // ---- 섹션 카드 ----
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  countBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // ---- 평점 분포 ----
  distWrap: {
    gap: 8,
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  distLabel: {
    width: 14,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  distBarBg: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  distBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  distCount: {
    width: 24,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },

  // ---- 리뷰 카드 ----
  reviewCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  reviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  reviewRatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reviewRatingIcon: {
    fontSize: 15,
  },
  reviewRatingNum: {
    fontSize: 15,
    fontWeight: '700',
  },
  reviewDateText: {
    fontSize: 12,
    fontWeight: '500',
  },
  reviewTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 10,
  },
  reviewTagText: {
    fontSize: 12,
    fontWeight: '600',
  },
  reviewBody: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  moreText: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
    paddingTop: 8,
  },

  // ---- 빈 상태 ----
  empty: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  emptyCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 13,
    fontWeight: '400',
  },
});
