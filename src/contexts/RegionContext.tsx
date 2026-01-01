import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import { safeGetItem, safeSetItem, safeRemoveItem, safeMultiGet } from '../utils/asyncStorageManager';

interface FilterContextType {
  selectedLocation: string | null;  // 세부 장소 (예: 강남역, 홍대입구)
  selectedRegion: string | null;    // 지역 (예: 서울, 부산)
  setSelectedLocation: (location: string | null) => void;
  setSelectedRegion: (region: string | null) => void;
  clearFilters: () => void;
}

const defaultFilterContext: FilterContextType = {
  selectedLocation: null,
  selectedRegion: null,
  setSelectedLocation: () => {},
  setSelectedRegion: () => {},
  clearFilters: () => {},
};

const RegionContext = createContext<FilterContextType>(defaultFilterContext);

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
        const results = await safeMultiGet([SELECTED_LOCATION_KEY, SELECTED_REGION_KEY]);
        const savedLocation = results[0][1];
        const savedRegion = results[1][1];
        
        if (mounted) {
          if (savedLocation) setSelectedLocationState(savedLocation);
          if (savedRegion) setSelectedRegionState(savedRegion);
        }
      } catch (error) {
        // 필터 로드 실패는 무시 (기본값 사용)
        console.log('필터 로드 실패 (무시)');
      }
    };
    
    loadSavedFilters().catch(() => {
      // 비동기 함수 실패도 무시
    });
    return () => { mounted = false; };
  }, []);

  const setSelectedLocation = useCallback(async (location: string | null) => {
    setSelectedLocationState(location);
    try {
      if (location) {
        await safeSetItem(SELECTED_LOCATION_KEY, location);
      } else {
        await safeRemoveItem(SELECTED_LOCATION_KEY);
      }
    } catch (error) {
      // 저장 실패해도 상태는 업데이트됨
    }
  }, []);

  const setSelectedRegion = useCallback(async (region: string | null) => {
    setSelectedRegionState(region);
    try {
      if (region) {
        await safeSetItem(SELECTED_REGION_KEY, region);
      } else {
        await safeRemoveItem(SELECTED_REGION_KEY);
      }
    } catch (error) {
      // 저장 실패해도 상태는 업데이트됨
    }
  }, []);

  const clearFilters = useCallback(async () => {
    setSelectedLocationState(null);
    setSelectedRegionState(null);
    try {
      await safeRemoveItem(SELECTED_LOCATION_KEY);
      await safeRemoveItem(SELECTED_REGION_KEY);
    } catch (error) {
      // 삭제 실패해도 상태는 초기화됨
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
  return context;
};
