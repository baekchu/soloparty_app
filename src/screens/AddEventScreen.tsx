import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { Calendar, DateData } from 'react-native-calendars';
import { loadEvents, saveEvents } from '../utils/storage';
import '../utils/calendarLocale';
import { useTheme } from '../contexts/ThemeContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { getContainerStyle, getResponsivePadding, getResponsiveFontSize } from '../utils/responsive';
import { sanitizeText } from '../utils/sanitize';

// ==================== 캘린더 테마 상수 (렌더마다 재생성 방지) ====================
const CALENDAR_THEME_BASE = {
  selectedDayBackgroundColor: '#10b981',
  selectedDayTextColor: '#ffffff',
  todayTextColor: '#10b981',
  arrowColor: '#10b981',
  textDayFontWeight: '400' as const,
  textMonthFontWeight: '700' as const,
  textDayHeaderFontWeight: '600' as const,
};

const CALENDAR_THEME_DARK = {
  ...CALENDAR_THEME_BASE,
  backgroundColor: '#141422',
  calendarBackground: '#141422',
  textSectionTitleColor: '#a0a0b8',
  dayTextColor: '#eaeaf2',
  textDisabledColor: '#1e1e32',
  monthTextColor: '#eaeaf2',
};

const CALENDAR_THEME_LIGHT = {
  ...CALENDAR_THEME_BASE,
  backgroundColor: '#ffffff',
  calendarBackground: '#ffffff',
  textSectionTitleColor: '#4b5563',
  dayTextColor: '#111827',
  textDisabledColor: '#d1d5db',
  monthTextColor: '#111827',
};

type AddEventScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AddEvent'>;

interface AddEventScreenProps {
  navigation: AddEventScreenNavigationProp;
}

