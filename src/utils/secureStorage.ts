/**
 * ==================== 보안 저장소 유틸리티 ====================
 * 
 * expo-crypto를 사용한 데이터 난독화 (XOR + CTR 키스트림)
 * - SHA-256 기반 CTR 모드 XOR 키스트림 암호화
 * - HMAC 무결성 검증 (비트 플리핑 공격 방지)
 * - 키 파생 함수 (반복 해싱)
 * - 프로덕션 로그 자동 제거
 * 
 * 참고: 진정한 AES-256이 아닌 SHA-256 XOR 스트림 암호임.
 *       expo-crypto에서 AES를 지원하지 않아 이 방식 사용.
 *       SecureStore(OS Keychain/Keystore)가 주 보호 계층이고,
 *       이 암호화는 AsyncStorage 백업의 추가 보호 역할을 합니다.
 * 
 * ========================================================================
 */

import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

// ==================== 보안 설정 ====================
// 주의: expo-crypto는 비동기 해싱이므로 반복 횟수 조절 (성능 균형)
const ENCRYPTION_KEY_ITERATIONS = 20; // 클라이언트 전용 저장소 — 브릿지 호출 최적화 (20회면 충분)
const SALT_LENGTH = 32;
const MAX_ENCRYPT_SIZE = 50_000; // 50KB (트랜잭션 체인 등 대용량 데이터 지원)

// __DEV__는 React Native 전역 변수로 자동 제공됨
// 프로덕션 빌드에서는 false, 개발 중에는 true

/**
 * 안전한 로깅 - 프로덕션에서는 완전 제거
 * 에러도 프로덕션에서는 노출하지 않음 (보안 강화)
 */
export const secureLog = {
  info: (...args: any[]) => {
    if (__DEV__) console.log(...args);
  },
  warn: (...args: any[]) => {
    if (__DEV__) console.warn(...args);
  },
  error: (...args: any[]) => {
    // 프로덕션에서도 에러는 제거 (민감한 정보 유출 방지)
    if (__DEV__) console.error(...args);
  },
};

/**
 * 디바이스 고유 키 생성 
 * SecureStore에 저장된 고유 시드를 사용하여 기기별 유니크한 키 생성
 * (앱 재설치 시 변경됨 → 포인트는 PointsAutoSyncService에서 복원)
 */
let _cachedDeviceKey: string | null = null;

