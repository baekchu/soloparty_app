/**
 * ==================== 포인트 자동 동기화 서비스 (v2 강화) ====================
 * 
 * 포인트를 자동으로 클라우드에 백업/복원하는 시스템
 * 사용자가 아무것도 하지 않아도 기기 변경 시 자동 복원
 * 
 * === 현재 (로컬 전용) ===
 * - SecureStore + AsyncStorage 이중 백업
 * - 기기 UUID 기반 자동 식별
 * - 앱 재설치 시 AsyncStorage 백업에서 자동 복원 시도
 * - 데이터 버전 관리 (향후 마이그레이션 대비)
 * 
 * === 향후 (Firebase/Supabase 연동 시) ===
 * - CLOUD_ENABLED = true 로 전환
 * - onUserLogin(userId) 호출 → 로컬+클라우드 자동 병합
 * - 소셜 로그인 연동 → 계정 기반 자동 동기화
 * - 실시간 클라우드 백업
 * - 기기 변경 시 자동 인계 (로컬 데이터 절대 삭제 안함)
 * 
 * ========================================================================
 */

import * as SecureStore from 'expo-secure-store';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';
import { secureLog } from '../utils/secureStorage';
import PointsSecurityService, { SecurePointsData } from './PointsSecurityService';

// ==================== 설정 ====================
const SYNC_CONFIG = {
  /** 클라우드 동기화 활성화 (Firebase/Supabase 연동 시 true) */
  CLOUD_ENABLED: false,
  /** 자동 백업 간격 (ms) - 포인트 변경 시마다 + 5분 주기 */
  AUTO_BACKUP_INTERVAL: 5 * 60 * 1000,
  /** 로컬 백업 키 */
  LOCAL_BACKUP_KEY: '@sp_auto_backup_v2',
  SECURE_BACKUP_KEY: 'sp_auto_backup_secure_v2',
  /** 마지막 동기화 시간 키 */
  LAST_SYNC_KEY: '@sp_last_sync_v2',
  /** 마이그레이션 상태 키 */
  MIGRATION_STATUS_KEY: '@sp_migration_status_v1',
  /** 사용자 ID 키 (Firebase 로그인 후 저장) */
  USER_ID_KEY: 'sp_user_id_v1',
  /** 데이터 버전 (스키마 변경 시 증가) */
  DATA_VERSION: 2,
  /** 최소 백업 간격 (중복 백업 방지) */
  MIN_BACKUP_INTERVAL_MS: 3000,
} as const;

// ==================== 타입 ====================
interface AutoBackupData {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  adWatchesTotal: number;
  transactionCount: number;
  lastUpdated: number;
  version: number;
  /** 원본 기기 ID (마이그레이션 추적용) */
  sourceDeviceId?: string;
}

interface MigrationStatus {
  /** 마이그레이션 완료 여부 */
  completed: boolean;
  /** 마이그레이션 시간 */
  migratedAt: number;
  /** 원본 기기 ID */
  fromDeviceId: string;
  /** 대상 기기 ID */
  toDeviceId: string;
  /** 마이그레이션된 잔액 */
  migratedBalance: number;
}

// ==================== 서비스 ====================
class PointsAutoSyncService {
  private static syncTimer: ReturnType<typeof setInterval> | null = null;
  private static lastBackupTime: number = 0;
  private static isBackingUp: boolean = false;

  /**
   * 자동 동기화 시작 (앱 시작 시 호출)
   */
  static startAutoSync(): void {
    // 기존 타이머 정리
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    // 5분마다 자동 백업
    this.syncTimer = setInterval(() => {
      this.autoBackup().catch(() => {});
    }, SYNC_CONFIG.AUTO_BACKUP_INTERVAL);

    secureLog.info('포인트 자동 동기화 시작됨');
  }

  /**
   * 자동 동기화 중지 (앱 종료 시)
   */
  static stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * 포인트 변경 시 자동 백업 (usePoints에서 호출)
   * - 중복 백업 방지 (3초 이내 재호출 무시)
   * - 동시 실행 방지 (뮤텍스)
   */
  static async autoBackup(): Promise<void> {
    // 중복 백업 방지
    const now = Date.now();
    if (now - this.lastBackupTime < SYNC_CONFIG.MIN_BACKUP_INTERVAL_MS) return;
    if (this.isBackingUp) return;
    
    this.isBackingUp = true;
    
    try {
      const secureData = await PointsSecurityService.loadSecurePointsData();
      if (!secureData) {
        this.isBackingUp = false;
        return;
      }

      const backupData: AutoBackupData = {
        balance: secureData.balance,
        totalEarned: secureData.total_earned,
        totalSpent: secureData.total_spent,
        adWatchesTotal: secureData.ad_watches_total,
        transactionCount: 0,
        lastUpdated: now,
        version: SYNC_CONFIG.DATA_VERSION,
        sourceDeviceId: secureData.device_id,
      };

      const dataStr = JSON.stringify(backupData);

      // 이중 백업: SecureStore + AsyncStorage
      await Promise.all([
        SecureStore.setItemAsync(SYNC_CONFIG.SECURE_BACKUP_KEY, dataStr).catch(() => {}),
        safeSetItem(SYNC_CONFIG.LOCAL_BACKUP_KEY, dataStr),
        safeSetItem(SYNC_CONFIG.LAST_SYNC_KEY, String(now)),
      ]);

      this.lastBackupTime = now;

      // 향후 클라우드 동기화
      if (SYNC_CONFIG.CLOUD_ENABLED) {
        await this.syncToCloud(backupData);
      }
    } catch {
      secureLog.warn('자동 백업 실패');
    } finally {
      this.isBackingUp = false;
    }
  }

