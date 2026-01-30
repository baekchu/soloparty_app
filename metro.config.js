const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// ==================== 성능 최적화 설정 ====================

// 번들 크기 최적화
config.transformer = {
  ...config.transformer,
  // 인라인 require 최적화 (필요할 때만 모듈 로드)
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true, // 지연 로딩으로 초기 로드 시간 단축
    },
  }),
  // 미니파이 설정
  minifierConfig: {
    keep_classnames: false,
    keep_fnames: false,
    mangle: true,
    reserved: [],
    sourceMap: {
      includeSources: false,
    },
  },
};

// 캐시 최적화
config.cacheStores = [];

// 해시된 번들 ID 사용 (캐시 효율성)
config.resolver = {
  ...config.resolver,
  // 불필요한 파일 확장자 제외
  sourceExts: ['jsx', 'js', 'ts', 'tsx', 'json'],
};

module.exports = config;
