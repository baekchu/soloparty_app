import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, TextInput, ScrollView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useRegion } from '../contexts/RegionContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';

interface LocationPickerScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, 'LocationPicker'>;
  route?: {
    params?: {
      onLocationSelect?: (location: { latitude: number; longitude: number; address: string }) => void;
    };
  };
}

// ==================== 상수 정의 ====================
const LOCATION_STATS_KEY = '@location_stats';
const EVENTS_GIST_URL = 'https://gist.githubusercontent.com/baekchu/f805cac22604ff764916280710db490e/raw/gistfile1.txt';
const FETCH_TIMEOUT = 10000; // 10초 타임아웃
const MAX_LOCATIONS = 100; // 최대 장소 수 제한

// 기본 인기 장소 목록
const DEFAULT_LOCATIONS: LocationData[] = [
  { name: '서울 강남역', region: '서울', latitude: 37.4979, longitude: 127.0276, count: 0 },
  { name: '서울 홍대입구', region: '서울', latitude: 37.5572, longitude: 126.9236, count: 0 },
  { name: '서울 명동', region: '서울', latitude: 37.5636, longitude: 126.9835, count: 0 },
  { name: '부산 해운대', region: '부산', latitude: 35.1587, longitude: 129.1603, count: 0 },
  { name: '제주시', region: '제주', latitude: 33.4996, longitude: 126.5312, count: 0 },
  { name: '인천 송도', region: '인천', latitude: 37.3896, longitude: 126.6439, count: 0 },
];

// 장소 데이터 타입
interface LocationData {
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  count: number;
}

