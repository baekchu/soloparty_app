/**
 * ==================== 포인트 관리 훅 ====================
 * 
 * 기능:
 *   - 포인트 영구 저장 (AsyncStorage)
 *   - 사용자별 고유 ID 기반 관리
 *   - 다중 레이어 보안 (암호화, 해시, 체크섬 검증)
 *   - 앱 삭제 전까지 데이터 유지
 * 
 * ========================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

interface PointsData {
  userId: string;
  balance: number;
  history: Array<{
    id: string;
    amount: number;
    reason: string;
    timestamp: number;
  }>;
  lastUpdated: number;
  version: number;
  checksum: string;
  hash: string;
}

const STORAGE_KEY = '@solo_party_points';
const USER_ID_KEY = '@solo_party_user_id';
const ENCRYPTION_KEY = 'sp_2025_secure_key_v1';
const DATA_VERSION = 1;

const base64Encode = (str: string): string => {
  const utf8Bytes = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
    return String.fromCharCode(parseInt(p1, 16));
  });
  return btoa(utf8Bytes);
};

const base64Decode = (str: string): string => {
  const utf8Bytes = atob(str);
  return decodeURIComponent(
    utf8Bytes.split('').map((c) => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join('')
  );
};

const encryptData = (data: string): string => {
  let result = '';
  for (let i = 0; i < data.length; i++) {
    result += String.fromCharCode(
      data.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length)
    );
  }
  return base64Encode(result);
};

const decryptData = (encrypted: string): string => {
  const data = base64Decode(encrypted);
  let result = '';
  for (let i = 0; i < data.length; i++) {
    result += String.fromCharCode(
      data.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length)
    );
  }
  return result;
};

const generateHash = async (data: string): Promise<string> => {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    data
  );
};

const generateChecksum = (balance: number, userId: string, lastUpdated: number): string => {
  const str = `${userId}:${balance}:${lastUpdated}:${DATA_VERSION}`;
  let checksum = 0;
  for (let i = 0; i < str.length; i++) {
    checksum = ((checksum << 5) - checksum) + str.charCodeAt(i);
    checksum = checksum & checksum;
  }
  return checksum.toString(36);
};

const generateUserId = async (): Promise<string> => {
  const randomBytes = await Crypto.getRandomBytesAsync(16);
  const randomStr = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `user_${randomStr}`;
};

const getUserId = async (): Promise<string> => {
  let userId = await AsyncStorage.getItem(USER_ID_KEY);
  if (!userId) {
    userId = await generateUserId();
    await AsyncStorage.setItem(USER_ID_KEY, userId);
  }
  return userId;
};

const getDefaultPointsData = async (): Promise<PointsData> => {
  const now = Date.now();
  const userId = await getUserId();
  const balance = 2500;
  
  const history = [
    {
      id: `init_${now}_${Math.random().toString(36).substr(2, 9)}`,
      amount: 2500,
      reason: '가입 축하 포인트',
      timestamp: now,
    }
  ];
  
  const checksum = generateChecksum(balance, userId, now);
  
  const dataString = JSON.stringify({
    userId,
    balance,
    history,
    lastUpdated: now,
    version: DATA_VERSION,
    checksum,
  });
  
  const hash = await generateHash(dataString);
  
  return {
    userId,
    balance,
    history,
    lastUpdated: now,
    version: DATA_VERSION,
    checksum,
    hash,
  };
};

export const usePoints = () => {
  const [balance, setBalance] = useState<number>(0);
  const [history, setHistory] = useState<PointsData['history']>([]);
  const [isLoading, setIsLoading] = useState(true);

  const savePoints = useCallback(async (
    newBalance: number,
    newHistory: PointsData['history']
  ) => {
    try {
      const now = Date.now();
      const userId = await getUserId();
      const checksum = generateChecksum(newBalance, userId, now);

      const dataString = JSON.stringify({
        userId,
        balance: newBalance,
        history: newHistory.slice(-100),
        lastUpdated: now,
        version: DATA_VERSION,
        checksum,
      });
      
      const hash = await generateHash(dataString);

      const data: PointsData = {
        userId,
        balance: newBalance,
        history: newHistory.slice(-100),
        lastUpdated: now,
        version: DATA_VERSION,
        checksum,
        hash,
      };

      const encrypted = encryptData(JSON.stringify(data));
      await AsyncStorage.setItem(STORAGE_KEY, encrypted);

      const backupKey = `${STORAGE_KEY}_backup`;
      await AsyncStorage.setItem(backupKey, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save points:', error);
      throw error;
    }
  }, []);

  const loadPoints = useCallback(async () => {
    try {
      const encryptedData = await AsyncStorage.getItem(STORAGE_KEY);
      
      if (!encryptedData) {
        const defaultData = await getDefaultPointsData();
        await savePoints(defaultData.balance, defaultData.history);
        setBalance(defaultData.balance);
        setHistory(defaultData.history);
        return;
      }

      const decrypted = decryptData(encryptedData);
      const data: PointsData = JSON.parse(decrypted);

      if (data.version !== DATA_VERSION) {
        console.warn('Data version mismatch, clearing old data...');
        await AsyncStorage.multiRemove([STORAGE_KEY, `${STORAGE_KEY}_backup`]);
        throw new Error('Data version mismatch');
      }

      const expectedChecksum = generateChecksum(data.balance, data.userId, data.lastUpdated);
      if (expectedChecksum !== data.checksum) {
        console.warn('Checksum validation failed, clearing corrupted data...');
        await AsyncStorage.multiRemove([STORAGE_KEY, `${STORAGE_KEY}_backup`]);
        throw new Error('Data integrity check failed');
      }

      const dataString = JSON.stringify({
        userId: data.userId,
        balance: data.balance,
        history: data.history,
        lastUpdated: data.lastUpdated,
        version: data.version,
        checksum: data.checksum,
      });
      const expectedHash = await generateHash(dataString);

      if (expectedHash !== data.hash) {
        console.warn('Hash validation failed, clearing corrupted data...');
        await AsyncStorage.multiRemove([STORAGE_KEY, `${STORAGE_KEY}_backup`]);
        throw new Error('Data integrity check failed');
      }

      const now = Date.now();
      if (data.lastUpdated > now + 60000) {
        console.warn('Invalid timestamp detected, clearing data...');
        await AsyncStorage.multiRemove([STORAGE_KEY, `${STORAGE_KEY}_backup`]);
        throw new Error('Invalid timestamp');
      }

      setBalance(data.balance);
      setHistory(data.history);
    } catch (error) {
      console.error('Failed to load points, initializing fresh data:', error);
      await AsyncStorage.multiRemove([STORAGE_KEY, `${STORAGE_KEY}_backup`]);
      const defaultData = await getDefaultPointsData();
      await savePoints(defaultData.balance, defaultData.history);
      setBalance(defaultData.balance);
      setHistory(defaultData.history);
    } finally {
      setIsLoading(false);
    }
  }, [savePoints]);

  const addPoints = useCallback(async (amount: number, reason: string) => {
    const newBalance = balance + amount;
    const newHistoryItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount,
      reason,
      timestamp: Date.now(),
    };
    const newHistory = [...history, newHistoryItem];

    setBalance(newBalance);
    setHistory(newHistory);
    await savePoints(newBalance, newHistory);

    return true;
  }, [balance, history, savePoints]);

  const spendPoints = useCallback(async (amount: number, reason: string) => {
    if (balance < amount) {
      return false;
    }

    const newBalance = balance - amount;
    const newHistoryItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount: -amount,
      reason,
      timestamp: Date.now(),
    };
    const newHistory = [...history, newHistoryItem];

    setBalance(newBalance);
    setHistory(newHistory);
    await savePoints(newBalance, newHistory);

    return true;
  }, [balance, history, savePoints]);

  const refreshPoints = useCallback(async () => {
    await loadPoints();
  }, [loadPoints]);

  useEffect(() => {
    loadPoints();
  }, [loadPoints]);

  return {
    balance,
    history,
    isLoading,
    addPoints,
    spendPoints,
    refreshPoints,
  };
};
