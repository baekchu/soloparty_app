module.exports = function (api) {
  api.cache(true);
  
  const plugins = [];
  
  // 프로덕션 빌드 시 console.log 제거 (번들 크기 감소 + 성능 향상)
  if (process.env.NODE_ENV === 'production') {
    plugins.push(['transform-remove-console', { exclude: ['error', 'warn'] }]);
  }
  
  return {
    presets: ["babel-preset-expo"],
    plugins,
  };
};
