import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, DateData } from 'react-native-calendars';
import { format } from 'date-fns';
import { loadEvents, saveEvents } from '../utils/storage';
import '../utils/calendarLocale';
import { useTheme } from '../contexts/ThemeContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { getContainerStyle, getResponsivePadding, getResponsiveFontSize } from '../utils/responsive';

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
  const { theme } = useTheme();

  const handleSave = useCallback(async () => {
   
    if (!selectedDate) {
      Alert.alert('알림', '날짜를 선택해주세요');
      return;
    }
    if (!title.trim()) {
      Alert.alert('알림', '이벤트 제목을 입력해주세요');
      return;
    }

    const newEvent = {
      id: Date.now().toString(),
      title: title.trim(),
      time: time.trim(),
      location: location.trim(),
      description: description.trim(),
      link: link.trim() || undefined,
      coordinates: coordinates || undefined,
    };

    const events = await loadEvents();
    if (!events[selectedDate]) {
      events[selectedDate] = [];
    }
    events[selectedDate].push(newEvent);
    
    await saveEvents(events);
    
    Alert.alert('성공', '이벤트가 추가되었습니다', [
      { text: '확인', onPress: () => navigation.goBack() }
    ]);
  }, [selectedDate, title, time, location, description, link, coordinates, navigation]);

  const isDark = theme === 'dark';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#030712' : '#ffffff' }} edges={['top', 'left', 'right']}>
      {/* 헤더 */}
      <View style={{ 
        paddingTop: 12, 
        paddingBottom: 12, 
        paddingHorizontal: getResponsivePadding(), 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: isDark ? '#1f2937' : '#e5e7eb'
      }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingRight: 16 }}>
          <Text style={{ fontSize: 24, color: isDark ? '#ffffff' : '#111827' }}>✕</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: getResponsiveFontSize(20), fontWeight: 'bold', color: isDark ? '#ffffff' : '#111827' }}>
          새 이벤트
        </Text>
        <TouchableOpacity onPress={handleSave} style={{ paddingLeft: 16 }}>
          <Text style={{ color: '#10b981', fontSize: getResponsiveFontSize(16), fontWeight: 'bold' }}>저장</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={getContainerStyle(800)}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: getResponsivePadding(), paddingTop: 16, paddingBottom: 24 }}>
        <View style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 16, backgroundColor: isDark ? '#111827' : '#f9fafb' }}>
          <View style={{ padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 12, color: isDark ? '#d1d5db' : '#374151' }}>
              📅 날짜 선택
            </Text>
            <Calendar
              theme={{
                backgroundColor: isDark ? '#111827' : '#ffffff',
                calendarBackground: isDark ? '#111827' : '#ffffff',
                textSectionTitleColor: isDark ? '#d1d5db' : '#4b5563',
                selectedDayBackgroundColor: '#10b981',
                selectedDayTextColor: '#ffffff',
                todayTextColor: '#10b981',
                dayTextColor: isDark ? '#f9fafb' : '#111827',
                textDisabledColor: isDark ? '#374151' : '#d1d5db',
                arrowColor: '#10b981',
                monthTextColor: isDark ? '#f9fafb' : '#111827',
                textDayFontWeight: '400',
                textMonthFontWeight: '700',
                textDayHeaderFontWeight: '600',
              }}
              markedDates={{
                [selectedDate]: { selected: true, selectedColor: '#10b981' },
              }}
              onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
              enableSwipeMonths={true}
            />
            {selectedDate && (
              <View style={{ marginTop: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: isDark ? 'rgba(6, 95, 70, 0.2)' : '#d1fae5' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? '#34d399' : '#059669' }}>
                  ✓ {format(new Date(selectedDate), 'yyyy년 M월 d일')}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ borderRadius: 16, marginBottom: 16, backgroundColor: isDark ? '#111827' : '#f9fafb' }}>
          <View style={{ padding: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8, color: isDark ? '#d1d5db' : '#374151' }}>
              이벤트 제목 *
            </Text>
            <TextInput
              style={{
                borderRadius: 12,
                padding: 16,
                fontSize: 16,
                backgroundColor: isDark ? '#1f2937' : '#ffffff',
                color: isDark ? '#f3f4f6' : '#111827',
              }}
              value={title}
              onChangeText={setTitle}
              placeholder="예: 크리스마스 파티"
              placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
            />
          </View>
        </View>

        <View style={{ borderRadius: 16, marginBottom: 16, backgroundColor: isDark ? '#111827' : '#f9fafb' }}>
          <View style={{ padding: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8, color: isDark ? '#d1d5db' : '#374151' }}>
              🕐 시간
            </Text>
            <TextInput
              style={{
                borderRadius: 12,
                padding: 16,
                fontSize: 16,
                backgroundColor: isDark ? '#1f2937' : '#ffffff',
                color: isDark ? '#f3f4f6' : '#111827',
              }}
              value={time}
              onChangeText={setTime}
              placeholder="예: 오후 7시"
              placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
            />
          </View>
        </View>

        <View style={{ borderRadius: 16, marginBottom: 16, backgroundColor: isDark ? '#111827' : '#f9fafb' }}>
          <View style={{ padding: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8, color: isDark ? '#d1d5db' : '#374151' }}>
              📍 장소
            </Text>
            <TextInput
              style={{
                borderRadius: 12,
                padding: 16,
                fontSize: 16,
                backgroundColor: isDark ? '#1f2937' : '#ffffff',
                color: isDark ? '#f3f4f6' : '#111827',
                marginBottom: 12,
              }}
              value={location}
              onChangeText={setLocation}
              placeholder="예: 서울시 강남구"
              placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
            />
            <TouchableOpacity
              onPress={() => {
                // TODO: 지도 화면으로 이동하여 위치 선택
                Alert.alert('알림', '지도 기능은 준비 중입니다');
              }}
              style={{
                borderRadius: 12,
                padding: 14,
                backgroundColor: isDark ? '#1f2937' : '#ffffff',
                borderWidth: 1,
                borderColor: isDark ? '#374151' : '#e5e7eb',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 16, color: isDark ? '#60a5fa' : '#3b82f6', marginRight: 8 }}>🗺️</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: isDark ? '#60a5fa' : '#3b82f6' }}>
                {coordinates ? '위치가 설정되었습니다' : '지도에서 위치 선택'}
              </Text>
            </TouchableOpacity>
            {coordinates && (
              <View style={{ marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : '#dbeafe' }}>
                <Text style={{ fontSize: 12, color: isDark ? '#93c5fd' : '#1e40af' }}>
                  📌 {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ borderRadius: 16, marginBottom: 16, backgroundColor: isDark ? '#111827' : '#f9fafb' }}>
          <View style={{ padding: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8, color: isDark ? '#d1d5db' : '#374151' }}>
              🔗 링크
            </Text>
            <TextInput
              style={{
                borderRadius: 12,
                padding: 16,
                fontSize: 16,
                backgroundColor: isDark ? '#1f2937' : '#ffffff',
                color: isDark ? '#f3f4f6' : '#111827',
              }}
              value={link}
              onChangeText={setLink}
              placeholder="예: https://example.com"
              placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
              keyboardType="url"
              autoCapitalize="none"
            />
          </View>
        </View>

        <View style={{ borderRadius: 16, marginBottom: 24, backgroundColor: isDark ? '#111827' : '#f9fafb' }}>
          <View style={{ padding: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8, color: isDark ? '#d1d5db' : '#374151' }}>
              📝 설명
            </Text>
            <TextInput
              style={{
                borderRadius: 12,
                padding: 16,
                fontSize: 16,
                height: 128,
                backgroundColor: isDark ? '#1f2937' : '#ffffff',
                color: isDark ? '#f3f4f6' : '#111827',
              }}
              value={description}
              onChangeText={setDescription}
              placeholder="이벤트에 대한 설명을 입력하세요"
              placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
