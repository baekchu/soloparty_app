/**
 * ==================== 적립금 & 티켓 화면 ====================
 * 
 * 기능:
 *   1. 현재 적립금 표시
 *   2. 광고 보기 버튼 (100원 적립)
 *   3. 티켓 교환 (무료/50%/30% 할인권)
 *   4. 적립/사용 내역 표시
 * 
 * 네비게이션:
 *   - CalendarScreen 헤더의 💰 버튼에서 접근
 *   - navigation.navigate('Reward')
 * 
 * ========================================================================
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useReward } from '../contexts/RewardContext';
import { useRewardedAd } from '../services/AdService';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useNavigation } from '@react-navigation/native';

type RewardScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Reward'>;

interface TicketOption {
  id: string;
  name: string;
  price: number;
  originalPrice: number;
  discount: number;
  description: string;
}

const ticketOptions: TicketOption[] = [
  {
    id: '1',
    name: '솔로파티 무료 입장권',
    price: 50000,
    originalPrice: 50000,
    discount: 100,
    description: '솔로파티 1회 무료 입장 (50,000원 상당)',
  },
  {
    id: '2',
    name: '솔로파티 50% 할인권',
    price: 25000,
    originalPrice: 50000,
    discount: 50,
    description: '솔로파티 1회 50% 할인 (25,000원 할인)',
  },
  {
    id: '3',
    name: '솔로파티 30% 할인권',
    price: 15000,
    originalPrice: 50000,
    discount: 30,
    description: '솔로파티 1회 30% 할인 (15,000원 할인)',
  },
];

export default function RewardScreen() {
  const { theme } = useTheme();
  const { balance, addReward, spendReward, rewardHistory, dailyAdCount, maxDailyAds, canWatchAd } = useReward();
  const navigation = useNavigation<RewardScreenNavigationProp>();
  const isDark = theme === 'dark';
  const [refreshing, setRefreshing] = useState(false);

  const { showAd, loaded, loading } = useRewardedAd((amount) => {
    addReward(amount, '광고 시청 보상');
  });

  // 새로고침
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // 잠시 대기 후 새로고침 완료
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const handleExchangeTicket = async (ticket: TicketOption) => {
    Alert.alert(
      '티켓 교환',
      `${ticket.name}을(를) 교환하시겠습니까?\n\n필요 적립금: ${ticket.price.toLocaleString()}원\n현재 잔액: ${balance.toLocaleString()}원`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '교환하기',
          onPress: async () => {
            const success = await spendReward(ticket.price, ticket.name);
            if (success) {
              Alert.alert(
                '🎉 교환 완료!',
                `${ticket.name}이(가) 발급되었습니다!\n\n티켓은 "나의 티켓" 메뉴에서 확인하실 수 있습니다.`,
                [
                  {
                    text: '확인',
                    onPress: () => {
                      // TODO: 티켓 목록 화면으로 이동
                    },
                  },
                ]
              );
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? '#0f172a' : '#ffffff' }]}
      edges={['top', 'left', 'right']}
    >
      {/* 헤더 */}
      <View style={[styles.header, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={{ fontSize: 24, color: isDark ? '#f8fafc' : '#0f172a' }}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
          적립금 & 티켓
        </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Invite')} style={styles.inviteButton}>
          <Text style={{ fontSize: 20 }}>👥</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* 일일 광고 시청 현황 */}
        <View style={[styles.dailyAdCard, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
          <View style={styles.dailyAdHeader}>
            <Text style={[styles.dailyAdTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
              오늘의 광고 시청
            </Text>
            <Text style={[styles.dailyAdCount, { color: canWatchAd ? '#10b981' : '#ef4444' }]}>
              {dailyAdCount}/{maxDailyAds}
            </Text>
          </View>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${(dailyAdCount / maxDailyAds) * 100}%`,
                  backgroundColor: canWatchAd ? '#10b981' : '#ef4444',
                },
              ]}
            />
          </View>
          {!canWatchAd && (
            <Text style={[styles.dailyAdWarning, { color: '#ef4444' }]}>
              ⚠️ 오늘의 광고 시청 한도를 모두 사용했습니다
            </Text>
          )}
        </View>

        {/* 잔액 카드 */}
        <View
          style={[
            styles.balanceCard,
            {
              backgroundColor: isDark ? '#a78bfa' : '#ec4899',
            },
          ]}
        >
          <Text style={styles.balanceLabel}>내 적립금</Text>
          <Text style={styles.balanceAmount}>{balance.toLocaleString()}원</Text>
          <Text style={styles.balanceDescription}>
            광고를 보고 적립금을 모아 무료 입장하세요!
          </Text>
        </View>

        {/* 광고 보기 버튼 */}
        <TouchableOpacity
          style={[
            styles.adButton,
            {
              backgroundColor: loaded && canWatchAd
                ? isDark
                  ? '#10b981'
                  : '#34d399'
                : isDark
                ? '#6b7280'
                : '#9ca3af',
            },
          ]}
          onPress={showAd}
          disabled={!loaded || !canWatchAd}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Text style={styles.adButtonIcon}>🎬</Text>
              <View>
                <Text style={styles.adButtonText}>
                  {!canWatchAd
                    ? '오늘 한도 초과'
                    : loaded
                    ? '광고 보고 50원 받기'
                    : '광고 준비 중...'}
                </Text>
                <Text style={styles.adButtonSubtext}>
                  {!canWatchAd
                    ? '내일 다시 시도해주세요'
                    : '30초 광고 시청 시 50원 적립'}
                </Text>
              </View>
            </>
          )}
        </TouchableOpacity>

        {/* 티켓 교환 섹션 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
            티켓 교환하기
          </Text>
          {ticketOptions.map((ticket) => (
            <View
              key={ticket.id}
              style={[
                styles.ticketCard,
                { backgroundColor: isDark ? '#1e293b' : '#f8fafc' },
              ]}
            >
              <View style={styles.ticketHeader}>
                <View style={styles.ticketBadge}>
                  <Text style={styles.ticketBadgeText}>{ticket.discount}% OFF</Text>
                </View>
                <Text style={[styles.ticketName, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
                  {ticket.name}
                </Text>
              </View>
              <Text style={[styles.ticketDescription, { color: isDark ? '#cbd5e1' : '#64748b' }]}>
                {ticket.description}
              </Text>
              <View style={styles.ticketFooter}>
                <View>
                  <Text style={[styles.ticketPrice, { color: isDark ? '#a78bfa' : '#ec4899' }]}>
                    {ticket.price.toLocaleString()}원
                  </Text>
                  {ticket.discount < 100 && (
                    <Text style={[styles.ticketOriginalPrice, { color: isDark ? '#64748b' : '#94a3b8' }]}>
                      {ticket.originalPrice.toLocaleString()}원
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={[
                    styles.exchangeButton,
                    {
                      backgroundColor:
                        balance >= ticket.price
                          ? isDark
                            ? '#a78bfa'
                            : '#ec4899'
                          : isDark
                          ? '#374151'
                          : '#e5e7eb',
                    },
                  ]}
                  onPress={() => handleExchangeTicket(ticket)}
                  disabled={balance < ticket.price}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.exchangeButtonText,
                      {
                        color: balance >= ticket.price ? '#ffffff' : isDark ? '#64748b' : '#94a3b8',
                      },
                    ]}
                  >
                    교환하기
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {/* 적립 내역 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
            최근 내역
          </Text>
          {rewardHistory.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: isDark ? '#1e293b' : '#f8fafc' }]}>
              <Text style={[styles.emptyStateText, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                아직 내역이 없습니다
              </Text>
            </View>
          ) : (
            rewardHistory.slice(0, 10).map((item) => (
              <View
                key={item.id}
                style={[
                  styles.historyItem,
                  { backgroundColor: isDark ? '#1e293b' : '#f8fafc' },
                ]}
              >
                <View>
                  <Text style={[styles.historyReason, { color: isDark ? '#f8fafc' : '#0f172a' }]}>
                    {item.reason}
                  </Text>
                  <Text style={[styles.historyDate, { color: isDark ? '#64748b' : '#94a3b8' }]}>
                    {new Date(item.date).toLocaleDateString('ko-KR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.historyAmount,
                    {
                      color:
                        item.type === 'earn'
                          ? '#10b981'
                          : isDark
                          ? '#f87171'
                          : '#ef4444',
                    },
                  ]}
                >
                  {item.type === 'earn' ? '+' : '-'}
                  {Math.abs(item.amount).toLocaleString()}원
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  inviteButton: {
    width: 40,
    alignItems: 'center',
  },
  dailyAdCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  dailyAdHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dailyAdTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  dailyAdCount: {
    fontSize: 18,
    fontWeight: '800',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  dailyAdWarning: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  balanceCard: {
    borderRadius: 24,
    padding: 32,
    marginTop: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  balanceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 48,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 8,
  },
  balanceDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  adButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderRadius: 16,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  adButtonIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  adButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  adButtonSubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 16,
  },
  ticketCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ticketBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  ticketBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
  },
  ticketName: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  ticketDescription: {
    fontSize: 13,
    marginBottom: 12,
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketPrice: {
    fontSize: 20,
    fontWeight: '800',
  },
  ticketOriginalPrice: {
    fontSize: 13,
    textDecorationLine: 'line-through',
    marginTop: 2,
  },
  exchangeButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  exchangeButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  historyReason: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 12,
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptyState: {
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
  },
});
