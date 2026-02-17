/**
 * ==================== 사용자 식별 시스템 ====================
 * 
 * 기능:
 *   - 디바이스 고유 ID 생성 및 저장
 *   - 사용자별 적립금 및 사용 내역 관리
 *   - 서버 없이 로컬 저장
 * 
 * 사용 방법:
 *   const { userId, getUserData } = useUser();
 * 
 * ========================================================================
 */

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback, useRef } from 'react';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../utils/asyncStorageManager';
import { encryptData, decryptData, secureLog, maskSensitiveData } from '../utils/secureStorage';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';

interface UserContextType {
  userId: string | null;
  isLoading: boolean;
  inviteCode: string | null;
  getUserData: () => Promise<UserData | null>;
  registerWithInviteCode: (inviterCode: string) => Promise<boolean>;
}

export interface UserData {
  userId: string;
  inviteCode: string;
  invitedBy: string | null;
  invitedCount: number;
  deviceInfo: {
    brand: string | null;
    modelName: string | null;
    osName: string | null;
    osVersion: string | null;
  };
  createdAt: string;
  lastActiveAt: string;
  dataHash: string; // 데이터 무결성 검증용
}

const UserContext = createContext<UserContextType | undefined>(undefined);

// ==================== 상수 정의 ====================
const STORAGE_KEYS = {
  USER_ID_SECURE: 'userId_secure',
  USER_PREFIX: 'user_',
  INVITE_HISTORY: 'invite_history',
} as const;
const MAX_INVITE_HISTORY = 500;

// ==================== 보안 함수 ====================

// 고유한 사용자 ID 생성 (UUID v4 - 암호학적으로 안전)
const generateUserId = async (): Promise<string> => {
  const bytes = await Crypto.getRandomBytesAsync(16);
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // UUID v4 형식으로 변환
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '4' + hex.slice(13, 16),
    ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) + hex.slice(18, 20),
    hex.slice(20, 32)
  ].join('-');
};

// 짧은 초대 코드 생성 (6자리 대문자 + 숫자)
const generateInviteCode = async (): Promise<string> => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동하기 쉬운 문자 제외 (I, O, 1, 0)
  const bytes = await Crypto.getRandomBytesAsync(6);
  return Array.from(bytes)
    .map(b => chars[b % chars.length])
    .join('');
};

// 데이터 무결성 해시 생성
const generateDataHash = async (data: any): Promise<string> => {
  const jsonString = JSON.stringify(data);
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    jsonString
  );
};

// 데이터 무결성 검증
const verifyDataIntegrity = async (data: UserData): Promise<boolean> => {
  const { dataHash, ...dataWithoutHash } = data;
  const computedHash = await generateDataHash(dataWithoutHash);
  return computedHash === dataHash;
};

