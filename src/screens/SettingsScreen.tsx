import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';

interface SettingsScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
}

export default function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = useMemo(() => theme === 'dark', [theme]);

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#0f172a' : '#ffffff' }}>
      {/* 헤더 */}
      <View style={{ 
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20, 
        paddingTop: 20,
        paddingBottom: 20, 
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#334155' : '#e5e7eb',
      }}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ padding: 8 }}
        >
          <Text style={{ fontSize: 24, color: isDark ? '#f8fafc' : '#0f172a' }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '700', color: isDark ? '#f8fafc' : '#0f172a' }}>
          설정
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }}>
        {/* 다크모드 설정 */}
        <View style={{
          margin: 20,
          padding: 20,
          backgroundColor: isDark ? '#1e293b' : '#f9fafb',
          borderRadius: 12,
        }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <View>
              <Text style={{
                fontSize: 18,
                fontWeight: '700',
                color: isDark ? '#f8fafc' : '#0f172a',
                marginBottom: 4,
              }}>
                다크 모드
              </Text>
              <Text style={{
                fontSize: 14,
                color: isDark ? '#94a3b8' : '#64748b',
              }}>
                {isDark ? '어두운 테마 사용 중' : '밝은 테마 사용 중'}
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#d1d5db', true: '#a78bfa' }}
              thumbColor={isDark ? '#ec4899' : '#f3f4f6'}
            />
          </View>
        </View>

        {/* 위치 설정 */}
        <View style={{
          marginHorizontal: 20,
          marginBottom: 20,
          padding: 20,
          backgroundColor: isDark ? '#1e293b' : '#f9fafb',
          borderRadius: 12,
        }}>
          <TouchableOpacity
            onPress={() => {
              navigation.navigate('LocationPicker');
            }}
          >
            <View>
              <Text style={{
                fontSize: 18,
                fontWeight: '700',
                color: isDark ? '#f8fafc' : '#0f172a',
                marginBottom: 4,
              }}>
                위치 설정
              </Text>
              <Text style={{
                fontSize: 14,
                color: isDark ? '#94a3b8' : '#64748b',
              }}>
                지도에서 기본 위치 선택
              </Text>
            </View>
            <View style={{
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: [{ translateY: -12 }],
            }}>
              <Text style={{ fontSize: 24, color: isDark ? '#94a3b8' : '#64748b' }}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 앱 정보 */}
        <View style={{
          marginHorizontal: 20,
          marginBottom: 20,
          padding: 20,
          backgroundColor: isDark ? '#1e293b' : '#f9fafb',
          borderRadius: 12,
        }}>
          <Text style={{
            fontSize: 18,
            fontWeight: '700',
            color: isDark ? '#f8fafc' : '#0f172a',
            marginBottom: 8,
          }}>
            앱 정보
          </Text>
          <Text style={{
            fontSize: 14,
            color: isDark ? '#94a3b8' : '#64748b',
            lineHeight: 20,
          }}>
            Solo Party v1.0.0{'\n'}
            특별한 만남을 위한 일정 관리
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