export default function LocationPickerScreen({ navigation, route }: LocationPickerScreenProps) {
  const { theme } = useTheme();
  const { setSelectedLocation: setContextLocation, setSelectedRegion: setContextRegion } = useRegion();
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();
  
  // ==================== 상태 ====================
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number; name: string; region?: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allLocations, setAllLocations] = useState<LocationData[]>(DEFAULT_LOCATIONS);
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<string | null>(null);
  const [availableRegions, setAvailableRegions] = useState<string[]>([]);
  const isMountedRef = useRef(true);

  const [dimensions, setDimensions] = useState(() => ({
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  }));

  // ==================== 마운트 상태 관리 ====================
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // 화면 크기 변경 감지
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      if (isMountedRef.current) {
        setDimensions({ width: window.width, height: window.height });
      }
    });
    return () => subscription?.remove();
  }, []);

  // 장소 데이터 로드
  useEffect(() => {
    loadLocationsFromGist();
  }, []);

  // 필터링된 장소 목록 (메모이제이션)
  const filteredLocations = useMemo(() => {
    let filtered = allLocations;
    
    if (selectedRegionFilter) {
      filtered = filtered.filter(loc => loc.region === selectedRegionFilter);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(loc => 
        loc.name.toLowerCase().includes(query) ||
        loc.region.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [allLocations, selectedRegionFilter, searchQuery]);

  // ==================== 데이터 로드 함수 ====================
  const loadLocationsFromGist = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    
    try {
      const response = await fetch(`${EVENTS_GIST_URL}?t=${Date.now()}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        await loadLocalStats();
        return;
      }
      
      const text = await response.text();
      
      // 보안: 응답 크기 제한 (5MB)
      if (text.length > 5 * 1024 * 1024) {
        console.warn('⚠️ 응답 크기 초과');
        await loadLocalStats();
        return;
      }
      
      // JSON 파싱 (제어 문자 제거) - 안전한 파싱
      let data;
      try {
        const cleanText = text
          .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
          .replace(/""\s*([,}])/g, '"$1')
          .replace(/[\n\r\t]/g, ' ')
          .replace(/\s+/g, ' ');
        data = JSON.parse(cleanText);
      } catch (parseError) {
        console.warn('⚠️ JSON 파싱 실패:', parseError);
        await loadLocalStats();
        return;
      }
      
      // 보안: 데이터 타입 검증
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        console.warn('⚠️ 유효하지 않은 데이터 형식');
        await loadLocalStats();
        return;
      }
      
      // 장소 추출 (보안: 문자열 길이 제한)
      const locationMap = new Map<string, LocationData>();
      
      Object.values(data).forEach((events: any) => {
        if (!Array.isArray(events)) return;
        
        events.forEach((event: any) => {
          if (!event?.location || typeof event.location !== 'string') return;
          
          const locationName = event.location.trim().substring(0, 100); // 최대 100자
          const region = (event.region || '기타').substring(0, 50);
          
          if (locationMap.has(locationName)) {
            const existing = locationMap.get(locationName)!;
            existing.count++;
            if (event.coordinates?.latitude && event.coordinates?.longitude) {
              existing.latitude = Number(event.coordinates.latitude) || 37.5665;
              existing.longitude = Number(event.coordinates.longitude) || 126.9780;
            }
          } else if (locationMap.size < MAX_LOCATIONS) {
            locationMap.set(locationName, {
              name: locationName,
              region,
              latitude: Number(event.coordinates?.latitude) || 37.5665,
              longitude: Number(event.coordinates?.longitude) || 126.9780,
              count: 1,
            });
          }
        });
      });
        
      // Map을 배열로 변환
      const locationsFromGist = Array.from(locationMap.values());
      
      // 지역 목록 추출 및 정렬
      const regions = [...new Set(locationsFromGist.map(loc => loc.region))];
      
      // 로컬 통계 불러오기
      const statsJson = await safeGetItem(LOCATION_STATS_KEY);
      let locationStats: Record<string, number> = {};
      
      if (statsJson) {
        try {
          locationStats = JSON.parse(statsJson);
        } catch {}
      }
      
      // 통계 합산 및 정렬
      const mergedLocations = locationsFromGist
        .map(loc => ({
          ...loc,
          count: (loc.count || 0) + (locationStats[loc.name] || 0),
        }))
        .sort((a, b) => b.count - a.count);
      
      if (isMountedRef.current) {
        setAvailableRegions(regions.sort());
        setAllLocations(mergedLocations);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      await loadLocalStats();
    }
  }, []);
  
  const loadLocalStats = useCallback(async () => {
    try {
      const statsJson = await safeGetItem(LOCATION_STATS_KEY);
      let locationStats: Record<string, number> = {};
      
      if (statsJson) {
        // 보안: 크기 제한
        if (statsJson.length > 100000) {
          console.warn('⚠️ 위치 통계 크기 초과');
        } else {
          try {
            const parsed = JSON.parse(statsJson);
            // 보안: 타입 검증
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              // 각 값이 숫자인지 검증
              for (const [key, value] of Object.entries(parsed)) {
                if (typeof key === 'string' && key.length < 200 && typeof value === 'number' && value >= 0) {
                  locationStats[key] = value;
                }
              }
            }
          } catch {
            console.warn('⚠️ 위치 통계 JSON 파싱 실패');
          }
        }
      }
      
      const locationsWithStats = DEFAULT_LOCATIONS
        .map(loc => ({
          ...loc,
          count: locationStats[loc.name] || 0,
        }))
        .sort((a, b) => b.count - a.count);
      
      if (isMountedRef.current) {
        setAllLocations(locationsWithStats);
      }
    } catch {
      // 로컬 통계 로드 실패는 무시
    }
  }, []);

  const saveLocationStats = useCallback(async (locationName: string, count: number) => {
    // 보안: 입력 검증
    if (!locationName || typeof locationName !== 'string' || locationName.length > 200) {
      return;
    }
    if (typeof count !== 'number' || count < 0 || !Number.isFinite(count)) {
      return;
    }
    
    try {
      const statsJson = await safeGetItem(LOCATION_STATS_KEY);
      let locationStats: Record<string, number> = {};
      
      if (statsJson && statsJson.length < 100000) {
        try {
          const parsed = JSON.parse(statsJson);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            locationStats = parsed;
          }
        } catch {
          // 파싱 실패 시 빈 객체 사용
        }
      }
      
      // 보안: 최대 항목 수 제한
      if (Object.keys(locationStats).length >= 500) {
        // 가장 오래된/적은 항목 제거
        const entries = Object.entries(locationStats).sort((a, b) => a[1] - b[1]);
        locationStats = Object.fromEntries(entries.slice(-400));
      }
      
      locationStats[locationName] = count;
      await safeSetItem(LOCATION_STATS_KEY, JSON.stringify(locationStats));
    } catch {
      // 통계 저장 실패는 무시
    }
  }, []);

  // ==================== 이벤트 핸들러 ====================
  const handleSelectLocation = useCallback((location: LocationData) => {
    setSelectedLocation(location);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (selectedLocation) {
      // 장소 선택 횟수 증가
      const updatedLocations = allLocations.map(loc => 
        loc.name === selectedLocation.name 
          ? { ...loc, count: loc.count + 1 }
          : loc
      );
      
      // count 기준 내림차순 정렬
      const sortedLocations = [...updatedLocations].sort((a, b) => b.count - a.count);
      setAllLocations(sortedLocations);
      
      // 통계 저장
      const location = updatedLocations.find(loc => loc.name === selectedLocation.name);
      if (location) {
        await saveLocationStats(location.name, location.count);
      }
      
      // 선택된 장소와 지역을 Context에 저장 (필터링용)
      setContextLocation(selectedLocation.name);
      if (selectedLocation.region) {
        setContextRegion(selectedLocation.region);
      }
      
      // 콜백 호출
      if (route?.params?.onLocationSelect) {
        route.params.onLocationSelect({
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
          address: selectedLocation.name,
        });
      }
    }
    // 캘린더 화면으로 이동 (MainTabs의 Calendar 탭)
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  }, [selectedLocation, allLocations, saveLocationStats, setContextLocation, setContextRegion, route, navigation]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0f172a' : '#ffffff' }}>
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
          위치 선택
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* 검색 및 위치 목록 */}
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom }}
      >
        {/* 검색창 */}
        <View style={{ padding: 20, paddingBottom: 12 }}>
          <TextInput
            style={{
              backgroundColor: isDark ? '#1e293b' : '#f3f4f6',
              borderRadius: 12,
              padding: 16,
              fontSize: 16,
              color: isDark ? '#f8fafc' : '#0f172a',
            }}
            placeholder="장소 검색..."
            placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* 지역 필터 버튼 */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={{ paddingHorizontal: 16, marginBottom: 16 }}
        >
          <TouchableOpacity
            onPress={() => setSelectedRegionFilter(null)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: selectedRegionFilter === null 
                ? (isDark ? '#a78bfa' : '#ec4899') 
                : (isDark ? '#334155' : '#f1f5f9'),
              marginRight: 8,
            }}
          >
            <Text style={{
              fontSize: 14,
              fontWeight: '600',
              color: selectedRegionFilter === null 
                ? '#ffffff' 
                : (isDark ? '#94a3b8' : '#64748b'),
            }}>
              전체
            </Text>
          </TouchableOpacity>
          {availableRegions.map((region) => (
            <TouchableOpacity
              key={region}
              onPress={() => setSelectedRegionFilter(region)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: selectedRegionFilter === region 
                  ? (isDark ? '#a78bfa' : '#ec4899') 
                  : (isDark ? '#334155' : '#f1f5f9'),
                marginRight: 8,
              }}
            >
              <Text style={{
                fontSize: 14,
                fontWeight: '600',
                color: selectedRegionFilter === region 
                  ? '#ffffff' 
                  : (isDark ? '#94a3b8' : '#64748b'),
              }}>
                {region}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 인기 위치 목록 */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 20, paddingTop: 8 }}>
          <Text style={{
            fontSize: 16,
            fontWeight: '700',
            color: isDark ? '#f8fafc' : '#0f172a',
            marginBottom: 12,
          }}>
            {selectedRegionFilter ? `${selectedRegionFilter} 지역 장소` : '인기 장소'}
          </Text>
          {filteredLocations.length === 0 ? (
            <View style={{
              padding: 20,
              alignItems: 'center',
            }}>
              <Text style={{
                fontSize: 14,
                color: isDark ? '#94a3b8' : '#64748b',
              }}>
                검색 결과가 없습니다
              </Text>
            </View>
          ) : (
            filteredLocations.map((location, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => handleSelectLocation(location)}
              style={{
                backgroundColor: selectedLocation?.name === location.name 
                  ? (isDark ? '#312e81' : '#ddd6fe')
                  : (isDark ? '#1e293b' : '#f9fafb'),
                padding: 16,
                borderRadius: 12,
                marginBottom: 8,
                borderWidth: selectedLocation?.name === location.name ? 2 : 1,
                borderColor: selectedLocation?.name === location.name 
                  ? (isDark ? '#a78bfa' : '#8b5cf6')
                  : (isDark ? '#334155' : '#e5e7eb'),
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color: isDark ? '#f8fafc' : '#0f172a',
                  }}>
                    {location.region} {location.name}
                  </Text>
                </View>
                {selectedLocation?.name === location.name && (
                  <Text style={{ fontSize: 24 }}>✓</Text>
                )}
              </View>
            </TouchableOpacity>
          ))
          )}
        </View>
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={{
        padding: 20,
        paddingBottom: Math.max(20, insets.bottom),
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        borderTopWidth: 1,
        borderTopColor: isDark ? '#334155' : '#e5e7eb',
      }}>
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={!selectedLocation}
          style={{
            backgroundColor: selectedLocation 
              ? (isDark ? '#a78bfa' : '#ec4899')
              : (isDark ? '#374151' : '#e5e7eb'),
            paddingVertical: 16,
            borderRadius: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ 
            color: selectedLocation ? '#ffffff' : (isDark ? '#6b7280' : '#9ca3af'),
            fontSize: 16,
            fontWeight: '700',
          }}>
            {selectedLocation ? `${selectedLocation.name} 선택` : '위치를 선택하세요'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
