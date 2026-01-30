/**
 * ==================== 알림 설정 Hook ====================
 * 
 * 알림 설정 상태 관리 및 권한 처리
 * 
 * ========================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import {
  NotificationSettings,
  getNotificationSettings,
  saveNotificationSettings,
  toggleNotifications as toggleNotificationsService,
  requestNotificationPermission,
} from '../services/NotificationService';
import { secureLog } from '../utils/secureStorage';

export const useNotifications = () => {
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: false,
    newEventAlerts: true,
    eventReminders: true,
  });
  const [isLoading, setIsLoading] = useState(true);

  // 초기 설정 불러오기
  useEffect(() => {
    let mounted = true;
    
    const loadSettings = async () => {
      try {
        const loadedSettings = await getNotificationSettings();
        
        // 권한 상태 확인 (알림이 enabled인 경우에만)
        // 중요: 사용자가 끈 설정을 권한 상태로 덮어쓰지 않음
        try {
          const { status } = await Notifications.getPermissionsAsync();
          // 권한이 없는데 enabled가 true면 -> false로 변경
          if (status !== 'granted' && loadedSettings.enabled) {
            loadedSettings.enabled = false;
            await saveNotificationSettings(loadedSettings);
          }
          // 주의: 권한이 있다고 해서 자동으로 enabled를 true로 바꾸지 않음!
          // 사용자가 앱 내에서 알림을 끈 경우를 존중
        } catch (permError) {
          // Expo Go에서는 권한 확인 실패할 수 있음 (무시)
        }
        
        if (mounted) {
          setSettings(loadedSettings);
          setIsLoading(false);
        }
      } catch (error) {
        secureLog.error('설정 불러오기 실패');
        if (mounted) setIsLoading(false);
      }
    };
    
    loadSettings();
    return () => { mounted = false; };
  }, []);

  // 알림 활성화/비활성화
  const toggleNotifications = useCallback(async (enabled: boolean) => {
    try {
      const success = await toggleNotificationsService(enabled);
      
      if (success) {
        setSettings(prev => {
          const newSettings = { ...prev, enabled };
          saveNotificationSettings(newSettings);
          return newSettings;
        });
        return true;
      }
      
      return false;
    } catch (error) {
      secureLog.error('알림 토글 실패');
      return false;
    }
  }, []);

  // 새 일정 알림 토글 (async 불필요 - 상태 업데이트만 수행)
  const toggleNewEventAlerts = useCallback((enabled: boolean) => {
    setSettings(prev => {
      const newSettings = { ...prev, newEventAlerts: enabled };
      saveNotificationSettings(newSettings).catch(() => {
        secureLog.error('새 일정 알림 설정 저장 실패');
      });
      return newSettings;
    });
  }, []);

  // 일정 리마인더 토글 (async 불필요)
  const toggleEventReminders = useCallback((enabled: boolean) => {
    setSettings(prev => {
      const newSettings = { ...prev, eventReminders: enabled };
      saveNotificationSettings(newSettings).catch(() => {
        secureLog.error('리마인더 설정 저장 실패');
      });
      return newSettings;
    });
  }, []);

  // 권한 요청
  const requestPermission = useCallback(async () => {
    return await requestNotificationPermission();
  }, []);

  return {
    settings,
    isLoading,
    toggleNotifications,
    toggleNewEventAlerts,
    toggleEventReminders,
    requestPermission,
  };
};
