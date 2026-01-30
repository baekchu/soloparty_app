/**
 * ==================== 포인트 보안 서비스 (강화 버전) ====================
 * 
 * 서버 없이 클라이언트에서 포인트와 광고 데이터를 안전하게 관리
 * 앱 삭제 전까지 절대 데이터 손실 없음
 * 
 * 핵심 보안 기능:
 *   1. 3중 저장 (SecureStore + AsyncStorage + 백업키)
 *   2. 자동 복구 (하나가 손상되면 다른 곳에서 복구)
 *   3. 저장 실패 시 3번 재시도
 *   4. 트랜잭션 체인 (블록체인 방식)
 *   5. 이상 탐지 시스템
 * 
 * ========================================================================
 */

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';
import { secureLog, encryptData, decryptData } from '../utils/secureStorage';

// ==================== 상수 정의 ====================
const SECURE_KEYS = {
  // SecureStore 키 (iOS Keychain / Android Keystore)
  DEVICE_ID: 'soloparty_device_id',
  MASTER_HASH: 'soloparty_master_hash',
  POINTS_PRIMARY: 'soloparty_points_primary',    // 주 저장소
  POINTS_BACKUP: 'soloparty_points_backup',      // 백업 저장소
  AD_HISTORY_BACKUP: 'soloparty_ad_history',
  TRANSACTION_CHAIN: 'soloparty_tx_chain',
  LAST_KNOWN_BALANCE: 'soloparty_last_balance',  // 마지막 잔액 (복구용)
} as const;

const ASYNC_KEYS = {
  POINTS_DATA: '@soloparty_points_v3',
  POINTS_BACKUP: '@soloparty_points_backup_v3',  // AsyncStorage 백업
  AD_LIMIT: '@soloparty_ad_limit_v3',
  TX_LOG: '@soloparty_tx_log_v3',
} as const;

// 보안 설정
const SECURITY_CONFIG = {
  MAX_POINTS: 1000000,
  MAX_DAILY_ADS: 20,
  MAX_HOURLY_ADS: 5,
  MIN_AD_INTERVAL_MS: 5000,
  SUSPICIOUS_POINT_JUMP: 500,
  TX_CHAIN_LENGTH: 50,
  SAVE_RETRY_COUNT: 3,      // 저장 실패 시 재시도 횟수
  SAVE_RETRY_DELAY_MS: 100, // 재시도 간격
} as const;

// ==================== 타입 정의 ====================
export interface Transaction {
  id: string;
  type: 'earn' | 'spend' | 'ad_watch' | 'init' | 'restore';
  amount: number;
  balance_after: number;
  timestamp: number;
  prev_hash: string; // 이전 트랜잭션 해시
  hash: string; // 현재 트랜잭션 해시
  device_id: string;
  metadata?: Record<string, unknown>;
}

export interface SecurePointsData {
  balance: number;
  total_earned: number;
  total_spent: number;
  ad_watches_total: number;
  ad_watches_today: number;
  last_ad_timestamp: number;
  device_id: string;
  created_at: number;
  updated_at: number;
  integrity_hash: string;
}

export interface AdWatchRecord {
  timestamp: number;
  points_earned: number;
  tx_hash: string;
}

export interface BackupData {
  code: string;
  points_data: SecurePointsData;
  recent_transactions: Transaction[];
  created_at: number;
  checksum: string;
}

export interface SecurityCheckResult {
  is_valid: boolean;
  issues: string[];
  recovered_data?: SecurePointsData;
}

// ==================== 유틸리티 함수 ====================
/**
 * SHA-256 해시 생성
 */
const sha256 = async (data: string): Promise<string> => {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    data
  );
};

/**
 * 고유 ID 생성
 */
