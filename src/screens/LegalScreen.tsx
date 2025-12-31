import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { getContainerStyle, getResponsivePadding, getResponsiveFontSize } from '../utils/responsive';

interface LegalScreenProps {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Legal'>;
  route: RouteProp<RootStackParamList, 'Legal'>;
}

const TERMS_OF_SERVICE = `Solo Party 이용약관

시행일자: 2025년 1월 1일

제1조 (목적)
본 약관은 Solo Party(이하 "서비스")의 이용 조건 및 절차, 회사와 이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.

제2조 (정의)
1. "서비스"란 Solo Party 모바일 애플리케이션을 의미합니다.
2. "이용자"란 본 약관에 따라 서비스를 이용하는 자를 의미합니다.
3. "포인트"란 서비스 내에서 사용되는 가상 화폐를 의미합니다.

제3조 (약관의 효력 및 변경)
1. 본 약관은 서비스 화면에 게시하거나 기타의 방법으로 공지함으로써 효력이 발생합니다.
2. 회사는 필요한 경우 관련 법령을 위배하지 않는 범위에서 본 약관을 변경할 수 있습니다.

제4조 (서비스의 제공)
1. 서비스는 솔로 파티 정보 제공 및 매칭 기능을 제공합니다.
2. 서비스는 연중무휴, 1일 24시간 제공함을 원칙으로 합니다.

제5조 (이용자의 의무)
1. 이용자는 다음 행위를 하여서는 안 됩니다:
   • 타인의 정보 도용
   • 서비스의 정보 변경
   • 서비스를 통해 얻은 정보를 무단으로 복제·유통
   • 불법적이거나 부적절한 콘텐츠 게시

제6조 (포인트 시스템)
1. 포인트는 서비스 내에서만 사용 가능합니다.
2. 포인트는 현금으로 환전할 수 없습니다.
3. 앱 삭제 시 포인트는 복구되지 않습니다.

제7조 (면책조항)
1. 회사는 천재지변 또는 이에 준하는 불가항력으로 인하여 서비스를 제공할 수 없는 경우 책임이 면제됩니다.
2. 회사는 이용자의 귀책사유로 인한 서비스 이용의 장애에 대하여 책임을 지지 않습니다.

제8조 (준거법 및 재판관할)
1. 본 약관의 해석 및 적용은 대한민국 법률에 따릅니다.
2. 분쟁 발생 시 회사 소재지 관할 법원을 전속 관할법원으로 합니다.

© 2025 Solo Party. All rights reserved.`;

const PRIVACY_POLICY = `Solo Party 개인정보처리방침

시행일자: 2025년 1월 1일

1. 수집하는 개인정보
Solo Party는 다음과 같은 개인정보를 수집합니다:
• 필수: 사용자 ID (자동 생성, 익명)
• 선택: 파티 참가 기록, 포인트 내역

2. 개인정보의 수집 및 이용 목적
• 파티 매칭 서비스 제공
• 포인트 시스템 운영
• 서비스 개선 및 통계 분석

3. 개인정보의 보유 및 이용 기간
• 회원 탈퇴 시까지 보유
• 앱 삭제 시 모든 데이터 자동 삭제

4. 개인정보의 제3자 제공
Solo Party는 사용자의 개인정보를 제3자에게 제공하지 않습니다.

5. 개인정보 보호
• AES-256 암호화
• SHA-256 해시 검증
• 로컬 저장 (서버 전송 없음)

6. 이용자의 권리
• 개인정보 열람, 수정, 삭제 요청 권리
• 앱 내 설정에서 직접 관리 가능

7. 개인정보 보호책임자
• 이메일: support@soloparty.com
• 전화: 문의 사항은 이메일로 연락 주시기 바랍니다.

8. 개인정보처리방침 변경
본 방침은 법령 및 정책 변경에 따라 변경될 수 있습니다.

© 2025 Solo Party. All rights reserved.`;

const COPYRIGHT_INFO = `Solo Party 저작권 정보

© 2025 Solo Party. All rights reserved.

1. 저작권
본 앱의 모든 콘텐츠(디자인, 텍스트, 이미지, 아이콘 등)는 저작권법에 의해 보호됩니다.

2. 사용 제한
• 앱의 콘텐츠를 무단으로 복제, 배포, 전송할 수 없습니다.
• 상업적 목적으로 사용할 수 없습니다.
• 저작권자의 허락 없이 2차 저작물을 제작할 수 없습니다.

3. 오픈소스 라이선스
본 앱은 다음 오픈소스 라이브러리를 사용합니다:
• React Native (MIT License)
• Expo (MIT License)
• React Navigation (MIT License)
• NativeWind (MIT License)

4. 상표권
"Solo Party" 명칭 및 로고는 등록상표이며 무단 사용을 금지합니다.

5. 면책사항
본 앱을 통해 제공되는 정보는 정확성을 보장하지 않으며, 사용자의 책임 하에 이용하시기 바랍니다.

6. 문의사항
저작권 관련 문의: support@soloparty.com

© 2025 Solo Party. All rights reserved.`;

export default function LegalScreen({ navigation, route }: LegalScreenProps) {
  const { theme } = useTheme();
  const isDark = useMemo(() => theme === 'dark', [theme]);
  const { type } = route.params;

  const content = useMemo(() => {
    switch (type) {
      case 'terms':
        return { title: '이용약관', text: TERMS_OF_SERVICE };
      case 'privacy':
        return { title: '개인정보처리방침', text: PRIVACY_POLICY };
      case 'copyright':
        return { title: '저작권 정보', text: COPYRIGHT_INFO };
      default:
        return { title: '약관', text: '' };
    }
  }, [type]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0f172a' : '#ffffff' }} edges={['top', 'left', 'right']}>
      {/* 헤더 */}
      <View style={{ 
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: getResponsivePadding(), 
        paddingTop: 10,
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
        <Text style={{ fontSize: getResponsiveFontSize(20), fontWeight: '700', color: isDark ? '#f8fafc' : '#0f172a' }}>
          {content.title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* 내용 */}
      <ScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={{
          ...getContainerStyle(800),
          padding: getResponsivePadding(),
        }}
      >
        <View style={{
          backgroundColor: isDark ? '#1e293b' : '#f9fafb',
          borderRadius: 12,
          padding: getResponsivePadding(),
        }}>
          <Text style={{
            fontSize: 14,
            lineHeight: 22,
            color: isDark ? '#e2e8f0' : '#1e293b',
          }}>
            {content.text}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