export default function AddEventScreen({ navigation }: AddEventScreenProps) {
  const [selectedDate, setSelectedDate] = useState('');
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState('');
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [fieldErrors, setFieldErrors] = useState<{ date?: string; title?: string }>({});
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const handleSave = useCallback(async () => {
    // 중복 저장 방지 (ref로 즉시 체크 — state 기반 경쟁 조건 해소)
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    // 인라인 유효성 검사
    const errors: { date?: string; title?: string } = {};
    if (!selectedDate) errors.date = '날짜를 선택해주세요.';
    if (!title.trim()) errors.title = '이벤트 제목을 입력해주세요.';
    if (errors.date || errors.title) {
      setFieldErrors(errors);
      isSavingRef.current = false;
      return;
    }
    setFieldErrors({});

    // URL 유효성 검증 (위험 프로토콜 명시적 차단 — defence-in-depth)
    const trimmedLink = link.trim();
    if (trimmedLink) {
      if (/^(javascript|data|vbscript|file|ftp):/i.test(trimmedLink)) {
        Alert.alert('알림', '허용되지 않는 링크 형식입니다.');
        isSavingRef.current = false;
        return;
      }
      if (!/^https?:\/\/.+/i.test(trimmedLink)) {
        Alert.alert('알림', '링크는 http:// 또는 https://로 시작해야 합니다.');
        isSavingRef.current = false;
        return;
      }
    }

    setIsSaving(true);
    try {
      const newEvent = {
        id: Crypto.randomUUID(),
        title: sanitizeText(title.trim(), 100),
        time: sanitizeText(time.trim(), 20),
        location: sanitizeText(location.trim(), 100),
        description: sanitizeText(description.trim(), 500),
        link: trimmedLink || undefined,
        coordinates: coordinates || undefined,
      };

      const events = await loadEvents();
      if (!events[selectedDate]) {
        events[selectedDate] = [];
      }
      events[selectedDate].push(newEvent);
      
      await saveEvents(events);
      
      Alert.alert('알림', '이벤트가 성공적으로 저장되었습니다.', [
        { text: '확인', onPress: () => navigation.goBack() }
      ]);
    } catch {
      Alert.alert('오류', '이벤트 저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [selectedDate, title, time, location, description, link, coordinates, navigation]);

  const isDark = theme === 'dark';
  const calendarTheme = useMemo(() => isDark ? CALENDAR_THEME_DARK : CALENDAR_THEME_LIGHT, [isDark]);
  const markedDates = useMemo(() => ({
    [selectedDate]: { selected: true, selectedColor: '#10b981' },
  }), [selectedDate]);

  // 테마 색상 7개를 isDark 변경 시에만 재계산 (매 렌더 인라인 계산 제거)
  const { bgColor, cardBg, inputBg, labelColor, textColor, placeholderColor, borderColor } = useMemo(() => ({
    bgColor: isDark ? '#0c0c16' : '#ffffff',
    cardBg: isDark ? '#141422' : '#f9fafb',
    inputBg: isDark ? '#1e1e32' : '#ffffff',
    labelColor: isDark ? '#a0a0b8' : '#374151',
    textColor: isDark ? '#eaeaf2' : '#111827',
    placeholderColor: isDark ? '#5c5c74' : '#9ca3af',
    borderColor: isDark ? '#1e1e32' : '#e5e7eb',
  }), [isDark]);

  // 안정적인 이벤트 핸들러 (인라인 화살표 제거)
  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);

  const handleDayPress = useCallback((day: DateData) => {
    setSelectedDate(day.dateString);
    setFieldErrors(prev => ({ ...prev, date: undefined }));
  }, []);

  const handleTitleChange = useCallback((t: string) => {
    setTitle(t);
    setFieldErrors(prev => ({ ...prev, title: undefined }));
  }, []);

  // JSX 내 IIFE 날짜 포맷 추출 (selectedDate 변경 시에만 재계산)
  const formattedSelectedDate = useMemo(() => {
    if (!selectedDate) return '';
    const [y, m, d] = selectedDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  }, [selectedDate]);

  return (
    <View style={[aStyles.root, { backgroundColor: bgColor, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
      {/* 헤더 */}
      <View style={[aStyles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={handleGoBack} style={aStyles.headerBtn}>
          <Text style={[aStyles.closeText, { color: isDark ? '#ffffff' : '#111827' }]}>✕</Text>
        </TouchableOpacity>
        <Text style={[aStyles.headerTitle, { color: isDark ? '#ffffff' : '#111827', fontSize: getResponsiveFontSize(20) }]}>
          새 이벤트
        </Text>
        <TouchableOpacity onPress={handleSave} disabled={isSaving} style={aStyles.headerBtn}>
          {isSaving ? (
            <ActivityIndicator size="small" color="#10b981" />
          ) : (
            <Text style={[aStyles.saveText, { fontSize: getResponsiveFontSize(16) }]}>저장</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={aStyles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView 
        style={aStyles.flex1}
        contentContainerStyle={getContainerStyle(800)}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingHorizontal: getResponsivePadding(), paddingTop: 16, paddingBottom: 24 }}>
        <View style={[aStyles.card, { backgroundColor: cardBg }]}>
          <View style={aStyles.cardInner}>
            <Text style={[aStyles.sectionLabel, { color: labelColor, fontSize: 16 }]}>
              📅 날짜 선택
            </Text>
            <Calendar
              theme={calendarTheme}
              markedDates={markedDates}
              onDayPress={handleDayPress}
              enableSwipeMonths={true}
            />
            {selectedDate && (
              <View style={[aStyles.selectedDateBadge, { backgroundColor: isDark ? 'rgba(6, 95, 70, 0.2)' : '#d1fae5' }]}>
                <Text style={[aStyles.selectedDateText, { color: isDark ? '#34d399' : '#059669' }]}>
                  ✅ {formattedSelectedDate}
                </Text>
              </View>
            )}
            {fieldErrors.date && (
              <Text style={aStyles.fieldError}>⚠ {fieldErrors.date}</Text>
            )}
          </View>
        </View>

        <View style={[aStyles.card, { backgroundColor: cardBg }]}>
          <View style={aStyles.cardInner}>
            <Text style={[aStyles.fieldLabel, { color: labelColor }]}>이벤트 제목 *</Text>
            <TextInput
              style={[aStyles.input, { backgroundColor: inputBg, color: textColor }, fieldErrors.title && aStyles.inputError]}
              value={title}
              onChangeText={handleTitleChange}
              placeholder="예: 크리스마스 파티"
              placeholderTextColor={placeholderColor}
              maxLength={100}
            />
            {fieldErrors.title && (
              <Text style={aStyles.fieldError}>⚠ {fieldErrors.title}</Text>
            )}
          </View>
        </View>

        <View style={[aStyles.card, { backgroundColor: cardBg }]}>
          <View style={aStyles.cardInner}>
            <Text style={[aStyles.fieldLabel, { color: labelColor }]}>🕐 시간</Text>
            <TextInput
              style={[aStyles.input, { backgroundColor: inputBg, color: textColor }]}
              value={time}
              onChangeText={setTime}
              placeholder="예: 오후 7시"
              placeholderTextColor={placeholderColor}
              maxLength={50}
            />
          </View>
        </View>

        <View style={[aStyles.card, { backgroundColor: cardBg }]}>
          <View style={aStyles.cardInner}>
            <Text style={[aStyles.fieldLabel, { color: labelColor }]}>📍 장소</Text>
            <TextInput
              style={[aStyles.input, { backgroundColor: inputBg, color: textColor, marginBottom: 12 }]}
              value={location}
              onChangeText={setLocation}
              placeholder="예: 서울시 강남구"
              placeholderTextColor={placeholderColor}
              maxLength={200}
            />
            <TouchableOpacity
              onPress={() => {
                Alert.alert('알림', '지도 기능은 준비 중입니다');
              }}
              style={[aStyles.mapBtn, { backgroundColor: inputBg, borderColor: isDark ? '#1e1e32' : '#e5e7eb' }]}
            >
              <Text style={[aStyles.mapBtnIcon, { color: isDark ? '#60a5fa' : '#3b82f6' }]}>📌</Text>
              <Text style={[aStyles.mapBtnText, { color: isDark ? '#60a5fa' : '#3b82f6' }]}>
                {coordinates ? '위치가 설정되었습니다' : '지도에서 위치 선택'}
              </Text>
            </TouchableOpacity>
            {coordinates && (
              <View style={[aStyles.coordBadge, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : '#dbeafe' }]}>
                <Text style={[aStyles.coordText, { color: isDark ? '#93c5fd' : '#1e40af' }]}>
                   {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={[aStyles.card, { backgroundColor: cardBg }]}>
          <View style={aStyles.cardInner}>
            <Text style={[aStyles.fieldLabel, { color: labelColor }]}>🔗 링크</Text>
            <TextInput
              style={[aStyles.input, { backgroundColor: inputBg, color: textColor }]}
              value={link}
              onChangeText={setLink}
              placeholder="예: https://example.com"
              placeholderTextColor={placeholderColor}
              keyboardType="url"
              autoCapitalize="none"
              maxLength={500}
            />
          </View>
        </View>

        <View style={[aStyles.cardLast, { backgroundColor: cardBg }]}>
          <View style={aStyles.cardInner}>
            <Text style={[aStyles.fieldLabel, { color: labelColor }]}>📝 설명</Text>
            <TextInput
              style={[aStyles.inputMultiline, { backgroundColor: inputBg, color: textColor }]}
              value={description}
              onChangeText={setDescription}
              placeholder="이벤트에 대한 설명을 입력하세요"
              placeholderTextColor={placeholderColor}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={2000}
            />
          </View>
        </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ==================== 스타일시트 ====================
const aStyles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
  header: {
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  headerBtn: { paddingHorizontal: 16 },
  closeText: { fontSize: 24 },
  headerTitle: { fontWeight: 'bold' },
  saveText: { color: '#10b981', fontWeight: 'bold' },
  card: { borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  cardLast: { borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
  cardInner: { padding: 16 },
  sectionLabel: { fontWeight: '600', marginBottom: 12 },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { borderRadius: 12, padding: 16, fontSize: 16 },
  inputError: { borderWidth: 1.5, borderColor: '#ef4444' },
  inputMultiline: { borderRadius: 12, padding: 16, fontSize: 16, height: 128 },
  selectedDateBadge: { marginTop: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  selectedDateText: { fontSize: 14, fontWeight: '600' },
  fieldError: { color: '#ef4444', fontSize: 13, fontWeight: '500', marginTop: 6 },
  mapBtn: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapBtnIcon: { fontSize: 16, marginRight: 8 },
  mapBtnText: { fontSize: 14, fontWeight: '600' },
  coordBadge: { marginTop: 8, padding: 8, borderRadius: 8 },
  coordText: { fontSize: 12 },
});
