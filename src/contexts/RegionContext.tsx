import React, { createContext, useContext, useState, ReactNode } from 'react';
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
    loadSavedFilters();
  }, []);

  const loadSavedFilters = async () => {
    try {
      const savedLocation = await AsyncStorage.getItem(SELECTED_LOCATION_KEY);
      const savedRegion = await AsyncStorage.getItem(SELECTED_REGION_KEY);
      if (savedLocation) setSelectedLocationState(savedLocation);
      if (savedRegion) setSelectedRegionState(savedRegion);
    } catch (error) {
      console.error('저장된 필터 로드 실패:', error);
    }
  };

  const setSelectedLocation = async (location: string | null) => {
    setSelectedLocationState(location);
    try {
      if (location) {
        await AsyncStorage.setItem(SELECTED_LOCATION_KEY, location);
      } else {
        await AsyncStorage.removeItem(SELECTED_LOCATION_KEY);
      }
    } catch (error) {
      // 필터 로드 실패는 무시
    }
  };

  const setSelectedRegion = async (region: string | null) => {
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
  };

  const clearFilters = async () => {
    setSelectedLocationState(null);
    setSelectedRegionState(null);
    try {
      await AsyncStorage.removeItem(SELECTED_LOCATION_KEY);
      await AsyncStorage.removeItem(SELECTED_REGION_KEY);
    } catch (error) {
      console.error('필터 초기화 실패:', error);
    }
  };

  return (
    <RegionContext.Provider value={{ 
      selectedLocation, 
      selectedRegion, 
      setSelectedLocation, 
      setSelectedRegion, 
      clearFilters 
    }}>
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
