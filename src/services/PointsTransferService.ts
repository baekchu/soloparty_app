/**
 * ==================== [DEPRECATED] 포인트 인계 서비스 ====================
 * 
 * ⚠️ 이 파일은 더 이상 사용되지 않습니다.
 * → PointsAutoSyncService.ts 로 대체됨 (자동 동기화 방식)
 * → 수동 백업 코드 → 자동 백업/복원으로 전환
 * 
 * 향후 서버 장애 시 비상 폴백 용도로 보존
 * 
 * === 기존 동작 방식 ===
 * 1. 백업 코드 생성: 8자리 영숫자 코드 + 데이터 암호화
 * 2. 코드 입력으로 복원: 암호화된 데이터 해독 후 포인트 병합
 * 3. 1회성 사용: 복원 후 코드 무효화
 * 
 * ========================================================================
 */

import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../utils/asyncStorageManager';
import { encryptData, decryptData, secureLog } from '../utils/secureStorage';
import PointsSecurityService, { SecurePointsData, Transaction } from './PointsSecurityService';

// ==================== 상수 ====================
const TRANSFER_KEYS = {
  BACKUP_CODE: '@sp_backup_code_v1',
  BACKUP_DATA: '@sp_backup_data_v1',
  TRANSFER_HISTORY: '@sp_transfer_history_v1',
  USED_CODES: '@sp_used_codes_v1',
} as const;

const TRANSFER_CONFIG = {
  CODE_LENGTH: 8,
  CODE_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // 혼동 문자 제외
  CODE_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000, // 7일
  MAX_USED_CODES: 100,
  MAX_TRANSFER_HISTORY: 50,
} as const;

// ==================== 타입 ====================
export interface TransferBackup {
  /** 백업 코드 (8자리) */
  code: string;
  /** 암호화된 포인트 데이터 */
  encryptedData: string;
  /** 포인트 잔액 (표시용) */
  balance: number;
  /** 총 적립 포인트 */
  totalEarned: number;
  /** 총 사용 포인트 */
  totalSpent: number;
  /** 광고 시청 총 횟수 */
  adWatchesTotal: number;
  /** 트랜잭션 수 */
  transactionCount: number;
  /** 생성 시각 */
  createdAt: number;
  /** 만료 시각 */
  expiresAt: number;
  /** 원본 기기 ID */
  sourceDeviceId: string;
  /** 체크섬 (무결성 검증) */
  checksum: string;
}

export interface TransferResult {
  success: boolean;
  message: string;
  restoredBalance?: number;
  mergedBalance?: number;
}

interface TransferHistoryEntry {
  type: 'backup' | 'restore';
  code: string;
  balance: number;
  timestamp: number;
  deviceId: string;
}

// ==================== 유틸리티 ====================

/** 백업 코드 생성 (8자리) */
const generateBackupCode = async (): Promise<string> => {
  try {
    const bytes = await Crypto.getRandomBytesAsync(TRANSFER_CONFIG.CODE_LENGTH);
    return Array.from(bytes)
      .map(b => TRANSFER_CONFIG.CODE_CHARS[b % TRANSFER_CONFIG.CODE_CHARS.length])
      .join('');
  } catch {
    // 폴백: Math.random 기반
    let code = '';
    for (let i = 0; i < TRANSFER_CONFIG.CODE_LENGTH; i++) {
      code += TRANSFER_CONFIG.CODE_CHARS[Math.floor(Math.random() * TRANSFER_CONFIG.CODE_CHARS.length)];
    }
    return code;
  }
};

/** 체크섬 생성 */
const generateChecksum = async (data: string): Promise<string> => {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `transfer_${data}_soloparty_2026`
  );
};

/** 코드 형식 검증 */
const isValidCodeFormat = (code: string): boolean => {
  if (!code || typeof code !== 'string') return false;
  const cleaned = code.trim().toUpperCase();
  if (cleaned.length !== TRANSFER_CONFIG.CODE_LENGTH) return false;
  return /^[A-Z0-9]+$/.test(cleaned);
};

/** 사용된 코드 저장 */
const markCodeAsUsed = async (code: string): Promise<void> => {
  try {
    const raw = await safeGetItem(TRANSFER_KEYS.USED_CODES);
    const usedCodes: string[] = raw ? JSON.parse(raw) : [];
    usedCodes.unshift(code.toUpperCase());
    // 최근 N개만 유지
    await safeSetItem(
      TRANSFER_KEYS.USED_CODES,
      JSON.stringify(usedCodes.slice(0, TRANSFER_CONFIG.MAX_USED_CODES))
    );
  } catch { /* 무시 */ }
};

/** 코드가 이미 사용되었는지 확인 */
const isCodeUsed = async (code: string): Promise<boolean> => {
  try {
    const raw = await safeGetItem(TRANSFER_KEYS.USED_CODES);
    if (!raw) return false;
    const usedCodes: string[] = JSON.parse(raw);
    return usedCodes.includes(code.toUpperCase());
  } catch {
    return false;
  }
};