// ==================================================

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    initializeUser();
    return () => { isMountedRef.current = false; };
  }, []);

  const initializeUser = async () => {
    try {
      // 암호화된 사용자 ID 확인
      let encryptedUserId = await safeGetItem(STORAGE_KEYS.USER_ID_SECURE);
      let storedUserId: string | null = null;

      if (encryptedUserId) {
        try {
          storedUserId = await decryptData(encryptedUserId);
        } catch {
          // 복호화 실패 시 새 사용자로 처리
          encryptedUserId = null;
        }
      }

      if (!storedUserId) {
        // 새 사용자 ID 및 초대 코드 생성
        storedUserId = await generateUserId();
        const newInviteCode = await generateInviteCode();
        
        // 암호화하여 저장
        await safeSetItem(STORAGE_KEYS.USER_ID_SECURE, await encryptData(storedUserId));

        // 사용자 데이터 생성
        const userDataWithoutHash = {
          userId: storedUserId,
          inviteCode: newInviteCode,
          invitedBy: null,
          invitedCount: 0,
          deviceInfo: {
            brand: Device.brand,
            modelName: Device.modelName,
            osName: Device.osName,
            osVersion: Device.osVersion,
          },
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
        };

        // 데이터 무결성 해시 추가
        const dataHash = await generateDataHash(userDataWithoutHash);
        const userData: UserData = { ...userDataWithoutHash, dataHash };

        await safeSetItem(`${STORAGE_KEYS.USER_PREFIX}${storedUserId}`, JSON.stringify(userData));
        if (isMountedRef.current) {
          setInviteCode(newInviteCode);
        }
        secureLog.info('✅ 새 사용자 생성:', maskSensitiveData(storedUserId), '(초대코드: ' + maskSensitiveData(newInviteCode) + ')');
      } else {
        // 기존 사용자 데이터 로드 및 검증
        const userDataStr = await safeGetItem(`${STORAGE_KEYS.USER_PREFIX}${storedUserId}`);
        if (userDataStr) {
          const userData: UserData = JSON.parse(userDataStr);
          
          // 데이터 무결성 검증
          const isValid = await verifyDataIntegrity(userData);
          if (!isValid) {
            secureLog.warn('⚠️ 데이터 무결성 검증 실패 - 데이터가 변조되었을 수 있습니다');
          }

          // 마지막 활동 시간 업데이트
          const { dataHash, ...dataWithoutHash } = userData;
          const updatedDataWithoutHash = {
            ...dataWithoutHash,
            lastActiveAt: new Date().toISOString(),
          };
          const newHash = await generateDataHash(updatedDataWithoutHash);
          const updatedData: UserData = { ...updatedDataWithoutHash, dataHash: newHash };

          await safeSetItem(`${STORAGE_KEYS.USER_PREFIX}${storedUserId}`, JSON.stringify(updatedData));
          if (isMountedRef.current) {
            setInviteCode(userData.inviteCode);
          }
          secureLog.info('✅ 기존 사용자 로그인:', maskSensitiveData(storedUserId), '(초대코드: ' + maskSensitiveData(userData.inviteCode) + ')');
        }
      }

      if (isMountedRef.current) {
        setUserId(storedUserId);
      }
    } catch (error) {
      secureLog.error('❌ 사용자 초기화 실패:', error);
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  // getUserData를 useCallback으로 최적화
  const getUserData = useCallback(async (): Promise<UserData | null> => {
    if (!userId) return null;

    try {
      const userDataStr = await safeGetItem(`${STORAGE_KEYS.USER_PREFIX}${userId}`);
      if (userDataStr) {
        const userData: UserData = JSON.parse(userDataStr);
        
        // 데이터 무결성 검증
        const isValid = await verifyDataIntegrity(userData);
        if (!isValid) {
          secureLog.warn('⚠️ 데이터 무결성 검증 실패');
        }
        
        return userData;
      }
    } catch (error) {
      secureLog.error('❌ 사용자 데이터 로드 실패:', error);
    }
    return null;
  }, [userId]);

  // 초대 코드로 가입
  const registerWithInviteCode = useCallback(async (inviterCode: string): Promise<boolean> => {
    if (!userId) return false;

    try {
      // 초대 코드 형식 검증 (보안 강화)
      if (!/^[A-Z0-9]{6}$/.test(inviterCode)) {
        secureLog.warn('❌ 초대 코드 형식이 올바르지 않습니다');
        return false;
      }

      // 초대 코드로 초대한 사람 찾기
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const keys = await AsyncStorage.getAllKeys();
      const userKeys = keys.filter(key => key.startsWith(STORAGE_KEYS.USER_PREFIX));
      
      for (const key of userKeys) {
        const dataStr = await safeGetItem(key);
        if (dataStr) {
          const data: UserData = JSON.parse(dataStr);
          if (data.inviteCode === inviterCode && data.userId !== userId) {
            // 초대한 사람 찾음
            const myData = await getUserData();
            if (myData && !myData.invitedBy) {
              // 내 데이터 업데이트
              const { dataHash, ...myDataWithoutHash } = myData;
              const updatedMyData = {
                ...myDataWithoutHash,
                invitedBy: data.userId,
              };
              const myHash = await generateDataHash(updatedMyData);
              await safeSetItem(`${STORAGE_KEYS.USER_PREFIX}${userId}`, JSON.stringify({ ...updatedMyData, dataHash: myHash }));

              // 초대한 사람 초대 수 증가
              const { dataHash: inviterHash, ...inviterDataWithoutHash } = data;
              const updatedInviterData = {
                ...inviterDataWithoutHash,
                invitedCount: data.invitedCount + 1,
              };
              const inviterNewHash = await generateDataHash(updatedInviterData);
              await safeSetItem(key, JSON.stringify({ ...updatedInviterData, dataHash: inviterNewHash }));

              // 초대 내역 기록
              await saveInviteHistory(data.userId, userId, inviterCode);

              secureLog.info('초대 코드 등록 완료:', maskSensitiveData(inviterCode));
              return true;
            }
          }
        }
      }
      
      secureLog.warn('유효하지 않은 초대 코드:', maskSensitiveData(inviterCode));
      return false;
    } catch (error) {
      secureLog.error('❌ 초대 코드 등록 실패');
      return false;
    }
  }, [userId, getUserData]);

  // 초대 내역 저장
  const saveInviteHistory = async (inviterId: string, inviteeId: string, inviteCode: string) => {
    try {
      const historyStr = await safeGetItem(STORAGE_KEYS.INVITE_HISTORY);
      const history = historyStr ? JSON.parse(historyStr) : [];
      history.unshift({
        inviterId,
        inviteeId,
        inviteCode,
        timestamp: new Date().toISOString(),
      });
      await safeSetItem(STORAGE_KEYS.INVITE_HISTORY, JSON.stringify(history.slice(0, MAX_INVITE_HISTORY)));
    } catch (error) {
      secureLog.error('초대 내역 저장 실패');
    }
  };

  // Context value를 useMemo로 최적화
  const contextValue = useMemo(
    () => ({ userId, isLoading, inviteCode, getUserData, registerWithInviteCode }),
    [userId, isLoading, inviteCode, getUserData, registerWithInviteCode]
  );

  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
};
