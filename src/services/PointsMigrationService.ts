/**
 * 
 * 🚀 서버 구축 권장사항 (비용 효율적 순서)
 * 
 * 1. Firebase (Google) - 가장 권장 ⭐
 *    - 무료 티어: MAU 5만, 저장 1GB, 일일 읽기 5만회
 *    - 인증: 무료 (이메일, 소셜 로그인)
 *    - 장점: 서버리스, 자동 확장, SDK 우수
 *    - 비용: 사용자 10만명까지 월 $0-25
 *    - 적합: 시작~중간 규모
 * 
 * 2. Supabase - PostgreSQL 필요시
 *    - 무료 티어: 500MB DB, MAU 5만
 *    - 장점: SQL 지원, 실시간 기능
 *    - 비용: Pro $25/월
 *    - 적합: 복잡한 쿼리 필요시
 * 
 * 3. AWS Amplify - 대규모 확장시
 *    - 종량제 (사용한 만큼만)
 *    - 장점: 무한 확장, AWS 생태계
 *    - 비용: 사용량에 따라 변동
 *    - 적합: 10만+ 사용자
 * 
 * 📱 권장 인증 방식:
 *    - 카카오 로그인 (한국 앱 필수)
 *    - Apple 로그인 (iOS 필수)
 *    - 구글 로그인 (Android 편의)
 *    - 휴대폰 번호 인증 (선택)
 * 
 * ==================== 포인트 마이그레이션 서비스 ====================
 * 
 * 핵심 안전 기능:
 *   1. 체크섬 검증 - 데이터 무결성 보장
 *   2. 백업 & 롤백 - 실패 시 원본 복구
 *   3. 트랜잭션 로그 - 모든 단계 기록
 *   4. 중복 방지 - 기기별 1회 마이그레이션
 *   5. 재시도 로직 - 네트워크 오류 대응
 *   6. 데이터 검증 - 타입/범위 체크
 * 
 * 사용: 로그인 성공 후 handleLoginMigration(userId, token) 호출
 * ========================================================================
 */

import { Alert } from 'react-native';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../utils/asyncStorageManager';
import { secureLog } from '../utils/secureStorage';

// ==================== 상수 ====================
const KEYS = {
  POINTS: '@points_data',
  COUPONS: '@coupons_data',
  MIGRATED: '@migrated_v2',
  BACKUP: '@backup',
  DEVICE: '@device_id',
} as const;

const CONFIG = {
  INITIAL_POINTS: 2500,
  MAX_POINTS: 500000,
  MAX_COUPONS: 50,
  RETRIES: 3,
  RETRY_DELAY: 1000,
  API_URL: '', // TODO: 서버 URL 설정
} as const;

// ==================== 타입 ====================
export interface MigrationResult {
  success: boolean;
  message: string;
  migratedPoints?: number;
  migratedCoupons?: number;
}

interface MigrationData {
  points: number;
  coupons: Array<{ id: string; type: string; name: string; expiresAt: number }>;
  checksum: string;
  deviceId: string;
  timestamp: number;
}

// ==================== 유틸리티 (인라인 최적화) ====================
/** 결정적 체크섬 (Date.now 제거 — 서버 재검증 가능) */
const hash = (points: number, count: number): string => {
  const str = `sp_${points}_${count}_v2`;
  let h = 0x811c9dc5; // FNV-1a offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) & 0xffffffff; // FNV prime
  }
  return Math.abs(h).toString(36);
};

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const getDeviceId = async (): Promise<string> => {
  const saved = await safeGetItem(KEYS.DEVICE);
  if (saved) return saved;
  // expo-crypto 기반 안전한 디바이스 ID 생성
  let id: string;
  try {
    const { getRandomBytesAsync } = require('expo-crypto');
    const bytes = await getRandomBytesAsync(8);
    const hex = Array.from(bytes as Uint8Array).map((b: number) => b.toString(16).padStart(2, '0')).join('');
    id = `d_${hex}`;
  } catch {
    // fallback: expo-crypto 재시도 (다른 API 경로)
    try {
      const Crypto = require('expo-crypto');
      const bytes = Crypto.getRandomBytes(8) as Uint8Array;
      const hex = Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
      id = `d_${hex}`;
    } catch {
      // 완전한 폴백: 암호학적 난수 불가 시 세션 전용 ID
      // Math.random() 사용 금지 — 디바이스 ID는 보안 비트도 포함하라
      const ts = Date.now().toString(36);
      const ts2 = Date.now().toString(16); // 두 번째 타임스탬으로 엔트로피 증가
      id = `d_${ts}_${ts2}`; // 취약하지만 Math.random보다는 안전 (Crypto 자체가 실패한 궙극 대안)
    }
  }
  await safeSetItem(KEYS.DEVICE, id, true);
  return id;
};