/** 인계 내역 저장 */
const saveTransferHistory = async (entry: TransferHistoryEntry): Promise<void> => {
  try {
    const raw = await safeGetItem(TRANSFER_KEYS.TRANSFER_HISTORY);
    const history: TransferHistoryEntry[] = raw ? JSON.parse(raw) : [];
    history.unshift(entry);
    await safeSetItem(
      TRANSFER_KEYS.TRANSFER_HISTORY,
      JSON.stringify(history.slice(0, TRANSFER_CONFIG.MAX_TRANSFER_HISTORY))
    );
  } catch { /* 무시 */ }
};

// ==================== 메인 서비스 ====================
export const PointsTransferService = {

  /**
   * 백업 코드 생성 (현재 기기의 포인트 데이터를 백업)
   * 
   * @returns 백업 코드 또는 null
   */
  async createBackupCode(): Promise<TransferBackup | null> {
    try {
      // 1. 현재 포인트 데이터 로드
      const pointsData = await PointsSecurityService.loadSecurePointsData();
      if (!pointsData) {
        secureLog.warn('⚠️ 포인트 데이터 없음');
        return null;
      }

      // 2. 백업 코드 생성
      const code = await generateBackupCode();
      const deviceId = await PointsSecurityService.getDeviceId();

      // 3. 포인트 데이터를 JSON으로 직렬화
      const dataToBackup = {
        balance: pointsData.balance,
        total_earned: pointsData.total_earned,
        total_spent: pointsData.total_spent,
        ad_watches_total: pointsData.ad_watches_total,
        source_device: deviceId,
        created_at: pointsData.created_at,
        backup_timestamp: Date.now(),
      };

      const jsonData = JSON.stringify(dataToBackup);

      // 4. 코드를 키로 사용해서 데이터 암호화
      const encryptedData = await encryptData(jsonData);

      // 5. 체크섬 생성
      const checksum = await generateChecksum(jsonData);

      // 6. 백업 객체 생성
      const backup: TransferBackup = {
        code,
        encryptedData,
        balance: pointsData.balance,
        totalEarned: pointsData.total_earned,
        totalSpent: pointsData.total_spent,
        adWatchesTotal: pointsData.ad_watches_total,
        transactionCount: 0,
        createdAt: Date.now(),
        expiresAt: Date.now() + TRANSFER_CONFIG.CODE_EXPIRY_MS,
        sourceDeviceId: deviceId,
        checksum,
      };

      // 7. 로컬에 백업 저장 (복원용)
      await safeSetItem(TRANSFER_KEYS.BACKUP_CODE, code);
      await safeSetItem(TRANSFER_KEYS.BACKUP_DATA, await encryptData(JSON.stringify(backup)));

      // 8. 인계 내역 기록
      await saveTransferHistory({
        type: 'backup',
        code,
        balance: pointsData.balance,
        timestamp: Date.now(),
        deviceId,
      });

      secureLog.info('✅ 백업 코드 생성 완료');
      return backup;
    } catch (error) {
      secureLog.error('❌ 백업 코드 생성 실패');
      return null;
    }
  },

  /**
   * 백업 코드로 포인트 복원 (새 기기에서 호출)
   * 
   * @param inputCode 사용자가 입력한 백업 코드
   * @param currentBalance 현재 기기의 포인트 잔액
   * @returns 복원 결과
   */
  async restoreFromCode(inputCode: string, currentBalance: number): Promise<TransferResult> {
    try {
      // 1. 코드 형식 검증
      if (!isValidCodeFormat(inputCode)) {
        return { success: false, message: '올바른 형식의 코드를 입력해주세요.\n(영문 대문자 + 숫자 8자리)' };
      }

      const cleanCode = inputCode.trim().toUpperCase();

      // 2. 이미 사용된 코드인지 확인
      if (await isCodeUsed(cleanCode)) {
        return { success: false, message: '이미 사용된 코드입니다.\n각 코드는 1회만 사용 가능합니다.' };
      }

      // 3. 로컬 백업 데이터에서 코드 매칭 확인
      const backupRaw = await safeGetItem(TRANSFER_KEYS.BACKUP_DATA);
      if (!backupRaw) {
        return { 
          success: false, 
          message: '백업 데이터를 찾을 수 없습니다.\n동일한 기기에서만 복원 가능합니다.\n\n서버 연동 후 기기 간 이전이 가능합니다.' 
        };
      }

      // 4. 백업 데이터 복호화
      let backup: TransferBackup;
      try {
        const decrypted = await decryptData(backupRaw);
        backup = JSON.parse(decrypted);
      } catch {
        return { success: false, message: '백업 데이터가 손상되었습니다.' };
      }

      // 5. 코드 일치 확인
      if (backup.code !== cleanCode) {
        return { success: false, message: '코드가 일치하지 않습니다.\n정확한 코드를 입력해주세요.' };
      }

      // 6. 만료 확인
      if (Date.now() > backup.expiresAt) {
        return { success: false, message: '만료된 코드입니다.\n새 백업 코드를 생성해주세요.' };
      }

      // 7. 원본 데이터 복호화
      let restoredData: {
        balance: number;
        total_earned: number;
        total_spent: number;
        ad_watches_total: number;
      };

      try {
        const decryptedData = await decryptData(backup.encryptedData);
        restoredData = JSON.parse(decryptedData);
      } catch {
        return { success: false, message: '포인트 데이터 복원에 실패했습니다.' };
      }

      // 8. 데이터 유효성 검증
      if (typeof restoredData.balance !== 'number' || 
          restoredData.balance < 0 || 
          restoredData.balance > 1000000) {
        return { success: false, message: '데이터 검증에 실패했습니다.' };
      }

      // 9. 포인트 병합 (현재 잔액 + 복원 잔액)
      const mergedBalance = currentBalance + restoredData.balance;
      const deviceId = await PointsSecurityService.getDeviceId();

      const newData: Omit<SecurePointsData, 'integrity_hash' | 'updated_at'> = {
        balance: mergedBalance,
        total_earned: restoredData.total_earned + currentBalance,
        total_spent: restoredData.total_spent,
        ad_watches_total: restoredData.ad_watches_total,
        ad_watches_today: 0,
        last_ad_timestamp: 0,
        device_id: deviceId,
        created_at: Date.now(),
      };

      // 10. 저장
      const saved = await PointsSecurityService.saveSecurePointsData(newData);
      if (!saved) {
        return { success: false, message: '포인트 저장에 실패했습니다.\n다시 시도해주세요.' };
      }

      // 11. 트랜잭션 기록
      await PointsSecurityService.addTransaction('restore', restoredData.balance, mergedBalance, {
        reason: '백업 코드 복원',
        source_code: cleanCode.slice(0, 3) + '***',
        restored_balance: restoredData.balance,
      });

      // 12. 코드 사용 처리
      await markCodeAsUsed(cleanCode);

      // 13. 인계 내역 기록
      await saveTransferHistory({
        type: 'restore',
        code: cleanCode,
        balance: restoredData.balance,
        timestamp: Date.now(),
        deviceId,
      });

      secureLog.info('✅ 포인트 복원 완료');

      return {
        success: true,
        message: `포인트가 성공적으로 복원되었습니다!`,
        restoredBalance: restoredData.balance,
        mergedBalance,
      };
    } catch (error) {
      secureLog.error('❌ 포인트 복원 실패');
      return { success: false, message: '복원 중 오류가 발생했습니다.' };
    }
  },

  /**
   * 현재 저장된 백업 코드 조회
   */
  async getCurrentBackupCode(): Promise<string | null> {
    try {
      return await safeGetItem(TRANSFER_KEYS.BACKUP_CODE);
    } catch {
      return null;
    }
  },

  /**
   * 인계 내역 조회
   */
  async getTransferHistory(): Promise<TransferHistoryEntry[]> {
    try {
      const raw = await safeGetItem(TRANSFER_KEYS.TRANSFER_HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * 향후 서버(Firebase/Supabase) 연동 시 사용할 포인트 전송 함수
   * 
   * === 활성화 방법 ===
   * 1. Firebase 프로젝트 생성 + expo-firebase 설정
   * 2. 아래 주석 해제 + API_URL 설정
   * 3. 서버에 /api/points/transfer 엔드포인트 구현
   */
  async transferToServer(
    _userId: string,
    _authToken: string,
  ): Promise<TransferResult> {
    // === 서버 연동 시 아래 주석 해제 ===
    // try {
    //   const pointsData = await PointsSecurityService.loadSecurePointsData();
    //   if (!pointsData) return { success: false, message: '데이터 없음' };
    //   
    //   const response = await fetch(`${API_URL}/api/points/transfer`, {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //       'Authorization': `Bearer ${authToken}`,
    //     },
    //     body: JSON.stringify({
    //       userId,
    //       balance: pointsData.balance,
    //       totalEarned: pointsData.total_earned,
    //       totalSpent: pointsData.total_spent,
    //       deviceId: pointsData.device_id,
    //     }),
    //   });
    //   
    //   const result = await response.json();
    //   if (result.success) {
    //     // 서버 잔액으로 로컬 업데이트
    //     const newData = { ...pointsData, balance: result.serverBalance };
    //     await PointsSecurityService.saveSecurePointsData(newData);
    //     return { success: true, message: '서버 동기화 완료', mergedBalance: result.serverBalance };
    //   }
    //   return { success: false, message: result.message || '서버 오류' };
    // } catch {
    //   return { success: false, message: '네트워크 오류' };
    // }

    return { 
      success: false, 
      message: '서버 연동 준비 중입니다.\n백업 코드를 사용하여 포인트를 인계해주세요.' 
    };
  },
};

export default PointsTransferService;
