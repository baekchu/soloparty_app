import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface FilterContextType {
  selectedLocation: string | null;  // 세부 장소 (예: 강남역, 홍대입구)
  selectedRegion: string | null;    // 지역 (예: 서울, 부산)
  setSelectedLocation: (location: string | null) => void;
  setSelectedRegion: (region: string | null) => void;
  clearFilters: () => void;
}

const RegionContext = createContext<FilterContextType | undefined>(undefined);

const SELECTED_LOCATION_KEY = '@selected_location';
const SELECTED_REGION_KEY = '@selected_region';

export const RegionProvider = ({ children }: { children: ReactNode }) => {
  const [selectedLocation, setSelectedLocationState] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegionState] = useState<string | null>(null);

  // 앱 시작 시 저장된 필터 불러오기
  React.useEffect(() => {
    let mounted = true;
    
    const loadSavedFilters = async () => {
      try {
        const [savedLocation, savedRegion] = await Promise.all([
          AsyncStorage.getItem(SELECTED_LOCATION_KEY),
          AsyncStorage.getItem(SELECTED_REGION_KEY)
        ]);
        
        if (mounted) {
          if (savedLocation) setSelectedLocationState(savedLocation);
          if (savedRegion) setSelectedRegionState(savedRegion);
        }
      } catch (error) {
        console.error('저장된 필터 로드 실패:', error);
      }
    };
    
    loadSavedFilters();
    return () => { mounted = false; };
  }, []);

  const setSelectedLocation = useCallback(async (location: string | null) => {
    setSelectedLocationState(location);
    try {
      if (location) {
        await AsyncStorage.setItem(SELECTED_LOCATION_KEY, location);
      } else {
        await AsyncStorage.removeItem(SELECTED_LOCATION_KEY);
      }
    } catch (error) {
      console.error('장소 저장 실패:', error);
    }
  }, []);

  const setSelectedRegion = useCallback(async (region: string | null) => {
    setSelectedRegionState(region);
    try {
      if (region) {
        await AsyncStorage.setItem(SELECTED_REGION_KEY, region);
      } else {
        await AsyncStorage.removeItem(SELECTED_REGION_KEY);
      }
    } catch (error) {
      console.error('지역 저장 실패:', error);
    }
  }, []);

  const clearFilters = useCallback(async () => {
    setSelectedLocationState(null);
    setSelectedRegionState(null);
    try {
      await Promise.all([
        AsyncStorage.removeItem(SELECTED_LOCATION_KEY),
        AsyncStorage.removeItem(SELECTED_REGION_KEY)
      ]);
    } catch (error) {
      console.error('필터 초기화 실패:', error);
    }
  }, []);

  const contextValue = useMemo(
    () => ({
      selectedLocation,
      selectedRegion,
      setSelectedLocation,
      setSelectedRegion,
      clearFilters
    }),
    [selectedLocation, selectedRegion, setSelectedLocation, setSelectedRegion, clearFilters]
  );

  return (
    <RegionContext.Provider value={contextValue}>
      {children}
    </RegionContext.Provider>
  );
};

export const useRegion = () => {
  const context = useContext(RegionContext);
  if (!context) {
    throw new Error('useRegion must be used within a RegionProvider');
  }
  return context;
};