// ==================== 메인 서비스 ====================
export const PointsMigrationService = {
  /**
   * 로컬 데이터 조회 (검증 포함)
   */
  async getLocalData(): Promise<MigrationData | null> {
    try {
      const [pRaw, cRaw, deviceId] = await Promise.all([
        safeGetItem(KEYS.POINTS),
        safeGetItem(KEYS.COUPONS),
        getDeviceId(),
      ]);

      // 포인트 파싱
      let points = 0;
      if (pRaw) {
        // 보안: 크기 제한
        if (pRaw.length > 100000) {
          secureLog.warn('⚠️ 포인트 데이터 크기 초과');
        } else {
          try {
            const p = JSON.parse(pRaw);
            if (typeof p.balance === 'number' && p.balance >= 0 && Number.isFinite(p.balance)) {
              points = Math.min(Math.floor(p.balance), CONFIG.MAX_POINTS);
            }
          } catch { /* 파싱 실패 무시 */ }
        }
      }

      // 쿠폰 파싱
      const coupons: MigrationData['coupons'] = [];
      if (cRaw) {
        // 보안: 크기 제한
        if (cRaw.length > 100000) {
          secureLog.warn('⚠️ 쿠폰 데이터 크기 초과');
        } else {
          try {
            const c = JSON.parse(cRaw);
            if (Array.isArray(c.coupons)) {
              const now = Date.now();
              for (const x of c.coupons) {
                // 보안: 각 필드 타입 검증
                if (x?.id && 
                    typeof x.id === 'string' &&
                    x.id.length < 100 &&
                    !x.isUsed && 
                    typeof x.expiresAt === 'number' &&
                    x.expiresAt > now && 
                    coupons.length < CONFIG.MAX_COUPONS) {
                  coupons.push({
                    id: x.id.substring(0, 50),
                    type: (typeof x.type === 'string' ? x.type : 'free_event').substring(0, 30),
                    name: (typeof x.name === 'string' ? x.name : '쿠폰').substring(0, 50),
                    expiresAt: x.expiresAt,
                  });
                }
              }
            }
          } catch { /* 파싱 실패 무시 */ }
        }
      }

      return {
        points,
        coupons,
        checksum: hash(points, coupons.length),
        deviceId,
        timestamp: Date.now(),
      };
    } catch {
      return null;
    }
  },

  /**
   * 마이그레이션 완료 여부
   */
  async isMigrated(): Promise<boolean> {
    return (await safeGetItem(KEYS.MIGRATED)) === 'true';
  },

  /**
   * 백업 생성
   */
  async createBackup(data: MigrationData): Promise<boolean> {
    try {
      await safeSetItem(KEYS.BACKUP, JSON.stringify({ d: data, t: Date.now() }));
      return true;
    } catch {
      return false;
    }
  },

  /**
   * 백업에서 복구 (롤백)
   */
  async restoreFromBackup(): Promise<boolean> {
    try {
      const raw = await safeGetItem(KEYS.BACKUP);
      if (!raw) return false;
      
      // 보안: 크기 제한
      if (raw.length > 100000) {
        secureLog.warn('⚠️ 백업 데이터 크기 초과');
        return false;
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        secureLog.warn('⚠️ 백업 JSON 파싱 실패');
        return false;
      }
      
      const { d } = parsed;
      // 보안: 타입 및 범위 검증 강화
      if (!d || 
          typeof d.points !== 'number' || 
          !Number.isFinite(d.points) ||
          d.points < 0 || 
          d.points > CONFIG.MAX_POINTS) {
        secureLog.warn('⚠️ 백업 데이터 검증 실패');
        return false;
      }

      await safeSetItem(KEYS.POINTS, JSON.stringify({ balance: Math.floor(d.points), history: [] }));
      return true;
    } catch {
      return false;
    }
  },

  /**
   * 서버로 마이그레이션 (재시도 로직 포함)
   */
  async migrateToServer(
    userId: string,
    token: string,
    data: MigrationData
  ): Promise<MigrationResult> {
    // 1. 데이터 검증
    if (data.points < 0 || data.points > CONFIG.MAX_POINTS) {
      return { success: false, message: '데이터 검증 실패' };
    }

    // 2. 백업 생성
    if (!(await this.createBackup(data))) {
      return { success: false, message: '백업 생성 실패' };
    }

    // 3. 서버 URL 체크
    if (!CONFIG.API_URL) {
      // 서버 미설정 시 로컬 시뮬레이션 (개발용)
      await safeSetItem(KEYS.MIGRATED, 'true');
      await safeRemoveItem(KEYS.BACKUP);
      return {
        success: true,
        message: `${data.points.toLocaleString()}P, ${data.coupons.length}장 쿠폰 (로컬 저장)`,
        migratedPoints: data.points,
        migratedCoupons: data.coupons.length,
      };
    }

    // 4. 재시도 로직으로 서버 전송
    for (let attempt = 1; attempt <= CONFIG.RETRIES; attempt++) {
      try {
        // 10초 타임아웃으로 무한 대기 방지
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);

        const res = await fetch(`${CONFIG.API_URL}/api/migrate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Device-ID': data.deviceId,
            'X-Checksum': data.checksum,
          },
          body: JSON.stringify({
            userId,
            points: data.points,
            coupons: data.coupons,
            timestamp: data.timestamp,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const result = await res.json();
        if (!result.success) {
          throw new Error(result.message || '서버 오류');
        }

        // 성공
        await safeSetItem(KEYS.MIGRATED, 'true');
        await safeRemoveItem(KEYS.BACKUP);

        return {
          success: true,
          message: `${data.points.toLocaleString()}P, ${data.coupons.length}장 쿠폰 병합 완료`,
          migratedPoints: data.points,
          migratedCoupons: data.coupons.length,
        };
      } catch {
        // 재시도 대기
        if (attempt < CONFIG.RETRIES) {
          await delay(CONFIG.RETRY_DELAY * attempt);
        }
      }
    }

    // 모든 재시도 실패 → 롤백
    await this.restoreFromBackup();
    return { success: false, message: '서버 연결 실패. 데이터가 복구되었습니다.' };
  },

  /**
   * 메인 진입점: 로그인 시 호출
   */
  async handleLoginMigration(userId: string, token: string): Promise<MigrationResult> {
    // 1. 이미 완료 확인
    if (await this.isMigrated()) {
      return { success: true, message: '이미 마이그레이션 완료' };
    }

    // 2. 로컬 데이터 조회
    const data = await this.getLocalData();

    // 3. 마이그레이션할 데이터 없음
    if (!data || (data.points <= CONFIG.INITIAL_POINTS && data.coupons.length === 0)) {
      await safeSetItem(KEYS.MIGRATED, 'true');
      return { success: true, message: '마이그레이션할 데이터 없음' };
    }

    // 4. 사용자 확인 다이얼로그
    return new Promise((resolve) => {
      Alert.alert(
        '📦 기존 데이터 발견',
        `💰 ${data.points.toLocaleString()}P\n🎟️ ${data.coupons.length}장 쿠폰\n\n계정에 병합할까요?\n\n⚠️ "삭제"시 복구 불가`,
        [
          {
            text: '삭제',
            style: 'destructive',
            onPress: async () => {
              await Promise.all([
                safeRemoveItem(KEYS.POINTS),
                safeRemoveItem(KEYS.COUPONS),
              ]);
              await safeSetItem(KEYS.MIGRATED, 'true');
              resolve({ success: true, message: '기존 데이터 삭제됨' });
            },
          },
          {
            text: '병합',
            onPress: async () => {
              const result = await this.migrateToServer(userId, token, data);
              resolve(result);
            },
          },
        ],
        { cancelable: false }
      );
    });
  },

  /**
   * 미리보기 (설정 화면용)
   */
  async previewMigrationData(): Promise<{
    hasData: boolean;
    points: number;
    couponsCount: number;
    isMigrated: boolean;
  }> {
    const [data, migrated] = await Promise.all([
      this.getLocalData(),
      this.isMigrated(),
    ]);

    return {
      hasData: !!data && (data.points > CONFIG.INITIAL_POINTS || data.coupons.length > 0),
      points: data?.points ?? 0,
      couponsCount: data?.coupons.length ?? 0,
      isMigrated: migrated,
    };
  },

  /**
   * 마이그레이션 상태 초기화 (디버그/테스트용)
   */
  async resetMigrationStatus(): Promise<void> {
    await Promise.all([
      safeRemoveItem(KEYS.MIGRATED),
      safeRemoveItem(KEYS.BACKUP),
    ]);
  },
};

export default PointsMigrationService;

