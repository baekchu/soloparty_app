/**
 * ==================== 앱 시작 시 광고 팝업 모달 ====================
 * 
 * GitHub Gist를 통해 원격으로 광고 관리
 * 
 * 📌 Gist 설정:
 * 1. https://gist.github.com 에서 Gist 생성
 * 2. 파일명: ad-config.json
 * 3. 내용:
 *    {
 *      "enabled": true,
 *      "imageUrl": "https://your-image.jpg",
 *      "linkUrl": "https://your-link.com", 
 *      "title": "광고 제목",
 *      "description": "광고 설명"
 *    }
 * 4. Raw 버튼 클릭 → URL 복사 → GIST_RAW_URL에 입력
 * 
 * ========================================================================
 */

import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  Modal, 
  StyleSheet, 
  Dimensions,
  Linking,
  ActivityIndicator,
  ImageBackground,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { safeGetItem, safeSetItem, safeMultiGet } from '../utils/asyncStorageManager';
import { env } from '../config/env';

// ==================== 상수 ====================
const STORAGE_KEYS = {
  HIDE_UNTIL: '@sp_ad_hide',
  CACHE: '@sp_ad_cache',
  CACHE_TIME: '@sp_ad_time',
} as const;

const CONFIG = {
  CACHE_DURATION: 30 * 60 * 1000, // 30분
  FETCH_TIMEOUT: 5000, // 5초
  MODAL_DELAY: 300, // 모달 표시 딜레이
  MODAL_WIDTH: Math.min(Dimensions.get('window').width * 0.72, 260),
} as const;

// 환경 변수에서 광고 설정 URL 로드
const GIST_RAW_URL = env.AD_CONFIG_URL;

// ==================== 타입 ====================
interface AdConfig {
  readonly enabled: boolean;
  readonly imageUrl: string;
  readonly linkUrl: string;
  readonly title: string;
  readonly description: string;
}

interface StartupAdModalProps {
  readonly isDark: boolean;
  readonly onClose?: () => void;
}

// ==================== 기본값 ====================
const DEFAULT_CONFIG: AdConfig = {
  enabled: true,
  imageUrl: '',
  linkUrl: '',
  title: '광고 영역',
  description: '이곳에 광고가 표시됩니다',
};

// ==================== 유틸리티 ====================
const isValidConfig = (data: unknown): data is AdConfig => {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.enabled === 'boolean' && typeof d.imageUrl === 'string';
};

const safeJsonParse = <T,>(json: string | null, fallback: T): T => {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
};

// 광고 설정 로더 (싱글톤 패턴으로 중복 요청 방지)
class AdConfigLoader {
  private static promise: Promise<AdConfig> | null = null;
  
  static async load(): Promise<AdConfig> {
    if (!GIST_RAW_URL) return DEFAULT_CONFIG;
    if (this.promise) return this.promise;
    
    this.promise = this.fetchWithCache();
    const result = await this.promise;
    this.promise = null;
    return result;
  }
  
