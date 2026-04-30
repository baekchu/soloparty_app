import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, TextInput, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useRegion } from '../contexts/RegionContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { safeGetItem, safeSetItem } from '../utils/asyncStorageManager';
import { secureLog } from '../utils/secureStorage';
import { loadEvents } from '../utils/storage'; // storage 캐시 재사용 — 별도 Gist fetch 제거

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
// EVENTS_GIST_URL 제거: loadEvents() 운용 시 storage.ts 캐시 슬롯 공유 — 별도 Gist fetch 불필요
const MAX_LOCATIONS = 100; // 최대 장소 수 제한

// 모듈 레벨 위치 캐시 — 화면을 여닫닫할 때마다 데이터를 다시 추출하지 않도록 (어떤 데이터 로드도 수태)
let _cachedLocations: LocationData[] | null = null;
let _cachedRegions: string[] = [];
let _cachedEventsRef: object | null = null; // 입력 EventsByDate 참조 비교

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
  tags?: string[];
}

// 표시용 이름 정규화 ("종로구 주소" → "종로", "서울시" → "서울")
const normalizeDisplayName = (text: string | undefined): string => {
  if (!text) return '';
  
  let normalized = text.trim();
  
  // "구" 앞의 이름 추출 (예: 종로구 어쩌구 → 종로)
  const guMatch = normalized.match(/^([^\s시음면동리길가로]+)구/);
  if (guMatch) {
    return guMatch[1].trim();
  }
  
  // 순서 중요: 긴 패턴부터 먼저 제거
  // "특별시", "광역시" 제거 (예: 부산광역시 → 부산, 서울특별시 → 서울)
  normalized = normalized.replace(/(특별|광역)시$/, '');
  
  // "시" 접미사 제거 (예: 천안시 → 천안)
  normalized = normalized.replace(/시$/, '');
  
  // "도" 접미사 제거 (예: 경기도 → 경기)
  normalized = normalized.replace(/도$/, '');
  
  // 공백 이전까지만 반환 (첫 단어)
  const firstWord = normalized.split(/\s+/)[0];
  return firstWord || text;
};

// ==================== 지역 필터 칩 (React.memo — 선택 변경 시 해당 칩만 재렌더) ====================
interface RegionFilterChipProps {
  region: string;
  isSelected: boolean;
  isDark: boolean;
  onPress: (region: string) => void;
}
const RegionFilterChip = React.memo(function RegionFilterChip({ region, isSelected, isDark, onPress }: RegionFilterChipProps) {
  const handlePress = React.useCallback(() => onPress(region), [onPress, region]);
  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[lpStyles.filterChip, {
        backgroundColor: isSelected
          ? (isDark ? '#a78bfa' : '#ec4899')
          : (isDark ? '#1e1e32' : '#f1f5f9'),
      }]}
    >
      <Text style={[lpStyles.filterChipText, {
        color: isSelected ? '#ffffff' : (isDark ? '#8888a0' : '#64748b'),
      }]}>
        {region}
      </Text>
    </TouchableOpacity>
  );
});

