import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { loadEvents } from '../utils/storage';
import { Event } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../types';
import { CompositeNavigationProp } from '@react-navigation/native';

type EventListScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'EventList'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface EventListScreenProps {
  navigation: EventListScreenNavigationProp;
}

interface EventWithDate extends Event {
  date: string;
}

export default function EventListScreen({ navigation }: EventListScreenProps) {
  const [allEvents, setAllEvents] = useState<EventWithDate[]>([]);
  const { theme } = useTheme();

  useFocusEffect(
    useCallback(() => {
      loadAllEvents();
    }, [])
  );

  const loadAllEvents = useCallback(async () => {
    const events = await loadEvents();
    const eventList: EventWithDate[] = [];
    
    Object.keys(events).forEach(date => {
      events[date].forEach(event => {
        eventList.push({
          ...event,
          date,
        });
      });
    });
    
    eventList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    setAllEvents(eventList);
  }, []);

  const renderEvent = useCallback(({ item }: { item: EventWithDate }) => {
    const isDark = theme === 'dark';
    
    return (
      <View 
        style={{
          marginHorizontal: 16,
          marginBottom: 12,
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: isDark ? '#111827' : '#ffffff',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        <View style={{ height: 4, backgroundColor: isDark ? '#059669' : '#10b981' }} />
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', marginBottom: 8, color: isDark ? '#34d399' : '#059669' }}>
            {format(parseISO(item.date), 'yyyy년 M월 d일 (EEE)', { locale: ko })}
          </Text>
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 4, color: isDark ? '#ffffff' : '#111827' }}>
            {item.title}
          </Text>
          {item.time && (
            <Text style={{ fontSize: 14, color: isDark ? '#9ca3af' : '#6b7280' }}>
              🕐 {item.time}
            </Text>
          )}
          {item.location && (
            <Text style={{ fontSize: 14, marginTop: 4, color: isDark ? '#9ca3af' : '#6b7280' }}>
              📍 {item.location}
            </Text>
          )}
          {item.description && (
            <Text 
              style={{ fontSize: 14, marginTop: 8, color: isDark ? '#6b7280' : '#6b7280' }}
              numberOfLines={2}
            >
              {item.description}
            </Text>
          )}
        </View>
      </View>
    );
  }, [theme]);

  const isDark = useMemo(() => theme === 'dark', [theme]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#030712' : '#ffffff' }} edges={['top', 'left', 'right']}>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, backgroundColor: isDark ? '#030712' : '#ffffff' }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: isDark ? '#ffffff' : '#111827' }}>
          전체 이벤트
        </Text>
      </View>

      {allEvents.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>
          <Text style={{ fontSize: 60, marginBottom: 16 }}>📅</Text>
          <Text style={{ fontSize: 16, textAlign: 'center', color: isDark ? '#9ca3af' : '#6b7280' }}>
            등록된 이벤트가 없습니다
          </Text>
        </View>
      ) : (
        <FlatList
          data={allEvents}
          renderItem={renderEvent}
          keyExtractor={(item, index) => `${item.date}-${index}`}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 76 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