  /**
   * 자동 복원 시도 (앱 시작 시, 데이터 없을 때 호출)
   * @returns 복원된 잔액 또는 null
   */
  static async tryAutoRestore(): Promise<number | null> {
    try {
      // 1. SecureStore에서 백업 확인
      let backupStr = await SecureStore.getItemAsync(SYNC_CONFIG.SECURE_BACKUP_KEY).catch(() => null);
      
      // 2. AsyncStorage 폴백
      if (!backupStr) {
        backupStr = await safeGetItem(SYNC_CONFIG.LOCAL_BACKUP_KEY);
      }

      // 3. 향후 클라우드에서 복원
      if (!backupStr && SYNC_CONFIG.CLOUD_ENABLED) {
        const cloudData = await this.syncFromCloud();
        if (cloudData) {
          backupStr = JSON.stringify(cloudData);
        }
      }

      if (!backupStr) return null;

      const backup: AutoBackupData = JSON.parse(backupStr);
      
      // 유효성 검증
      if (backup.balance == null || backup.balance < 0) return null;
      if (backup.balance > 1000000) return null; // MAX_POINTS 제한

      // 마이그레이션 상태 기록
      const currentDeviceId = await PointsSecurityService.getDeviceId();
      if (backup.sourceDeviceId && backup.sourceDeviceId !== currentDeviceId) {
        await this.saveMigrationStatus({
          completed: true,
          migratedAt: Date.now(),
          fromDeviceId: backup.sourceDeviceId,
          toDeviceId: currentDeviceId,
          migratedBalance: backup.balance,
        });
      }

      secureLog.info('자동 복원 성공');
      return backup.balance;
    } catch {
      secureLog.warn('자동 복원 실패');
      return null;
    }
  }

  /**
   * 마지막 동기화 시간 조회
   */
  static async getLastSyncTime(): Promise<number | null> {
    try {
      const timeStr = await safeGetItem(SYNC_CONFIG.LAST_SYNC_KEY);
      return timeStr ? parseInt(timeStr, 10) : null;
    } catch {
      return null;
    }
  }

  // ==================== Firebase 연동 준비 ====================

  /**
   * 사용자 로그인 시 호출 — 로컬 + 클라우드 포인트 자동 병합
   * 
   * 사용법 (Firebase 연동 후):
   * ```
   * firebase.auth().onAuthStateChanged(async (user) => {
   *   if (user) {
   *     await PointsAutoSyncService.onUserLogin(user.uid);
   *   }
   * });
   * ```
   * 
   * 병합 규칙:
   * - 로컬에만 데이터: 클라우드에 업로드
   * - 클라우드에만 데이터: 로컬에 다운로드
   * - 양쪽 다 있음: 더 높은 잔액 유지 (포인트 손실 방지)
   * - 로컬 데이터는 절대 삭제하지 않음 (안전장치)
   */
  static async onUserLogin(userId: string): Promise<{
    success: boolean;
    finalBalance: number;
    source: 'local' | 'cloud' | 'merged';
  }> {
    try {
      // 1. 사용자 ID 저장
      await SecureStore.setItemAsync(SYNC_CONFIG.USER_ID_KEY, userId).catch(() => {});

      // 2. 로컬 데이터 로드
      const localData = await PointsSecurityService.loadSecurePointsData();
      const localBalance = localData?.balance ?? 0;

      // 3. 클라우드 데이터 로드 (CLOUD_ENABLED일 때만)
      let cloudBalance = 0;
      let hasCloudData = false;

      if (SYNC_CONFIG.CLOUD_ENABLED) {
        const cloudData = await this.syncFromCloud();
        if (cloudData) {
          cloudBalance = cloudData.balance;
          hasCloudData = true;
        }
      }

      // 4. 병합 (더 높은 잔액 유지 — 포인트 손실 절대 방지)
      let finalBalance: number;
      let source: 'local' | 'cloud' | 'merged';

      if (!hasCloudData) {
        // 클라우드에 데이터 없음 → 로컬 데이터 업로드
        finalBalance = localBalance;
        source = 'local';
      } else if (!localData || localBalance === 0) {
        // 로컬에 데이터 없음 → 클라우드 데이터 다운로드
        finalBalance = cloudBalance;
        source = 'cloud';
      } else {
        // 양쪽 다 있음 → 더 높은 값 유지
        finalBalance = Math.max(localBalance, cloudBalance);
        source = 'merged';
      }

      // 5. 최종 데이터 저장 (로컬 + 클라우드)
      if (localData && finalBalance !== localBalance) {
        // 로컬 데이터 업데이트 필요
        await PointsSecurityService.saveSecurePointsData({
          ...localData,
          balance: finalBalance,
          total_earned: Math.max(localData.total_earned, finalBalance),
        });
      }

      if (SYNC_CONFIG.CLOUD_ENABLED) {
        await this.syncToCloud({
          balance: finalBalance,
          totalEarned: localData?.total_earned ?? finalBalance,
          totalSpent: localData?.total_spent ?? 0,
          adWatchesTotal: localData?.ad_watches_total ?? 0,
          transactionCount: 0,
          lastUpdated: Date.now(),
          version: SYNC_CONFIG.DATA_VERSION,
          sourceDeviceId: localData?.device_id,
        });
      }

      secureLog.info(`사용자 로그인 포인트 동기화 완료: ${source}, ${finalBalance}P`);

      return { success: true, finalBalance, source };
    } catch (error) {
      secureLog.error('사용자 로그인 동기화 실패');
      return { success: false, finalBalance: 0, source: 'local' };
    }
  }

