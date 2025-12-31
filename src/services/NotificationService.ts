/**
 * ==================== 알림 서비스 ====================
 * 
 * 기능:
 *   - 푸시 알림 권한 요청
 *   - 새 일정 알림 전송
 *   - 알림 설정 관리
 * 
 * ========================================================================
 */

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const NOTIFICATION_SETTINGS_KEY = '@solo_party_notification_settings';

// Expo Go 환경 감지
const isExpoGo = Constants.appOwnership === 'expo';

// 알림 핸들러 설정 (Expo Go가 아닐 때만)
if (!isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export interface NotificationSettings {
  enabled: boolean;
  newEventAlerts: boolean;
  eventReminders: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: false,
  newEventAlerts: true,
  eventReminders: true,
};

/**
 * 알림 권한 요청
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    // Expo Go에서는 알림 기능 비활성화
    if (isExpoGo) {
      console.log('⚠️ Expo Go에서는 알림이 지원되지 않습니다');
      return false;
    }

    // Android 알림 채널 먼저 설정 (Android만)
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Solo Party 알림',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#ec4899',
        sound: 'default',
      });
    }

    // 현재 권한 상태 확인
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // 권한이 없으면 요청
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return false;
    }

    return true;
  } catch (error) {
    console.error('알림 권한 요청 실패:', error);
    return false;
  }
};

/**
 * 알림 설정 불러오기
 */
export const getNotificationSettings = async (): Promise<NotificationSettings> => {
  try {
    const settings = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (settings) {
      return JSON.parse(settings);
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('알림 설정 불러오기 실패:', error);
    return DEFAULT_SETTINGS;
  }
};

/**
 * 알림 설정 저장
 */
export const saveNotificationSettings = async (settings: NotificationSettings): Promise<void> => {
  try {
    await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('알림 설정 저장 실패:', error);
    throw error;
  }
};

/**
 * 알림 활성화/비활성화
 */
export const toggleNotifications = async (enabled: boolean): Promise<boolean> => {
  try {
    if (enabled) {
      // 알림을 활성화하려면 권한 필요
      const hasPermission = await requestNotificationPermission();
      if (!hasPermission) {
        return false;
      }
    }

    const settings = await getNotificationSettings();
    settings.enabled = enabled;
    await saveNotificationSettings(settings);
    
    return true;
  } catch (error) {
    console.error('알림 토글 실패:', error);
    return false;
  }
};

/**
 * 새 일정 알림 전송
 */
export const sendNewEventNotification = async (eventTitle: string, eventDate: string): Promise<void> => {
  try {
    const settings = await getNotificationSettings();
    
    // 알림이 비활성화되어 있으면 전송하지 않음
    if (!settings.enabled || !settings.newEventAlerts) {
      return;
    }

    // 권한 확인
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎉 새로운 파티 등록!',
        body: `${eventTitle}\n📅 ${eventDate}`,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: { eventTitle, eventDate },
      },
      trigger: null, // 즉시 전송
    });
  } catch (error) {
    console.error('새 일정 알림 전송 실패:', error);
  }
};

/**
 * 테스트 알림 전송 (권한 확인용)
 */
export const sendTestNotification = async (): Promise<boolean> => {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    
    if (status !== 'granted') {
      return false;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔔 테스트 알림',
        body: '알림이 정상적으로 작동하고 있습니다!',
        sound: 'default',
        data: { test: true },
      },
      trigger: null,
    });

    return true;
  } catch (error) {
    console.error('테스트 알림 전송 실패:', error);
    return false;
  }
};

/**
 * 광고 시청 한도 리셋 알림 전송
 */
export const sendAdLimitResetNotification = async (): Promise<void> => {
  try {
    const settings = await getNotificationSettings();
    
    // 알림이 비활성화되어 있으면 전송하지 않음
    if (!settings.enabled) {
      return;
    }

    // 권한 확인
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎁 광고 시청 가능!',
        body: '6시간이 지났습니다! 다시 10개의 광고를 시청하고 포인트를 받아보세요!',
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: { type: 'ad_limit_reset' },
      },
      trigger: null, // 즉시 전송
    });
  } catch (error) {
    console.error('광고 한도 리셋 알림 전송 실패:', error);
  }
};

/**
 * 일정 리마인더 설정
 */
export const scheduleEventReminder = async (
  eventTitle: string,
  eventDate: Date,
  eventId: string
): Promise<string | null> => {
  try {
    const settings = await getNotificationSettings();
    
    if (!settings.enabled || !settings.eventReminders) {
      return null;
    }

    // 일정 1시간 전에 알림
    const reminderDate = new Date(eventDate);
    reminderDate.setHours(reminderDate.getHours() - 1);

    // 과거 시간이면 알림 설정하지 않음
    if (reminderDate <= new Date()) {
      return null;
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ 곧 파티가 시작됩니다!',
        body: `${eventTitle}이(가) 1시간 후 시작됩니다.`,
        data: { type: 'event_reminder', eventId },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderDate,
      },
    });

    return notificationId;
  } catch (error) {
    console.error('리마인더 설정 실패:', error);
    return null;
  }
};

/**
 * 예약된 알림 취소
 */
export const cancelNotification = async (notificationId: string): Promise<void> => {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.error('알림 취소 실패:', error);
  }
};

/**
 * 모든 예약된 알림 취소
 */
export const cancelAllNotifications = async (): Promise<void> => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('모든 알림 취소 실패:', error);
  }
};