  private static async fetchWithCache(): Promise<AdConfig> {
    try {
      // 캐시 확인 (병렬 읽기)
      const [cache, time] = await safeMultiGet([
        STORAGE_KEYS.CACHE,
        STORAGE_KEYS.CACHE_TIME,
      ]);
      
      const cachedData = cache[1];
      const cacheTime = time[1];
      
      if (cachedData && cacheTime) {
        const elapsed = Date.now() - parseInt(cacheTime, 10);
        if (elapsed < CONFIG.CACHE_DURATION) {
          const parsed = safeJsonParse(cachedData, null);
          if (isValidConfig(parsed)) return parsed;
        }
      }
      
      // 보안: URL 프로토콜/도메인 검증 (SSRF 방지)
      try {
        const parsedUrl = new URL(GIST_RAW_URL);
        if (parsedUrl.protocol !== 'https:') throw new Error('Invalid protocol');
        const allowedHosts = ['gist.githubusercontent.com', 'raw.githubusercontent.com'];
        if (!allowedHosts.includes(parsedUrl.hostname)) throw new Error('Invalid host');
      } catch {
        return DEFAULT_CONFIG;
      }
      
      // 새로 fetch (타임아웃 적용)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT);
      
      try {
        const res = await fetch(GIST_RAW_URL, { 
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' },
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) throw new Error();
        
        const data = await res.json();
        if (!isValidConfig(data)) throw new Error();
        
        // 캐시 저장 (개별 저장 — safeSetItem 사용)
        safeSetItem(STORAGE_KEYS.CACHE, JSON.stringify(data)).catch(() => {});
        safeSetItem(STORAGE_KEYS.CACHE_TIME, Date.now().toString()).catch(() => {});
        
        return data;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch {
      return DEFAULT_CONFIG;
    }
  }
}

// ==================== 컴포넌트 ====================
const Placeholder = memo<{ title: string; desc: string; isDark: boolean }>(
  ({ title, desc, isDark }) => (
    <View style={[styles.placeholder, isDark && styles.placeholderDark]}>
      <Text style={styles.icon}>📢</Text>
      <Text style={[styles.title, isDark && styles.titleDark]}>{title}</Text>
      <Text style={[styles.desc, isDark && styles.descDark]}>{desc}</Text>
    </View>
  )
);

const AdImage = memo<{ uri: string; isDark: boolean; onError: () => void }>(
  ({ uri, isDark, onError }) => {
    const [loading, setLoading] = useState(true);
    
    return (
      <View style={styles.imageWrapper}>
        <Image
          source={{ uri }}
          style={styles.image}
          contentFit="cover"
          cachePolicy="disk"
          transition={200}
          onLoadEnd={() => setLoading(false)}
          onError={onError}
        />
        {loading && (
          <View style={styles.loader}>
            <ActivityIndicator size="small" color={isDark ? '#a78bfa' : '#ec4899'} />
          </View>
        )}
      </View>
    );
  }
);

export const StartupAdModal = memo<StartupAdModalProps>(({ isDark, onClose }) => {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<AdConfig | null>(null);
  const [imgError, setImgError] = useState(false);
  const mountedRef = useRef(true);
  const initRef = useRef(false); // 중복 초기화 방지

  // 초기화
  useEffect(() => {
    // 이미 초기화됐으면 스킵
    if (initRef.current) return;
    initRef.current = true;
    mountedRef.current = true;
    
    let timerId: ReturnType<typeof setTimeout> | null = null;
    
    const init = async () => {
      try {
        // 1. 숨김 기간 확인 (먼저 체크 - 불필요한 fetch 방지)
        const hideUntil = await safeGetItem(STORAGE_KEYS.HIDE_UNTIL);
        if (hideUntil && Date.now() < new Date(hideUntil).getTime()) {
          onClose?.();
          return;
        }
        
        // 2. 광고 설정 로드
        const adConfig = await AdConfigLoader.load();
        if (!mountedRef.current) return;
        
        if (!adConfig.enabled) {
          onClose?.();
          return;
        }
        
        // 3. 모달 표시 (약간의 딜레이 후)
        setConfig(adConfig);
        timerId = setTimeout(() => {
          if (mountedRef.current) {
            setVisible(true);
          }
        }, CONFIG.MODAL_DELAY);
      } catch {
        // 에러 시에도 기본 광고 표시 (enabled면)
        if (mountedRef.current && DEFAULT_CONFIG.enabled) {
          setConfig(DEFAULT_CONFIG);
          timerId = setTimeout(() => {
            if (mountedRef.current) setVisible(true);
          }, CONFIG.MODAL_DELAY);
        }
      }
    };
    
    init();
    
    return () => {
      mountedRef.current = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [onClose]);

  // 하루동안 숨기기
  const hideForDay = useCallback(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    safeSetItem(STORAGE_KEYS.HIDE_UNTIL, tomorrow.toISOString()).catch(() => {});
    setVisible(false);
    onClose?.();
  }, [onClose]);

  // 닫기
  const close = useCallback(() => {
    setVisible(false);
    onClose?.();
  }, [onClose]);

  // 광고 클릭
  const handlePress = useCallback(() => {
    if (!config?.linkUrl) return;
    // https/http만 허용 (intent://, javascript:, file:// 등 차단)
    if (!/^https?:\/\//i.test(config.linkUrl)) return;
    Linking.openURL(config.linkUrl).catch(() => {});
  }, [config?.linkUrl]);

  // 이미지 에러
  const handleImgError = useCallback(() => setImgError(true), []);

  if (!config?.enabled) return null;

  const showImage = config.imageUrl && !imgError;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
      hardwareAccelerated
    >
      <Pressable style={styles.overlay} onPress={close}>
        <Pressable 
          style={[styles.container, isDark && styles.containerDark]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* 광고 영역 */}
          <TouchableOpacity
            style={styles.content}
            onPress={handlePress}
            activeOpacity={config.linkUrl ? 0.85 : 1}
            disabled={!config.linkUrl}
          >
            {showImage ? (
              <AdImage uri={config.imageUrl} isDark={isDark} onError={handleImgError} />
            ) : (
              <Placeholder 
                title={config.title || DEFAULT_CONFIG.title}
                desc={config.description || DEFAULT_CONFIG.description}
                isDark={isDark}
              />
            )}
          </TouchableOpacity>

          {/* 버튼 영역 */}
          <View style={styles.buttons}>
            <TouchableOpacity
              onPress={hideForDay}
              hitSlop={12}
              style={styles.btn}
            >
              <Text style={[styles.btnLeft, isDark && styles.btnLeftDark]}>
                하루동안 보지 않기
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={close}
              hitSlop={12}
              style={styles.btn}
            >
              <Text style={[styles.btnRight, isDark && styles.btnRightDark]}>
                닫기
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

// ==================== 스타일 ====================
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: CONFIG.MODAL_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  containerDark: {
    backgroundColor: '#1e293b',
  },
  content: {
    width: '100%',
    aspectRatio: 1,
  },
  imageWrapper: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    padding: 16,
  },
  placeholderDark: {
    backgroundColor: '#334155',
  },
  icon: {
    fontSize: 40,
    marginBottom: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 2,
    textAlign: 'center',
  },
  titleDark: {
    color: '#f8fafc',
  },
  desc: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
  },
  descDark: {
    color: '#94a3b8',
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  btn: {
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  btnLeft: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748b',
  },
  btnLeftDark: {
    color: '#94a3b8',
  },
  btnRight: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ec4899',
  },
  btnRightDark: {
    color: '#a78bfa',
  },
});

export default StartupAdModal;