  /**
   * 사용자 로그아웃 시 호출 — 로컬 데이터 유지 (절대 삭제 안함)
   */
  static async onUserLogout(): Promise<void> {
    try {
      // 로그아웃 전 최종 백업
      await this.autoBackup();
      // 사용자 ID만 제거 (포인트 데이터는 유지)
      await SecureStore.deleteItemAsync(SYNC_CONFIG.USER_ID_KEY).catch(() => {});
      secureLog.info('사용자 로그아웃 - 포인트 데이터 유지됨');
    } catch {
      // 실패해도 데이터는 유지
    }
  }

  /**
   * 현재 로그인된 사용자 ID 조회
   */
  static async getCurrentUserId(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(SYNC_CONFIG.USER_ID_KEY);
    } catch {
      return null;
    }
  }

  /**
   * 마이그레이션 상태 저장
   */
  private static async saveMigrationStatus(status: MigrationStatus): Promise<void> {
    try {
      await safeSetItem(SYNC_CONFIG.MIGRATION_STATUS_KEY, JSON.stringify(status));
    } catch {
      // 실패 무시
    }
  }

  /**
   * 마이그레이션 상태 조회 (디버그/관리용)
   */
  static async getMigrationStatus(): Promise<MigrationStatus | null> {
    try {
      const str = await safeGetItem(SYNC_CONFIG.MIGRATION_STATUS_KEY);
      return str ? JSON.parse(str) : null;
    } catch {
      return null;
    }
  }

  // ==================== 클라우드 동기화 (향후 활성화) ====================
  
  /**
   * 클라우드에 포인트 업로드
   * Firebase/Supabase 연동 시 구현
   * 
   * 구현 예시 (Firebase):
   * ```
   * private static async syncToCloud(data: AutoBackupData): Promise<void> {
   *   const userId = await this.getCurrentUserId();
   *   if (!userId) return;
   *   
   *   await firestore().collection('user_points').doc(userId).set({
   *     balance: data.balance,
   *     totalEarned: data.totalEarned,
   *     totalSpent: data.totalSpent,
   *     adWatchesTotal: data.adWatchesTotal,
   *     lastUpdated: firestore.FieldValue.serverTimestamp(),
   *     deviceId: data.sourceDeviceId,
   *     version: data.version,
   *   }, { merge: true });
   * }
   * ```
   */
  private static async syncToCloud(_data: AutoBackupData): Promise<void> {
    // TODO: Firebase Firestore 연동 시 위 주석의 코드로 교체
  }

  /**
   * 클라우드에서 포인트 다운로드
   * Firebase/Supabase 연동 시 구현
   * 
   * 구현 예시 (Firebase):
   * ```
   * private static async syncFromCloud(): Promise<AutoBackupData | null> {
   *   const userId = await this.getCurrentUserId();
   *   if (!userId) return null;
   *   
   *   const doc = await firestore().collection('user_points').doc(userId).get();
   *   if (!doc.exists) return null;
   *   
   *   const d = doc.data()!;
   *   return {
   *     balance: d.balance,
   *     totalEarned: d.totalEarned,
   *     totalSpent: d.totalSpent,
   *     adWatchesTotal: d.adWatchesTotal,
   *     transactionCount: 0,
   *     lastUpdated: d.lastUpdated?.toMillis?.() ?? Date.now(),
   *     version: d.version ?? 1,
   *     sourceDeviceId: d.deviceId,
   *   };
   * }
   * ```
   */
  private static async syncFromCloud(): Promise<AutoBackupData | null> {
    // TODO: Firebase Firestore 연동 시 위 주석의 코드로 교체
    return null;
  }
}

export default PointsAutoSyncService;
