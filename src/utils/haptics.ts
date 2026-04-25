/**
 * 햅틱 피드백 유틸리티
 * - 주요 액션에 촉각 피드백 제공
 * - 웹/미지원 환경에서 안전하게 무시
 */

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/** 가벼운 터치 피드백 (북마크, 필터 선택, 탭 전환) */
export const hapticLight = () => {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

/** 중간 터치 피드백 (공유, 쿠폰 사용) */
export const hapticMedium = () => {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};

/** 성공 피드백 (저장 완료, 체크인 완료) */
export const hapticSuccess = () => {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
};

/** 에러 피드백 (동작 실패) */
export const hapticError = () => {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
};

/** 선택 피드백 (리스트 항목 선택, 별점 선택) */
export const hapticSelection = () => {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => {});
};