// ==================== 장소 아이템 (React.memo — 선택 변경 시 2개 아이템만 재렌더) ====================
interface LocationItemProps {
  location: LocationData;
  isSelected: boolean;
  isDark: boolean;
  onPress: (location: LocationData) => void;
}
const LocationItem = React.memo(function LocationItem({ location, isSelected, isDark, onPress }: LocationItemProps) {
  const handlePress = React.useCallback(() => onPress(location), [onPress, location]);
  return (
    <TouchableOpacity
      key={`${location.name}_${location.region}`}
      onPress={handlePress}
      style={[lpStyles.locItem, {
        backgroundColor: isSelected
          ? (isDark ? 'rgba(167, 139, 250, 0.15)' : 'rgba(236, 72, 153, 0.08)')
          : (isDark ? '#141422' : '#f9fafb'),
        borderWidth: isSelected ? 2 : 1,
        borderColor: isSelected
          ? (isDark ? '#a78bfa' : '#ec4899')
          : (isDark ? '#1e1e32' : '#e5e7eb'),
      }]}
    >
      <View style={lpStyles.locRow}>
        <View style={lpStyles.flex1}>
          <Text style={[lpStyles.locName, { color: isDark ? '#eaeaf2' : '#0f172a' }]}>
            {normalizeDisplayName(location.region)} {normalizeDisplayName(location.name)}
          </Text>
        </View>
        {isSelected && (
          <Text style={lpStyles.checkMark}>✓</Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

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
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);
  const [loadError, setLoadError] = useState(false);
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

  // 장소 데이터 로드 (언마운트 감지용 isMountedRef 재사용)
  useEffect(() => {
    loadLocationsFromGist();
  }, []);

  // 필터링된 장소 목록 (메모이제이션)
  const filteredLocations = useMemo(() => {
    let filtered = allLocations;
    
    if (selectedRegionFilter) {
      filtered = filtered.filter(loc => normalizeDisplayName(loc.region) === selectedRegionFilter);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(loc => {
        const normalizedLocation = normalizeDisplayName(loc.name).toLowerCase();
        const normalizedRegion = normalizeDisplayName(loc.region).toLowerCase();
        return normalizedLocation.includes(query) ||
               normalizedRegion.includes(query) ||
               loc.name.toLowerCase().includes(query) ||
               loc.region.toLowerCase().includes(query) ||
               (loc.tags && loc.tags.some((t: string) => t.toLowerCase().includes(query)));
      });
    }
    
    return filtered;
  }, [allLocations, selectedRegionFilter, searchQuery]);

  // ==================== 데이터 로드 함수 ====================
  const loadLocationsFromGist = useCallback(async () => {
    if (isMountedRef.current) {
      setIsLoadingLocations(true);
      setLoadError(false);
    }

    try {
      // storage.ts loadEvents() 재사용 — 이미 로드된 캐시(60분 메모리/ETag) 활용
      // ?t=Date.now() 스타일 직접 fetch 제거 → 동접 시 Gist 요청수 절반 감소
      const eventsData = await loadEvents(false);

      // 같은 EventsByDate 참조면 재추출 스킵 (loadEvents memCache 히트)
      if (eventsData === _cachedEventsRef && _cachedLocations) {
        const statsJson = await safeGetItem(LOCATION_STATS_KEY);
        let locationStats: Record<string, number> = {};
        if (statsJson && statsJson.length < 100000) {
          try {
            const p = JSON.parse(statsJson);
            if (p && typeof p === 'object' && !Array.isArray(p)) {
              for (const [k, v] of Object.entries(p)) {
                if (typeof k === 'string' && k.length < 200 && typeof v === 'number' && v >= 0)
                  locationStats[k] = v;
              }
            }
          } catch {}
        }
        const merged = _cachedLocations.map(loc => ({
          ...loc,
          count: (loc.count || 0) + (locationStats[loc.name] || 0),
        })).sort((a, b) => b.count - a.count);
        if (isMountedRef.current) {
          setAvailableRegions(_cachedRegions);
          setAllLocations(merged);
          setIsLoadingLocations(false);
        }
        return;
      }

      // EventsByDate → 장소 Map 추출
      const locationMap = new Map<string, LocationData>();

      Object.values(eventsData).forEach((events) => {
        if (!Array.isArray(events)) return;
        events.forEach((event) => {
          if (!event?.location || typeof event.location !== 'string') return;
          const locationName = event.location.trim().substring(0, 100);
          const region = (event.region?.trim() ?? '').substring(0, 50) || '기타';
          if (locationMap.has(locationName)) {
            const existing = locationMap.get(locationName)!;
            existing.count++;
            if (event.coordinates?.latitude && event.coordinates?.longitude) {
              const lat = Number(event.coordinates.latitude);
              const lng = Number(event.coordinates.longitude);
              existing.latitude = isNaN(lat) ? 37.5665 : lat;
              existing.longitude = isNaN(lng) ? 126.9780 : lng;
            }
            if (Array.isArray(event.tags)) {
              const existingTags = existing.tags || [];
              const newTags = event.tags.filter((t: string) => typeof t === 'string' && !existingTags.includes(t));
              existing.tags = [...existingTags, ...newTags].slice(0, 20);
            }
          } else if (locationMap.size < MAX_LOCATIONS) {
            const lat = Number(event.coordinates?.latitude);
            const lng = Number(event.coordinates?.longitude);
            locationMap.set(locationName, {
              name: locationName,
              region,
              latitude: isNaN(lat) ? 37.5665 : lat,
              longitude: isNaN(lng) ? 126.9780 : lng,
              count: 1,
              tags: Array.isArray(event.tags) ? event.tags.filter((t: string) => typeof t === 'string').slice(0, 10) : [],
            });
          }
        });
      });

      const locationsFromEvents = Array.from(locationMap.values());
      const normalizedRegions = locationsFromEvents.map(loc => normalizeDisplayName(loc.region));
      const regions = [...new Set(normalizedRegions)].filter(r => r);

      // 모듈 캐시 갱신 (EventsByDate 참조 함께 저장)
      _cachedLocations = locationsFromEvents;
      _cachedRegions = regions.sort();
      _cachedEventsRef = eventsData;

      // 로컬 통계 병대사
      const statsJson = await safeGetItem(LOCATION_STATS_KEY);
      let locationStats: Record<string, number> = {};
      if (statsJson && statsJson.length < 100000) {
        try {
          const parsed = JSON.parse(statsJson);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            for (const [key, value] of Object.entries(parsed)) {
              if (typeof key === 'string' && key.length < 200 && typeof value === 'number' && value >= 0)
                locationStats[key] = value;
            }
          }
        } catch {}
      }

      const mergedLocations = locationsFromEvents
        .map(loc => ({ ...loc, count: (loc.count || 0) + (locationStats[loc.name] || 0) }))
        .sort((a, b) => b.count - a.count);

      if (isMountedRef.current) {
        setAvailableRegions(_cachedRegions);
        setAllLocations(mergedLocations);
        setIsLoadingLocations(false);
      }
    } catch {
      await loadLocalStats();
      if (isMountedRef.current) {
        setLoadError(true);
        setIsLoadingLocations(false);
      }
    }
  }, []);
  
  const loadLocalStats = useCallback(async () => {
    try {
      const statsJson = await safeGetItem(LOCATION_STATS_KEY);
      let locationStats: Record<string, number> = {};
      
      if (statsJson) {
        // 보안: 크기 제한
        if (statsJson.length > 100000) {
          secureLog.warn('⚠️ 위치 통계 크기 초과');
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
            secureLog.warn('⚠️ 위치 통계 JSON 파싱 실패');
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
  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);

  const handleClearRegionFilter = useCallback(() => setSelectedRegionFilter(null), []);

  const handleRegionFilterPress = useCallback((region: string) => {
    setSelectedRegionFilter(region);
  }, []);

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
    <SafeAreaView style={[lpStyles.root, { backgroundColor: isDark ? '#0c0c16' : '#ffffff' }]}>
      {/* 헤더 */}
      <View style={[lpStyles.header, {
        backgroundColor: isDark ? '#141422' : '#ffffff',
        borderBottomColor: isDark ? '#1e1e32' : '#e5e7eb',
      }]}>
        <TouchableOpacity onPress={handleGoBack} style={lpStyles.headerBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="뒤로 가기" accessibilityRole="button">
          <Text style={[lpStyles.headerBtnText, { color: isDark ? '#eaeaf2' : '#0f172a' }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[lpStyles.headerTitle, { color: isDark ? '#eaeaf2' : '#0f172a' }]}>
          위치 선택
        </Text>
        <View style={lpStyles.headerSpacer} />
      </View>

      {/* 검색 및 위치 목록 */}
      <ScrollView 
        style={lpStyles.flex1}
        contentContainerStyle={{ paddingBottom: insets.bottom }}
      >
        {/* 검색창 */}
        <View style={lpStyles.searchWrap}>
          <TextInput
            style={[lpStyles.searchInput, {
              backgroundColor: isDark ? '#141422' : '#f3f4f6',
              color: isDark ? '#eaeaf2' : '#0f172a',
            }]}
            placeholder="장소 검색..."
            placeholderTextColor={isDark ? '#5c5c74' : '#94a3b8'}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* 지역 필터 버튼 */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={lpStyles.filterRow}
        >
          <RegionFilterChip
            region="전체"
            isSelected={selectedRegionFilter === null}
            isDark={isDark}
            onPress={handleClearRegionFilter}
          />
          {availableRegions.map((region) => (
            <RegionFilterChip
              key={region}
              region={region}
              isSelected={selectedRegionFilter === region}
              isDark={isDark}
              onPress={handleRegionFilterPress}
            />
          ))}
        </ScrollView>

        {/* 인기 위치 목록 */}
        <View style={lpStyles.listSection}>
          {isLoadingLocations ? (
            <View style={lpStyles.loadingWrap}>
              <ActivityIndicator size="large" color={isDark ? '#a78bfa' : '#ec4899'} />
              <Text style={[lpStyles.loadingText, { color: isDark ? '#8888a0' : '#64748b' }]}>
                장소 데이터를 불러오는 중...
              </Text>
            </View>
          ) : (
          <>
          {loadError && (
            <View style={lpStyles.errorBanner}>
              <Text style={lpStyles.errorBannerText}>
                ⚠️ 최신 데이터를 불러오지 못했습니다. 기본 장소만 표시됩니다.
              </Text>
            </View>
          )}
          <Text style={[lpStyles.listTitle, { color: isDark ? '#eaeaf2' : '#0f172a' }]}>
            {selectedRegionFilter ? `${selectedRegionFilter} 지역 장소` : '인기 장소'}
            {searchQuery.trim() ? ` (${filteredLocations.length}건)` : ''}
          </Text>
          {filteredLocations.length === 0 ? (
            <View style={lpStyles.emptyWrap}>
              <Text style={[lpStyles.emptyText, { color: isDark ? '#8888a0' : '#64748b' }]}>
                검색 결과가 없습니다
              </Text>
            </View>
          ) : (
            filteredLocations.map((location) => (
            <LocationItem
              key={`${location.name}_${location.region}`}
              location={location}
              isSelected={selectedLocation?.name === location.name}
              isDark={isDark}
              onPress={handleSelectLocation}
            />
          ))
          )}
          </>
          )}
        </View>
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={[lpStyles.bottomBar, {
        paddingBottom: Math.max(20, insets.bottom),
        backgroundColor: isDark ? '#141422' : '#ffffff',
        borderTopColor: isDark ? '#1e1e32' : '#e5e7eb',
      }]}>
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={!selectedLocation}
          style={[lpStyles.confirmBtn, {
            backgroundColor: selectedLocation 
              ? (isDark ? '#a78bfa' : '#ec4899')
              : (isDark ? '#1e1e32' : '#e5e7eb'),
          }]}
        >
          <Text style={[lpStyles.confirmBtnText, {
            color: selectedLocation ? '#ffffff' : (isDark ? '#6b7280' : '#9ca3af'),
          }]}>
            {selectedLocation ? `${selectedLocation.name} 선택` : '위치를 선택하세요'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ==================== 스타일시트 ====================
const lpStyles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  headerBtn: { padding: 12 },
  headerBtnText: { fontSize: 24 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerSpacer: { width: 40 },
  searchWrap: { padding: 20, paddingBottom: 12 },
  searchInput: { borderRadius: 12, padding: 16, fontSize: 16 },
  filterRow: { paddingHorizontal: 16, marginBottom: 16 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
  filterChipText: { fontSize: 14, fontWeight: '600' },
  listSection: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 8 },
  listTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  emptyWrap: { padding: 20, alignItems: 'center' },
  emptyText: { fontSize: 14 },
  loadingWrap: { padding: 40, alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
  errorBanner: { backgroundColor: '#fef3c7', borderRadius: 8, padding: 12, marginBottom: 12 },
  errorBannerText: { fontSize: 13, color: '#92400e', textAlign: 'center' },
  locItem: { padding: 16, borderRadius: 12, marginBottom: 8 },
  locRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  locName: { fontSize: 16, fontWeight: '600' },
  checkMark: { fontSize: 24 },
  bottomBar: { padding: 20, borderTopWidth: 1 },
  confirmBtn: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  confirmBtnText: { fontSize: 16, fontWeight: '700' },
});
