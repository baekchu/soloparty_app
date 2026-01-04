import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, TextInput, ScrollView, Alert, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useRegion } from '../contexts/RegionContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';

interface LocationPickerScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, 'LocationPicker'>;
  route?: {
    params?: {
      onLocationSelect?: (location: { latitude: number; longitude: number; address: string }) => void;
    };
  };
}

import AsyncStorage from '@react-native-async-storage/async-storage';

// 네이버 지도 API 키 (실제 사용 시 환경 변수로 관리)
const NAVER_MAP_CLIENT_ID = 'YOUR_NAVER_CLIENT_ID'; // TODO: .env 파일에서 불러오기

// 장소 통계 저장소 키
const LOCATION_STATS_KEY = '@location_stats';

// GitHub Gist 이벤트 데이터 URL (장소 정보 추출용)
const EVENTS_GIST_URL = 'https://gist.githubusercontent.com/baekchu/f805cac22604ff764916280710db490e/raw/gistfile1.txt';

// 기본 인기 장소 목록
const DEFAULT_LOCATIONS = [
  { name: '서울 강남역', region: '서울', latitude: 37.4979, longitude: 127.0276, count: 0 },
  { name: '서울 홍대입구', region: '서울', latitude: 37.5572, longitude: 126.9236, count: 0 },
  { name: '서울 명동', region: '서울', latitude: 37.5636, longitude: 126.9835, count: 0 },
  { name: '부산 해운대', region: '부산', latitude: 35.1587, longitude: 129.1603, count: 0 },
  { name: '제주시', region: '제주', latitude: 33.4996, longitude: 126.5312, count: 0 },
  { name: '인천 송도', region: '인천', latitude: 37.3896, longitude: 126.6439, count: 0 },
];

// 네이버 지도 HTML (WebView용)
const getNaverMapHTML = (latitude: number, longitude: number) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <script type="text/javascript" src="https://openapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${NAVER_MAP_CLIENT_ID}"></script>
    <style>
        body { margin: 0; padding: 0; }
        #map { width: 100%; height: 100vh; }
    </style>
</head>
<body>
    <div id="map"></div>
    <script>
        var map = new naver.maps.Map('map', {
            center: new naver.maps.LatLng(${latitude}, ${longitude}),
            zoom: 15,
            zoomControl: true,
            zoomControlOptions: {
                position: naver.maps.Position.TOP_RIGHT
            }
        });
        
        var marker = new naver.maps.Marker({
            position: new naver.maps.LatLng(${latitude}, ${longitude}),
            map: map,
            draggable: true
        });
        
        // 마커 드래그 이벤트
        naver.maps.Event.addListener(marker, 'dragend', function(e) {
            var position = marker.getPosition();
            window.ReactNativeWebView.postMessage(JSON.stringify({
                latitude: position.lat(),
                longitude: position.lng()
            }));
        });
        
        // 지도 클릭 이벤트
        naver.maps.Event.addListener(map, 'click', function(e) {
            marker.setPosition(e.coord);
            window.ReactNativeWebView.postMessage(JSON.stringify({
                latitude: e.coord.lat(),
                longitude: e.coord.lng()
            }));
        });
    </script>