const generateUniqueId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${timestamp}_${randomPart}`;
};

/**
 * 지연 함수
 */
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 재시도 래퍼 함수
 */
const withRetry = async <T>(
  fn: () => Promise<T>,
  retries: number = SECURITY_CONFIG.SAVE_RETRY_COUNT,
  delayMs: number = SECURITY_CONFIG.SAVE_RETRY_DELAY_MS
): Promise<T> => {
  let lastError: unknown;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < retries - 1) {
        await delay(delayMs * (i + 1)); // 점진적 지연
      }
    }
  }
  
  throw lastError;
};

// ==================== 기기 ID 관리 ====================
/**
 * 기기 고유 ID 가져오기 (없으면 생성)
 */
export const getDeviceId = async (): Promise<string> => {
  try {
    let deviceId = await SecureStore.getItemAsync(SECURE_KEYS.DEVICE_ID);
    
    if (!deviceId) {
      // 새 기기 ID 생성
      const timestamp = Date.now().toString(36);
      const platform = Platform.OS;
      const random = Math.random().toString(36).substring(2, 15);
      deviceId = `${platform}_${timestamp}_${random}`;
      
      await SecureStore.setItemAsync(SECURE_KEYS.DEVICE_ID, deviceId);
      secureLog.info('📱 새 기기 ID 생성됨');
    }
    
    return deviceId;
  } catch (error) {
    // SecureStore 실패 시 임시 ID 생성
    secureLog.warn('⚠️ SecureStore 접근 실패, 임시 ID 사용');
    return `temp_${Platform.OS}_${Date.now()}`;
  }
};

// ==================== 트랜잭션 체인 관리 ====================
/**
 * 트랜잭션 해시 생성
 */
const generateTransactionHash = async (
  tx: Omit<Transaction, 'hash'>
): Promise<string> => {
  const data = `${tx.id}:${tx.type}:${tx.amount}:${tx.balance_after}:${tx.timestamp}:${tx.prev_hash}:${tx.device_id}`;
  return await sha256(data);
};

/**
 * 트랜잭션 체인 로드
 */
const loadTransactionChain = async (): Promise<Transaction[]> => {
  try {
    // SecureStore에서 우선 로드
    const secureData = await SecureStore.getItemAsync(SECURE_KEYS.TRANSACTION_CHAIN);
    if (secureData) {
      const decrypted = await decryptData(secureData);
      return JSON.parse(decrypted);
    }
    
    // AsyncStorage 백업에서 로드
    const asyncData = await safeGetItem(ASYNC_KEYS.TX_LOG);
    if (asyncData) {
      const decrypted = await decryptData(asyncData);
      return JSON.parse(decrypted);
    }
    
    return [];
  } catch {
    return [];
  }
};

/**
 * 트랜잭션 체인 저장
 */
const saveTransactionChain = async (chain: Transaction[]): Promise<void> => {
  try {
    // 최근 N개만 유지
    const trimmedChain = chain.slice(-SECURITY_CONFIG.TX_CHAIN_LENGTH);
    const encrypted = await encryptData(JSON.stringify(trimmedChain));
    
    // 이중 저장
    await Promise.all([
      SecureStore.setItemAsync(SECURE_KEYS.TRANSACTION_CHAIN, encrypted),
      safeSetItem(ASYNC_KEYS.TX_LOG, encrypted),
    ]);
  } catch (error) {
    secureLog.error('트랜잭션 체인 저장 실패');
  }
};

/**
 * 새 트랜잭션 추가
 */
export const addTransaction = async (
  type: Transaction['type'],
  amount: number,
  balance_after: number,
  metadata?: Record<string, unknown>
): Promise<Transaction | null> => {
  try {
    const chain = await loadTransactionChain();
    const deviceId = await getDeviceId();
    const prevHash = chain.length > 0 ? chain[chain.length - 1].hash : 'genesis';
    
    const txBase: Omit<Transaction, 'hash'> = {
      id: generateUniqueId(),
      type,
      amount,
      balance_after,
      timestamp: Date.now(),
      prev_hash: prevHash,
      device_id: deviceId,
      metadata,
    };
    
    const hash = await generateTransactionHash(txBase);
    const tx: Transaction = { ...txBase, hash };
    
    chain.push(tx);
    await saveTransactionChain(chain);
    
    return tx;
  } catch {
    return null;
  }
};

/**
 * 트랜잭션 체인 검증
 */
export const verifyTransactionChain = async (): Promise<{
  valid: boolean;
  invalidIndex?: number;
}> => {
  try {
    const chain = await loadTransactionChain();
    
    for (let i = 0; i < chain.length; i++) {
      const tx = chain[i];
      const expectedPrevHash = i === 0 ? 'genesis' : chain[i - 1].hash;
      
      // 이전 해시 검증
      if (tx.prev_hash !== expectedPrevHash) {
        return { valid: false, invalidIndex: i };
      }
      
      // 현재 해시 검증
      const txWithoutHash = { ...tx };
      delete (txWithoutHash as Record<string, unknown>).hash;
      const expectedHash = await generateTransactionHash(txWithoutHash as Omit<Transaction, 'hash'>);
      
      if (tx.hash !== expectedHash) {
        return { valid: false, invalidIndex: i };
      }
    }
    
    return { valid: true };
  } catch {
    return { valid: false };
  }
};

// ==================== 포인트 데이터 관리 ====================
/**
 * 무결성 해시 생성
 */
const generateIntegrityHash = async (data: Omit<SecurePointsData, 'integrity_hash'>): Promise<string> => {
  const str = `${data.balance}:${data.total_earned}:${data.total_spent}:${data.ad_watches_total}:${data.device_id}:${data.created_at}:soloparty_integrity_2026`;
  return await sha256(str);
};

/**
 * 마지막 잔액 저장 (빠른 복구용)
 */
const saveLastKnownBalance = async (balance: number): Promise<void> => {
  try {
    await SecureStore.setItemAsync(SECURE_KEYS.LAST_KNOWN_BALANCE, String(balance));
  } catch {
    // 실패해도 무시 (보조 기능)
  }
};

/**
 * 마지막 잔액 로드
 */
const getLastKnownBalance = async (): Promise<number | null> => {
  try {
    const balance = await SecureStore.getItemAsync(SECURE_KEYS.LAST_KNOWN_BALANCE);
    return balance ? parseInt(balance, 10) : null;
  } catch {
    return null;
  }
};

/**
 * 3중 저장 실행 (SecureStore Primary + SecureStore Backup + AsyncStorage)
 */
const tripleStore = async (data: SecurePointsData): Promise<{ success: boolean; savedCount: number }> => {
  const encrypted = await encryptData(JSON.stringify(data));
  let savedCount = 0;
  const errors: string[] = [];
  
  // 1. SecureStore Primary (재시도 포함)
  try {
    await withRetry(async () => {
      await SecureStore.setItemAsync(SECURE_KEYS.POINTS_PRIMARY, encrypted);
    });
    savedCount++;
  } catch (e) {
    errors.push('SecureStore Primary 실패');
  }
  
  // 2. SecureStore Backup (재시도 포함)
  try {
    await withRetry(async () => {
      await SecureStore.setItemAsync(SECURE_KEYS.POINTS_BACKUP, encrypted);
    });
    savedCount++;
  } catch (e) {
    errors.push('SecureStore Backup 실패');
  }
  
  // 3. AsyncStorage Primary (재시도 포함)
  try {
    await withRetry(async () => {
      await safeSetItem(ASYNC_KEYS.POINTS_DATA, encrypted);
    });
    savedCount++;
  } catch (e) {
    errors.push('AsyncStorage Primary 실패');
  }
  
  // 4. AsyncStorage Backup (재시도 포함)
  try {
    await withRetry(async () => {
      await safeSetItem(ASYNC_KEYS.POINTS_BACKUP, encrypted);
    });
    savedCount++;
  } catch (e) {
    errors.push('AsyncStorage Backup 실패');
  }
  
  // 5. 마지막 잔액 별도 저장
  await saveLastKnownBalance(data.balance);
  
  if (errors.length > 0) {
    secureLog.warn(`⚠️ 일부 저장 실패: ${errors.join(', ')}`);
  }
  
  // 최소 2개 이상 저장되어야 성공
  return { success: savedCount >= 2, savedCount };
};

/**
 * 3중 로드 시도 (가장 신뢰할 수 있는 데이터 반환)
 */
const tripleLoad = async (): Promise<SecurePointsData | null> => {
  const deviceId = await getDeviceId();
  const candidates: { data: SecurePointsData; source: string; timestamp: number }[] = [];
  
  // 1. SecureStore Primary에서 로드
  try {
    const encrypted = await SecureStore.getItemAsync(SECURE_KEYS.POINTS_PRIMARY);
    if (encrypted) {
      const decrypted = await decryptData(encrypted);
      const parsed: SecurePointsData = JSON.parse(decrypted);
      if (await validatePointsData(parsed, deviceId)) {
        candidates.push({ data: parsed, source: 'SecureStore Primary', timestamp: parsed.updated_at });
      }
    }
  } catch {
    secureLog.warn('⚠️ SecureStore Primary 로드 실패');
  }
  
  // 2. SecureStore Backup에서 로드
  try {
    const encrypted = await SecureStore.getItemAsync(SECURE_KEYS.POINTS_BACKUP);
    if (encrypted) {
      const decrypted = await decryptData(encrypted);
      const parsed: SecurePointsData = JSON.parse(decrypted);
      if (await validatePointsData(parsed, deviceId)) {
        candidates.push({ data: parsed, source: 'SecureStore Backup', timestamp: parsed.updated_at });
      }
    }
  } catch {
    secureLog.warn('⚠️ SecureStore Backup 로드 실패');
  }
  
  // 3. AsyncStorage Primary에서 로드
  try {
    const encrypted = await safeGetItem(ASYNC_KEYS.POINTS_DATA);
    if (encrypted) {
      const decrypted = await decryptData(encrypted);
      const parsed: SecurePointsData = JSON.parse(decrypted);
      if (await validatePointsData(parsed, deviceId)) {
        candidates.push({ data: parsed, source: 'AsyncStorage Primary', timestamp: parsed.updated_at });
      }
    }
  } catch {
    secureLog.warn('⚠️ AsyncStorage Primary 로드 실패');
  }
  
  // 4. AsyncStorage Backup에서 로드
  try {
    const encrypted = await safeGetItem(ASYNC_KEYS.POINTS_BACKUP);
    if (encrypted) {
      const decrypted = await decryptData(encrypted);
      const parsed: SecurePointsData = JSON.parse(decrypted);
      if (await validatePointsData(parsed, deviceId)) {
        candidates.push({ data: parsed, source: 'AsyncStorage Backup', timestamp: parsed.updated_at });
      }
    }
  } catch {
    secureLog.warn('⚠️ AsyncStorage Backup 로드 실패');
  }
  
  if (candidates.length === 0) {
    return null;
  }
  
  // 가장 최신 데이터 선택
  candidates.sort((a, b) => b.timestamp - a.timestamp);
  const best = candidates[0];
  
  secureLog.info(`✅ 데이터 로드 성공 (${best.source})`);
  
  // 다른 저장소와 동기화 (백그라운드)
  if (candidates.length < 4) {
    tripleStore(best.data).catch(() => {});
  }
  
  return best.data;
};

/**
 * 포인트 데이터 유효성 검증
 */
const validatePointsData = async (data: SecurePointsData, expectedDeviceId: string): Promise<boolean> => {
  // 1. 기본 타입 검증
  if (typeof data.balance !== 'number' || 
      typeof data.total_earned !== 'number' ||
      typeof data.total_spent !== 'number') {
    return false;
  }
  
  // 2. 범위 검증
  if (data.balance < 0 || data.balance > SECURITY_CONFIG.MAX_POINTS) {
    return false;
  }
  
  // 3. 기기 ID 검증 (임시 ID는 허용)
  if (data.device_id !== expectedDeviceId && !data.device_id.startsWith('temp_')) {
    // 기기 ID가 다르면 경고만 하고 데이터는 사용 (마이그레이션 고려)
    secureLog.warn('⚠️ 기기 ID 불일치 - 데이터는 유지');
  }
  
  // 4. 무결성 해시 검증
  const { integrity_hash, ...dataWithoutHash } = data;
  const expectedHash = await generateIntegrityHash(dataWithoutHash);
  
  if (integrity_hash !== expectedHash) {
    secureLog.warn('⚠️ 무결성 해시 불일치');
    return false;
  }
  
  // 5. 계산 검증 (총 적립 - 총 사용 = 잔액)
  const calculatedBalance = data.total_earned - data.total_spent;
  if (Math.abs(calculatedBalance - data.balance) > 1) {
    secureLog.warn('⚠️ 잔액 계산 불일치');
    return false;
  }
  
  return true;
};

/**
 * 보안 포인트 데이터 로드 (공개 API)
 */
export const loadSecurePointsData = async (): Promise<SecurePointsData | null> => {
  return await tripleLoad();
};

/**
 * 보안 포인트 데이터 저장 (3중 저장 + 재시도)
 */
export const saveSecurePointsData = async (data: Omit<SecurePointsData, 'integrity_hash' | 'updated_at'>): Promise<boolean> => {
  try {
    const now = Date.now();
    const fullData: SecurePointsData = {
      ...data,
      updated_at: now,
      integrity_hash: '',
    };
    
    // 무결성 해시 생성
    const { integrity_hash: _, ...dataWithoutHash } = fullData;
    fullData.integrity_hash = await generateIntegrityHash(dataWithoutHash);
    
    // 3중 저장 (재시도 포함)
    const result = await tripleStore(fullData);
    
    if (!result.success) {
      secureLog.error(`❌ 저장 실패 (${result.savedCount}/4 저장소)`);
    }
    
    return result.success;
  } catch {
    return false;
  }
};

/**
 * 초기 포인트 데이터 생성
 */
export const createInitialPointsData = async (initialPoints: number = 2500): Promise<SecurePointsData> => {
  const deviceId = await getDeviceId();
  const now = Date.now();
  
  const data: Omit<SecurePointsData, 'integrity_hash'> = {
    balance: initialPoints,
    total_earned: initialPoints,
    total_spent: 0,
    ad_watches_total: 0,
    ad_watches_today: 0,
    last_ad_timestamp: 0,
    device_id: deviceId,
    created_at: now,
    updated_at: now,
  };
  
  const integrity_hash = await generateIntegrityHash(data);
  const fullData: SecurePointsData = { ...data, integrity_hash };
  
  // 저장
  await saveSecurePointsData(data);
  
  // 초기 트랜잭션 기록
  await addTransaction('init', initialPoints, initialPoints, {
    reason: '가입 축하 포인트',
  });
  
  return fullData;
};

// ==================== 광고 시청 기록 관리 ====================
/**
 * 광고 시청 기록 로드
 */
export const loadAdWatchHistory = async (): Promise<AdWatchRecord[]> => {
  try {
    const data = await SecureStore.getItemAsync(SECURE_KEYS.AD_HISTORY_BACKUP);
    if (data) {
      const decrypted = await decryptData(data);
      return JSON.parse(decrypted);
    }
    return [];
  } catch {
    return [];
  }
};

/**
 * 광고 시청 기록 저장
 */
export const saveAdWatchHistory = async (records: AdWatchRecord[]): Promise<void> => {
  try {
    // 최근 100개만 유지
    const trimmed = records.slice(-100);
    const encrypted = await encryptData(JSON.stringify(trimmed));
    await SecureStore.setItemAsync(SECURE_KEYS.AD_HISTORY_BACKUP, encrypted);
  } catch {
    // 저장 실패는 무시
  }
};

/**
 * 광고 시청 기록 추가
 */
export const recordAdWatch = async (points_earned: number, tx_hash: string): Promise<void> => {
  const records = await loadAdWatchHistory();
  records.push({
    timestamp: Date.now(),
    points_earned,
    tx_hash,
  });
  await saveAdWatchHistory(records);
};

// ==================== 이상 탐지 시스템 ====================
/**
 * 광고 시청 패턴 검증
 */
export const validateAdWatchPattern = async (lastAdTimestamp: number): Promise<{
  allowed: boolean;
  reason?: string;
  cooldown_ms?: number;
}> => {
  const now = Date.now();
  const records = await loadAdWatchHistory();
  
  // 1. 최소 간격 검사 (5초)
  if (lastAdTimestamp > 0 && now - lastAdTimestamp < SECURITY_CONFIG.MIN_AD_INTERVAL_MS) {
    return {
      allowed: false,
      reason: '너무 빠른 광고 시청',
      cooldown_ms: SECURITY_CONFIG.MIN_AD_INTERVAL_MS - (now - lastAdTimestamp),
    };
  }
  
  // 2. 시간당 광고 수 검사
  const oneHourAgo = now - 60 * 60 * 1000;
  const hourlyAds = records.filter(r => r.timestamp > oneHourAgo).length;
  if (hourlyAds >= SECURITY_CONFIG.MAX_HOURLY_ADS) {
    return {
      allowed: false,
      reason: '시간당 광고 한도 초과',
      cooldown_ms: records[records.length - SECURITY_CONFIG.MAX_HOURLY_ADS]?.timestamp 
        ? (records[records.length - SECURITY_CONFIG.MAX_HOURLY_ADS].timestamp + 60 * 60 * 1000) - now 
        : 60 * 60 * 1000,
    };
  }
  
  // 3. 일일 광고 수 검사
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  const dailyAds = records.filter(r => r.timestamp > todayStart).length;
  if (dailyAds >= SECURITY_CONFIG.MAX_DAILY_ADS) {
    return {
      allowed: false,
      reason: '일일 광고 한도 초과',
    };
  }
  
  return { allowed: true };
};

/**
 * 포인트 변동 검증
 */
export const validatePointChange = (
  currentBalance: number,
  newBalance: number,
  expectedChange: number
): boolean => {
  // 실제 변동량 계산
  const actualChange = newBalance - currentBalance;
  
  // 예상 변동량과 일치하는지 확인
  if (actualChange !== expectedChange) {
    return false;
  }
  
  // 음수 잔액 방지
  if (newBalance < 0) {
    return false;
  }
  
  // 최대 포인트 제한
  if (newBalance > SECURITY_CONFIG.MAX_POINTS) {
    return false;
  }
  
  // 비정상적으로 큰 포인트 증가 감지
  if (expectedChange > SECURITY_CONFIG.SUSPICIOUS_POINT_JUMP && expectedChange > 0) {
    secureLog.warn(`⚠️ 의심스러운 포인트 증가: ${expectedChange}`);
    // 여기서는 허용하지만 로그 기록
  }
  
  return true;
};

// ==================== 보안 검사 ====================
/**
 * 전체 보안 검사 실행
 */
export const runSecurityCheck = async (): Promise<SecurityCheckResult> => {
  const issues: string[] = [];
  
  try {
    // 1. 트랜잭션 체인 검증
    const chainResult = await verifyTransactionChain();
    if (!chainResult.valid) {
      issues.push(`트랜잭션 체인 손상 (인덱스: ${chainResult.invalidIndex})`);
    }
    
    // 2. 포인트 데이터 무결성 검증
    const pointsData = await loadSecurePointsData();
    if (!pointsData) {
      issues.push('포인트 데이터를 로드할 수 없음');
      return { is_valid: false, issues };
    }
    
    // 3. 기기 ID 검증
    const currentDeviceId = await getDeviceId();
    if (pointsData.device_id !== currentDeviceId) {
      issues.push('기기 ID 불일치');
    }
    
    // 4. 포인트 범위 검증
    if (pointsData.balance < 0 || pointsData.balance > SECURITY_CONFIG.MAX_POINTS) {
      issues.push('포인트 범위 이상');
    }
    
    // 5. 총 적립/사용 검증
    const calculatedBalance = pointsData.total_earned - pointsData.total_spent;
    if (Math.abs(calculatedBalance - pointsData.balance) > 1) { // 반올림 오차 허용
      issues.push('포인트 계산 불일치');
    }
    
    // 6. 광고 시청 수 검증
    const adHistory = await loadAdWatchHistory();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dailyAds = adHistory.filter(r => r.timestamp > today.getTime()).length;
    
    if (dailyAds > SECURITY_CONFIG.MAX_DAILY_ADS) {
      issues.push('일일 광고 한도 초과');
    }
    
    return {
      is_valid: issues.length === 0,
      issues,
      recovered_data: pointsData,
    };
  } catch {
    issues.push('보안 검사 중 오류 발생');
    return { is_valid: false, issues };
  }
};

/**
 * 마스터 해시 업데이트 (일일 체크포인트)
 */
export const updateMasterHash = async (pointsData: SecurePointsData): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const hashData = `${today}:${pointsData.balance}:${pointsData.ad_watches_total}:${pointsData.device_id}`;
    const masterHash = await sha256(hashData);
    
    await SecureStore.setItemAsync(SECURE_KEYS.MASTER_HASH, `${today}:${masterHash}`);
  } catch {
    // 실패 무시
  }
};

/**
 * 일일 상태 초기화 (자정에 호출)
 */
export const resetDailyStats = async (currentData: SecurePointsData): Promise<SecurePointsData> => {
  const updatedData = {
    ...currentData,
    ad_watches_today: 0,
  };
  
  await saveSecurePointsData(updatedData);
  await updateMasterHash(updatedData);
  
  return { ...updatedData, integrity_hash: currentData.integrity_hash, updated_at: Date.now() };
};

// ==================== 내보내기 ====================
export const PointsSecurityService = {
  // 기기 관리
  getDeviceId,
  
  // 포인트 데이터
  loadSecurePointsData,
  saveSecurePointsData,
  createInitialPointsData,
  
  // 트랜잭션
  addTransaction,
  verifyTransactionChain,
  
  // 광고 관리
  loadAdWatchHistory,
  saveAdWatchHistory,
  recordAdWatch,
  validateAdWatchPattern,
  
  // 검증
  validatePointChange,
  runSecurityCheck,
  
  // 일일 관리
  resetDailyStats,
  updateMasterHash,
};

export default PointsSecurityService;
