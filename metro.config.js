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
  // 미니파이 설정 (terser 옵션)
  minifierConfig: {
    keep_classnames: false,
    keep_fnames: false,
    mangle: true,
    reserved: [],
    compress: {
      // 인라인 최적화 임계값 상향 (작은 함수를 인라인화하여 번들 크기 감소)
      inline: 3, // 0: 비활성, 1: 단순 함수, 2: 인자가 있는 함수, 3: 복잡한 함수까지
      passes: 2, // 압축 패스 2회 (추가 최적화)
      drop_console: false, // console은 babel에서 제거 (프로덕션만)
      dead_code: true,
      unused: true,
    },
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