</body>
</html>
`;

export default function LocationPickerScreen({ navigation, route }: LocationPickerScreenProps) {
  const { theme } = useTheme();
  const { setSelectedLocation: setContextLocation, setSelectedRegion: setContextRegion } = useRegion();
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number; name: string; region?: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [useMap, setUseMap] = useState(false);
  const [allLocations, setAllLocations] = useState<Array<{ name: string; region: string; latitude: number; longitude: number; count: number }>>(DEFAULT_LOCATIONS);
  const [filteredLocations, setFilteredLocations] = useState<Array<{ name: string; region: string; latitude: number; longitude: number; count: number }>>(DEFAULT_LOCATIONS);
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<string | null>(null);
  const [availableRegions, setAvailableRegions] = useState<string[]>([]);

  const [dimensions, setDimensions] = useState(() => {
    const { width, height } = Dimensions.get('window');
    return { width, height };
  });

  // 화면 크기 변경 감지
  React.useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions({ width: window.width, height: window.height });
    });
    return () => subscription?.remove();
  }, []);

  // 장소 데이터 및 통계 불러오기
  React.useEffect(() => {
    loadLocationsFromGist();
  }, []);

  // 검색어 및 지역 필터 변경 시 필터링
  React.useEffect(() => {
    let filtered = allLocations;
    
    // 지역 필터
    if (selectedRegionFilter) {
      filtered = filtered.filter(loc => loc.region === selectedRegionFilter);
    }
    
    // 검색어 필터
    if (searchQuery.trim() !== '') {
      filtered = filtered.filter(loc => 
        loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        loc.region.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    setFilteredLocations(filtered);
  }, [searchQuery, allLocations, selectedRegionFilter]);

  const loadLocationsFromGist = async () => {
    try {
      // Gist에서 이벤트 데이터 가져오기
      const response = await fetch(`${EVENTS_GIST_URL}?t=${Date.now()}`);
      
      if (response.ok) {
        const text = await response.text();
        
        // JSON 파싱 (control character 제거)
        let data;
        try {
          const cleanText = text
            .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
            .replace(/""\s*([,}])/g, '"$1')
            .replace(/\n/g, ' ')
            .replace(/\r/g, '')
            .replace(/\t/g, ' ')
            .replace(/\s+/g, ' ');
          data = JSON.parse(cleanText);
        } catch (parseError) {
          await loadLocalStats();
          return;
        }
        
        // 모든 이벤트에서 location 필드 추출
        const locationMap = new Map<string, { name: string; region: string; latitude: number; longitude: number; count: number }>();
        
        Object.values(data).forEach((events: any) => {
          if (Array.isArray(events)) {
            events.forEach((event: any) => {
              if (event.location) {
                const locationName = event.location.trim();
                const region = event.region || '기타';
                
                if (locationMap.has(locationName)) {
                  // 이미 존재하면 count 증가
                  const existing = locationMap.get(locationName)!;
                  existing.count++;
                  // coordinates가 있으면 업데이트
                  if (event.coordinates?.latitude && event.coordinates?.longitude) {
                    existing.latitude = event.coordinates.latitude;
                    existing.longitude = event.coordinates.longitude;
                  }
                } else {
                  // 새로운 장소 추가
                  locationMap.set(locationName, {
                    name: locationName,
                    region: region,
                    latitude: event.coordinates?.latitude || 37.5665, // 기본값: 서울
                    longitude: event.coordinates?.longitude || 126.9780,
                    count: 1 // Gist에서 등장 횟수
                  });
                }
              }
            });
          }
        });
        
        // Map을 배열로 변환
        const locationsFromGist = Array.from(locationMap.values());
        
        // 지역 목록 추출 및 정렬
        const regions = [...new Set(locationsFromGist.map(loc => loc.region))];
        setAvailableRegions(regions.sort());
        
        // 로컬 통계 불러오기 (사용자 선택 횟수)
        const statsJson = await AsyncStorage.getItem(LOCATION_STATS_KEY);
        let locationStats: { [key: string]: number } = {};
        
        if (statsJson) {
          locationStats = JSON.parse(statsJson);
        }
        
        // Gist 등장 횟수 + 로컬 사용자 선택 횟수 합산
        const mergedLocations = locationsFromGist.map(loc => ({
          ...loc,
          count: (loc.count || 0) + (locationStats[loc.name] || 0)
        }));
        
        // count 기준 내림차순 정렬 (인기 순)
        const sortedLocations = mergedLocations.sort((a, b) => b.count - a.count);
        
        setAllLocations(sortedLocations);
        setFilteredLocations(sortedLocations);
      } else {
        await loadLocalStats();
      }
    } catch (error) {
      await loadLocalStats();
    }
  };
  
  const loadLocalStats = async () => {
    try {
      const statsJson = await AsyncStorage.getItem(LOCATION_STATS_KEY);
      let locationStats: { [key: string]: number } = {};
      
      if (statsJson) {
        locationStats = JSON.parse(statsJson);
      }
      
      const locationsWithStats = DEFAULT_LOCATIONS.map(loc => ({
        ...loc,
        count: locationStats[loc.name] || 0
      }));
      
      const sortedLocations = locationsWithStats.sort((a, b) => b.count - a.count);
      setAllLocations(sortedLocations);
      setFilteredLocations(sortedLocations);
    } catch (error) {
      // 로컬 통계 로드 실패는 무시
    }
  };

  const saveLocationStats = async (locationName: string, count: number) => {
    try {
      const statsJson = await AsyncStorage.getItem(LOCATION_STATS_KEY);
      let locationStats: { [key: string]: number } = {};
      
      if (statsJson) {
        locationStats = JSON.parse(statsJson);
      }
      
      locationStats[locationName] = count;
      await AsyncStorage.setItem(LOCATION_STATS_KEY, JSON.stringify(locationStats));
    } catch (error) {
      // 통계 저장 실패는 무시
    }
  };

  const handleSelectLocation = (location: { name: string; latitude: number; longitude: number; count?: number }) => {
    setSelectedLocation(location);
  };

  const handleMapLocationSelect = (data: { latitude: number; longitude: number }) => {
    setSelectedLocation({
      ...data,
      name: `위치 (${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)})`,
    });
  };

  const handleConfirm = async () => {
    if (selectedLocation) {
      // 장소 선택 횟수 증가
      const updatedLocations = allLocations.map(loc => 
        loc.name === selectedLocation.name 
          ? { ...loc, count: loc.count + 1 }
          : loc
      );
      
      // count 기준 내림차순 정렬
      const sortedLocations = updatedLocations.sort((a, b) => b.count - a.count);
      setAllLocations(sortedLocations);
      setFilteredLocations(sortedLocations);
      
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
  };

  const handleUseMap = () => {
    if (NAVER_MAP_CLIENT_ID === 'YOUR_NAVER_CLIENT_ID') {
      Alert.alert(
        '네이버 지도 API 설정 필요',
        'NAVER_MAP_SETUP.md 파일을 참고하여 네이버 지도 API 키를 설정해주세요.\n\n지금은 인기 장소 목록에서 선택할 수 있습니다.',
        [{ text: '확인' }]
      );
    } else {
      setUseMap(true);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0f172a' : '#ffffff' }} edges={['top']}>
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
      <ScrollView style={{ flex: 1 }}>
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

      {/* 안드로이드 하단바 배경 */}
      {Platform.OS === 'android' && insets.bottom > 0 && (
        <View style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: insets.bottom,
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
        }} />
      )}
    </SafeAreaView>
  );
}
