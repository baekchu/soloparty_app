/**
 * ==================== 환경 변수 설정 ====================
 * 
 * app.json의 extra 필드나 .env 파일에서 환경 변수를 불러옵니다.
 * EAS Build 시에는 EAS Secrets에서 자동으로 주입됩니다.
 * 
 * 사용법:
 *   import { env } from '../config/env';
 *   const url = env.GIST_RAW_URL;
 * 
 * EAS Secrets 설정 방법:
 *   eas secret:create --name GIST_RAW_URL --value "your_url_here" --type string
 * 
 * ========================================================================
 */

import Constants from 'expo-constants';

// app.json의 extra 필드에서 환경 변수 가져오기
const expoConfig = Constants.expoConfig?.extra || {};

// 환경 변수 타입 정의
interface EnvConfig {
  GIST_RAW_URL: string;
  AD_CONFIG_URL: string;
  API_BASE_URL: string;
  APP_ENV: 'development' | 'staging' | 'production';
}

// 기본값과 함께 환경 변수 로드
export const env: EnvConfig = {
  // 이벤트 데이터 Gist URL
  GIST_RAW_URL: expoConfig.GIST_RAW_URL || 
    process.env.GIST_RAW_URL || 
    'https://gist.githubusercontent.com/baekchu/f805cac22604ff764916280710db490e/raw/gistfile1.txt',
  
  // 광고 설정 Gist URL
  AD_CONFIG_URL: expoConfig.AD_CONFIG_URL || 
    process.env.AD_CONFIG_URL || 
    '',
  
  // API 기본 URL
  API_BASE_URL: expoConfig.API_BASE_URL || 
    process.env.API_BASE_URL || 
    '',
  
  // 앱 환경
  APP_ENV: (expoConfig.APP_ENV || process.env.APP_ENV || 'development') as EnvConfig['APP_ENV'],
};

// 환경 변수 유효성 검증
export const validateEnv = (): boolean => {
  const required = ['GIST_RAW_URL'];
  const missing = required.filter(key => !env[key as keyof EnvConfig]);
  
  if (missing.length > 0 && __DEV__) {
    console.warn(`⚠️ 누락된 환경 변수: ${missing.join(', ')}`);
    return false;
  }
  
  return true;
};

// 프로덕션 환경 확인
export const isProduction = env.APP_ENV === 'production';
export const isDevelopment = env.APP_ENV === 'development';

export default env;
