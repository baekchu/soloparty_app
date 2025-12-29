/**
 * ==================== 초기 알림 권한 요청 컴포넌트 ====================
 * 
 * 앱 첫 실행 시 알림 권한을 요청하는 모달
 * 
 * ========================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestNotificationPermission, saveNotificationSettings, getNotificationSettings } from '../services/NotificationService';

const FIRST_LAUNCH_KEY = '@solo_party_first_launch';

interface NotificationPromptProps {
  isDark: boolean;
}

export const NotificationPrompt: React.FC<NotificationPromptProps> = ({ isDark }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    let mounted = true;
    
    const checkFirstLaunch = async () => {
      try {
        const hasLaunched = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
        if (!hasLaunched && mounted) {
          timer = setTimeout(() => {
            if (mounted) setVisible(true);
          }, 1000);
        }
      } catch (error) {
        console.error('첫 실행 확인 실패:', error);
      }
    };
    
    checkFirstLaunch();
    
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const handleAllow = useCallback(async () => {
    const granted = await requestNotificationPermission();
    await AsyncStorage.setItem(FIRST_LAUNCH_KEY, 'true');
    
    if (granted) {
      const settings = await getNotificationSettings();
      settings.enabled = true;
      await saveNotificationSettings(settings);
    }
    
    setVisible(false);
  }, []);

  const handleLater = useCallback(async () => {
    await AsyncStorage.setItem(FIRST_LAUNCH_KEY, 'true');
    setVisible(false);
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleLater}
    >
      <View style={styles.overlay}>
        <View style={[
          styles.container,
          { backgroundColor: isDark ? '#1e293b' : '#ffffff' }
        ]}>
          {/* 아이콘 */}
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>🔔</Text>
          </View>

          {/* 제목 */}
          <Text style={[
            styles.title,
            { color: isDark ? '#f8fafc' : '#0f172a' }
          ]}>
            알림을 받으시겠어요?
          </Text>

          {/* 설명 */}
          <Text style={[
            styles.description,
            { color: isDark ? '#94a3b8' : '#64748b' }
          ]}>
            새로운 파티가 등록되면{'\n'}
            실시간으로 알려드릴게요!
          </Text>

          {/* 버튼들 */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleAllow}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>알림 받기</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.secondaryButton,
                { borderColor: isDark ? '#334155' : '#e5e7eb' }
              ]}
              onPress={handleLater}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.secondaryButtonText,
                { color: isDark ? '#94a3b8' : '#64748b' }
              ]}>
                나중에
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fce7f3',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  button: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#ec4899',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
