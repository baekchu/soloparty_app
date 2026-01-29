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
        
        // 권한 상태와 설정 동기화 (안전하게)
        try {
          const { status } = await Notifications.getPermissionsAsync();
          if (status === 'granted' && !loadedSettings.enabled) {
            loadedSettings.enabled = true;
            await saveNotificationSettings(loadedSettings);
          } else if (status !== 'granted' && loadedSettings.enabled) {
            loadedSettings.enabled = false;
            await saveNotificationSettings(loadedSettings);
          }
        } catch (permError) {
          // Expo Go에서는 권한 확인 실패할 수 있음 (무시)
          // 로그 생략 - 정상 동작
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

  // 새 일정 알림 토글
  const toggleNewEventAlerts = useCallback(async (enabled: boolean) => {
    try {
      setSettings(prev => {
        const newSettings = { ...prev, newEventAlerts: enabled };
        saveNotificationSettings(newSettings);
        return newSettings;
      });
    } catch (error) {
      secureLog.error('새 일정 알림 토글 실패');
    }
  }, []);

  // 일정 리마인더 토글
  const toggleEventReminders = useCallback(async (enabled: boolean) => {
    try {
      setSettings(prev => {
        const newSettings = { ...prev, eventReminders: enabled };
        saveNotificationSettings(newSettings);
        return newSettings;
      });
    } catch (error) {
      secureLog.error('리마인더 토글 실패');
    }
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