const getDeviceKey = async (): Promise<string> => {
  if (_cachedDeviceKey) return _cachedDeviceKey;
  
  try {
    const SecureStore = require('expo-secure-store');
    const SEED_KEY = 'sp_enc_seed_v1';
    
    let seed = await SecureStore.getItemAsync(SEED_KEY);
    if (!seed) {
      // 최초 실행: 고유 랜덤 시드 생성 후 SecureStore에 저장
      const randomBytes = await Crypto.getRandomBytesAsync(32);
      seed = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      await SecureStore.setItemAsync(SEED_KEY, seed);
    }
    
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${Platform.OS}-${seed}`
    );
    _cachedDeviceKey = digest;
    return digest;
  } catch {
    // SecureStore 실패 시 폴백 (AsyncStorage에 랜덤 시드 저장)
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const FALLBACK_KEY = '@sp_fallback_seed_v1';
      let fallbackSeed = await AsyncStorage.getItem(FALLBACK_KEY);
      if (!fallbackSeed) {
        const bytes = await Crypto.getRandomBytesAsync(32);
        fallbackSeed = Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
        await AsyncStorage.setItem(FALLBACK_KEY, fallbackSeed);
      }
      const fallback = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${Platform.OS}-${fallbackSeed}`
      );
      _cachedDeviceKey = fallback;
      return fallback;
    } catch {
      // 완전한 폴백: 세션 랜덤 키 (SecureStore + AsyncStorage 모두 실패)
      // 주의: 세션 간 복호화 불가능 (양쪽 저장소 실패 상황에서 이미 데이터 접근 불가)
      const sessionBytes = await Crypto.getRandomBytesAsync(16);
      const sessionHex = Array.from(sessionBytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
      const fallback = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${Platform.OS}-${Platform.Version}-${sessionHex}`
      );
      _cachedDeviceKey = fallback;
      return fallback;
    }
  }
};

/**
 * 데이터 암호화
 * 
 * 주의: expo-crypto는 진짜 AES 암호화를 제공하지 않으므로
 * SHA-256 해싱 + XOR을 사용한 간단한 난독화 적용
 * (완벽한 암호화는 아니지만 base64보다 훨씬 안전)
 */
export const encryptData = async (data: string): Promise<string> => {
  try {
    if (!data || typeof data !== 'string') return '';
    if (data.length > MAX_ENCRYPT_SIZE) {
      // 50KB 초과: XOR 암호화 불가 → HMAC 무결성 보호 인코딩으로 저장
      secureLog.warn('⚠️ 암호화 대상 크기 초과 — 인코딩 저장');
      try {
        const encoded = btoa(encodeURIComponent(data));
        const deviceKey = await getDeviceKey();
        const hmac = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          deviceKey + ':unenc_hmac:' + encoded
        );
        return 'unenc:' + encoded + ':' + hmac;
      } catch {
        return '';
      }
    }
    const deviceKey = await getDeviceKey();
    const salt = await Crypto.getRandomBytesAsync(SALT_LENGTH);
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // 키 파생 (반복 SHA-256 해싱으로 키 강화)
    let key = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      deviceKey + saltHex
    );
    
    for (let i = 0; i < ENCRYPTION_KEY_ITERATIONS; i++) {
      key = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        key
      );
    }
    
    // XOR 암호화 (CTR 모드 키스트림 확장 — 키 반복 방지)
    const dataBytes = new TextEncoder().encode(data);
    const encrypted = new Uint8Array(dataBytes.length);
    
    let blockIdx = 0;
    let blockKeyBytes = new Uint8Array(0);
    for (let i = 0; i < dataBytes.length; i++) {
      const posInBlock = i % 32;
      if (posInBlock === 0) {
        // 새 블록마다 고유 해시 생성 (hex → 바이너리 변환으로 바이트당 8비트 엔트로피 보장)
        const blockHash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          key + ':' + blockIdx++
        );
        const hexPairs = blockHash.match(/.{2}/g);
        blockKeyBytes = hexPairs
          ? new Uint8Array(hexPairs.map(h => parseInt(h, 16)))
          : new Uint8Array(32);
      }
      encrypted[i] = dataBytes[i] ^ blockKeyBytes[posInBlock];
    }
    
    const encryptedHex = Array.from(encrypted)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // HMAC 생성 (비트 플리핑 공격 방지)
    const hmac = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      key + ':hmac:' + saltHex + ':' + encryptedHex
    );
    
    // salt + encrypted + hmac 결합
    return saltHex + ':' + encryptedHex + ':' + hmac;
  } catch (error) {
    secureLog.error('암호화 실패');
    // 실패 시 평문 반환 금지 — 빈 문자열 반환
    return '';
  }
};

/**
 * 데이터 복호화
 */
export const decryptData = async (encrypted: string): Promise<string> => {
  try {
    if (!encrypted || typeof encrypted !== 'string') return '';
    
    // base64 폴백 데이터 처리
    if (encrypted.startsWith('plain:')) {
      try {
        return decodeURIComponent(atob(encrypted.slice(6)));
      } catch {
        return '';
      }
    }

    // 대용량 비암호화 데이터 처리 (encryptData에서 50KB 초과 시 저장)
    if (encrypted.startsWith('unenc:')) {
      try {
        const unencContent = encrypted.slice(6);
        const lastColonIdx = unencContent.lastIndexOf(':');
        
        if (lastColonIdx > 0) {
          // HMAC 포함 형식: encoded:hmac
          const encoded = unencContent.slice(0, lastColonIdx);
          const storedHmac = unencContent.slice(lastColonIdx + 1);
          const deviceKey = await getDeviceKey();
          const expectedHmac = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            deviceKey + ':unenc_hmac:' + encoded
          );
          if (!secureCompare(storedHmac.toLowerCase(), expectedHmac.toLowerCase())) {
            secureLog.warn('⚠️ unenc HMAC 검증 실패 — 데이터 변조 감지');
            return '';
          }
          return decodeURIComponent(atob(encoded));
        }
        
        // 레거시 형식 (HMAC 없음) — 기존 호환성 (1회 사용 후 재암호화됨)
        return decodeURIComponent(atob(unencContent));
      } catch {
        return '';
      }
    }
    
    if (!encrypted.includes(':')) {
      // 이전 버전 데이터는 빈 문자열로 처리 (무효 형식)
      return '';
    }
    
    const parts = encrypted.split(':');
    // 2-part: legacy (salt:encrypted), 3-part: new (salt:encrypted:hmac)
    if (parts.length !== 2 && parts.length !== 3) return '';
    const [saltHex, encryptedHex, storedHmac] = parts;
    if (!saltHex || !encryptedHex || !/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(encryptedHex)) {
      return '';
    }
    if (encryptedHex.length % 2 !== 0) return '';
    const deviceKey = await getDeviceKey();
    
    // 키 파생 (암호화와 동일)
    let key = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      deviceKey + saltHex
    );
    
    for (let i = 0; i < ENCRYPTION_KEY_ITERATIONS; i++) {
      key = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        key
      );
    }
    
    // HMAC 검증 (3-part 형식인 경우)
    if (storedHmac) {
      const expectedHmac = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        key + ':hmac:' + saltHex + ':' + encryptedHex
      );
      if (!secureCompare(storedHmac.toLowerCase(), expectedHmac.toLowerCase())) {
        secureLog.warn('⚠️ HMAC 검증 실패 — 데이터 변조 감지');
        return '';
      }
    }
    
    // XOR 복호화 (CTR 모드 키스트림 확장)
    const hexMatches = encryptedHex.match(/.{2}/g);
    if (!hexMatches) return '';
    const encryptedBytes = new Uint8Array(
      hexMatches.map(b => parseInt(b, 16))
    );
    const decrypted = new Uint8Array(encryptedBytes.length);
    
    let blockIdx = 0;
    let blockKeyBytes = new Uint8Array(0);
    for (let i = 0; i < encryptedBytes.length; i++) {
      const posInBlock = i % 32;
      if (posInBlock === 0) {
        const blockHash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          key + ':' + blockIdx++
        );
        const hexPairs = blockHash.match(/.{2}/g);
        blockKeyBytes = hexPairs
          ? new Uint8Array(hexPairs.map(h => parseInt(h, 16)))
          : new Uint8Array(32);
      }
      decrypted[i] = encryptedBytes[i] ^ blockKeyBytes[posInBlock];
    }
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    secureLog.error('복호화 실패:', error);
    return '';
  }
};

/**
 * 민감한 데이터 마스킹 (로그용)
 */
export const maskSensitiveData = (data: string, showLength: number = 8): string => {
  if (!data || data.length <= showLength) return '***';
  return data.slice(0, showLength) + '...';
};

/**
 * 안전한 비교 (타이밍 공격 방지)
 */
export const secureCompare = (a: string, b: string): boolean => {
  // 길이가 다를 때도 동일한 시간에 비교 수행 (타이밍 공격 방지)
  const maxLen = Math.max(a.length, b.length);
  let result = a.length ^ b.length; // 길이 차이도 XOR에 누적
  
  for (let i = 0; i < maxLen; i++) {
    const charA = i < a.length ? a.charCodeAt(i) : 0;
    const charB = i < b.length ? b.charCodeAt(i) : 0;
    result |= charA ^ charB;
  }
  
  return result === 0;
};
