/**
 * ==================== 초기 알림 권한 요청 컴포넌트 ====================
 * 
 * 앱 첫 실행 시 시스템 네이티브 알림 권한을 요청
 * (iOS/Android 기본 권한 요청 다이얼로그 사용)
 * 
 * ========================================================================
 */

import React, { useEffect, useRef } from 'react';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';
import { requestNotificationPermission, saveNotificationSettings, getNotificationSettings } from '../services/NotificationService';

const FIRST_LAUNCH_KEY = '@solo_party_first_launch';

interface NotificationPromptProps {
  isDark: boolean;
  onClose?: () => void;
}

export const NotificationPrompt: React.FC<NotificationPromptProps> = ({ onClose }) => {
  const hasRequestedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    
    const requestPermission = async () => {
      // 중복 요청 방지
      if (hasRequestedRef.current) return;
      hasRequestedRef.current = true;
      
      try {
        const hasLaunched = await safeGetItem(FIRST_LAUNCH_KEY);
        
        if (!hasLaunched) {
          // 첫 실행 시 시스템 네이티브 알림 권한 요청
          // iOS/Android 기본 권한 요청 다이얼로그가 표시됨
          const granted = await requestNotificationPermission();
          
          // 첫 실행 플래그 저장
          await safeSetItem(FIRST_LAUNCH_KEY, 'true');
          
          // 권한 허용 시 설정 저장
          if (granted) {
            const settings = await getNotificationSettings();
            settings.enabled = true;
            await saveNotificationSettings(settings);
          }
        }
        
        // 완료 후 onClose 호출 (약간의 딜레이)
        if (mounted) {
          setTimeout(() => {
            if (mounted) onClose?.();
          }, 300);
        }
      } catch (error) {
        // 알림 권한 요청 실패는 치명적이지 않음 - 로그 생략
        if (mounted) onClose?.();
      }
    };
    
    // 약간의 딜레이 후 권한 요청 (앱 로딩 완료 후)
    const timer = setTimeout(requestPermission, 500);
    
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [onClose]);

  // UI를 렌더링하지 않음 (시스템 다이얼로그만 사용)
  return null;
};

export default NotificationPrompt;
