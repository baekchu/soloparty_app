import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Appearance, ColorSchemeName, NativeEventSubscription } from 'react-native';
import { secureLog } from '../utils/secureStorage';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
  colorScheme: ColorSchemeName;
}

// 에러 보고 큐 (네트워크 전송 대비)
const errorQueue: Array<{ message: string; timestamp: number; platform: string }> = [];
const MAX_ERROR_QUEUE = 20;

// 슬라이딩 윈도우 크래시 카운터 (1분 이내 연속 크래시만 카운트)
const _errorTimestamps: number[] = [];
const ERROR_WINDOW_MS = 60_000; // 1분
const MAX_ERRORS_IN_WINDOW = 5;

export class ErrorBoundary extends Component<Props, State> {
  private _appearanceSub: NativeEventSubscription | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorCount: 0, colorScheme: Appearance.getColorScheme() };
  }

  componentDidMount() {
    // 테마 변경 시 자동 리렌더 (에러 화면에서도 다크모드 반영)
    this._appearanceSub = Appearance.addChangeListener(({ colorScheme }) => {
      this.setState({ colorScheme });
    });
  }

  componentWillUnmount() {
    this._appearanceSub?.remove();
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    // 프로덕션에서는 에러 메시지만 전송 (스택 제외)
    secureLog.error('❌ 앱 크래시 감지:', error.message);
    // 개발 환경에서만 상세 정보 출력
    secureLog.info('상세 정보:', errorInfo);
    
    // 에러 보고 큐에 추가 (향후 서버 전송용)
    if (errorQueue.length < MAX_ERROR_QUEUE) {
      errorQueue.push({
        message: error.message.slice(0, 200),
        timestamp: Date.now(),
        platform: Platform.OS,
      });
    }
    
    // 슬라이딩 윈도우 기반 크래시 카운트 (1분 이내만)
    const now = Date.now();
    _errorTimestamps.push(now);
    while (_errorTimestamps.length > 0 && _errorTimestamps[0] < now - ERROR_WINDOW_MS) {
      _errorTimestamps.shift();
    }
    
    this.setState(prev => ({ errorCount: _errorTimestamps.length }));
  }

  handleReset = () => {
    // 슬라이딩 윈도우 기반: 1분 내 5회 이상 크래시 시 경고
    if (_errorTimestamps.length >= MAX_ERRORS_IN_WINDOW) {
      secureLog.warn('⚠️ 1분 내 반복 크래시 감지 - 앱 재설치 권장');
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const isDark = this.state.colorScheme === 'dark';
      return (
        <View style={[styles.container, { backgroundColor: isDark ? '#0c0c16' : '#fce7f3' }]}>
          <View style={styles.content}>
            <Text style={styles.emoji}>😢</Text>
            <Text style={[styles.title, { color: isDark ? '#eaeaf2' : '#0f172a' }]}>앱 로딩 중 문제가 발생했습니다</Text>
            <Text style={[styles.message, { color: isDark ? '#8888a0' : '#64748b' }]}>
              일시적인 오류일 수 있습니다.{'\n'}
              아래 버튼을 눌러 다시 시도해주세요.
            </Text>
            <TouchableOpacity 
              style={[styles.button, { backgroundColor: isDark ? '#a78bfa' : '#ec4899' }]}
              onPress={this.handleReset}
            >
              <Text style={styles.buttonText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fce7f3',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    alignItems: 'center',
    maxWidth: 340,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
