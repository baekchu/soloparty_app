/**
 * 화면별 에러 바운더리
 * - 개별 화면의 에러를 격리하여 앱 전체 크래시 방지
 * - 해당 화면만 에러 표시, 다른 화면은 정상 동작
 * - 다크 모드 지원
 */

import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Appearance, ColorSchemeName, NativeEventSubscription } from 'react-native';
import { secureLog } from '../utils/secureStorage';

interface Props {
  children: ReactNode;
  screenName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  colorScheme: ColorSchemeName;
}

export class ScreenErrorBoundary extends Component<Props, State> {
  private _appearanceSub: NativeEventSubscription | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, colorScheme: Appearance.getColorScheme() };
  }

  componentDidMount() {
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
    secureLog.error(`❌ [${this.props.screenName || '화면'}] 크래시:`, error.message);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const isDark = this.state.colorScheme === 'dark';
      return (
        <View style={[sebStyles.container, { backgroundColor: isDark ? '#0c0c16' : '#ffffff' }]}>
          <Text style={sebStyles.emoji}>😥</Text>
          <Text style={[sebStyles.title, { color: isDark ? '#eaeaf2' : '#0f172a' }]}>
            이 화면에서 오류가 발생했어요
          </Text>
          <Text style={[sebStyles.message, { color: isDark ? '#8888a0' : '#64748b' }]}>
            일시적인 문제일 수 있어요.{'\n'}아래 버튼을 눌러 다시 시도해주세요.
          </Text>
          <TouchableOpacity
            style={[sebStyles.retryButton, { backgroundColor: isDark ? '#a78bfa' : '#ec4899' }]}
            onPress={this.handleRetry}
            activeOpacity={0.7}
            accessibilityLabel="다시 시도"
            accessibilityRole="button"
          >
            <Text style={sebStyles.retryButtonText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const sebStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
