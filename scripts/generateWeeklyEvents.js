/**
 * 주간 이벤트 자동 생성 스크립트
 * 
 * 사용법:
 *   node scripts/generateWeeklyEvents.js
 *   node scripts/generateWeeklyEvents.js 2026-02-07  (특정 금요일 기준)
 * 
 * 결과:
 *   - 콘솔에 JSON 출력 (복사해서 Gist에 붙여넣기)
 *   - output/events_YYYY-MM-DD.json 파일 생성
 */

const fs = require('fs');
const path = require('path');

// ============================================
// 📋 여기서 템플릿 수정하세요!
// ============================================
const TEMPLATES = {
  // 금요일 이벤트
  friday: [
    {
      titlePrefix: "🎉 금요일 게더링 파티",
      time: "19:30",
      venue: "게더링 라운지",
      location: "강남",
      region: "서울",
      address: "서울시 강남구 역삼동 123-45",
      description: "매주 금요일 진행! 직장인 미팅파티",
      detailDescription: "매주 금요일 진행되는 게더링 파티입니다.\n\n✨ 파티 특징\n- 1:1 로테이션 매칭\n- 프리토킹 타임\n- 음료 무제한",
      maleCapacity: 8,
      femaleCapacity: 8,
      price: 30000,
      ageRange: "25-35",
      organizer: "게더링팀",
      contact: "카톡 @gathering",
      link: "https://open.kakao.com/gathering-fri",
      tags: ["게더링", "금요일", "직장인"]
    }
  ],
  
  // 토요일 이벤트 (여러개 가능)
  saturday: [
    {
      titlePrefix: "☀️ 토요일 낮 게더링",
      time: "15:00",
      venue: "게더링 라운지",
      location: "강남",
      region: "서울",
      address: "서울시 강남구 역삼동 123-45",
      description: "토요일 오후 캐주얼 미팅",
      maleCapacity: 6,
      femaleCapacity: 6,
      price: 25000,
      ageRange: "23-30",
      link: "https://open.kakao.com/gathering-sat",
      tags: ["게더링", "토요일", "캐주얼"]
    },
    {
      titlePrefix: "🌙 토요일 나이트 게더링",
      time: "19:00",
      venue: "게더링 라운지",
      location: "강남",
      region: "서울",
      address: "서울시 강남구 역삼동 123-45",
      description: "토요일 저녁 프리미엄 파티",
      maleCapacity: 10,
      femaleCapacity: 10,
      price: 40000,
      ageRange: "27-37",
      link: "https://open.kakao.com/gathering-sat-night",
      tags: ["게더링", "토요일", "프리미엄"]
    }
  ],
  
  // 일요일 이벤트
  sunday: [
    {
      titlePrefix: "☕ 일요일 브런치 게더링",
      time: "12:00",
      venue: "게더링 카페",
      location: "강남",
      region: "서울",
      address: "서울시 강남구 역삼동 123-45",
      description: "여유로운 일요일 브런치 미팅",
      maleCapacity: 5,
      femaleCapacity: 5,
      price: 28000,
      ageRange: "25-33",
      link: "https://open.kakao.com/gathering-sun",
      tags: ["게더링", "일요일", "브런치"]
    }
  ]
};

// ============================================
// 아래는 수정 불필요
// ============================================

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function getNextFriday(fromDate = new Date()) {
  const date = new Date(fromDate);
  const day = date.getDay();
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
  date.setDate(date.getDate() + daysUntilFriday);
  return date;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateEventId(date, dayName, location, index) {
  const loc = location.toLowerCase().replace(/[^a-z가-힣]/g, '');
  return `${formatDate(date)}-${dayName}-${loc}-${index + 1}`;
}

function generateEventsForDay(date, templates) {
  const dayName = DAY_NAMES[date.getDay()];
  
  return templates.map((template, index) => ({
    id: generateEventId(date, dayName, template.location, index),
    title: template.titlePrefix,
    time: template.time,
    venue: template.venue,
    location: template.location,
    region: template.region,
    address: template.address,
    description: template.description,
    detailDescription: template.detailDescription,
    maleCapacity: template.maleCapacity,
    femaleCapacity: template.femaleCapacity,
    price: template.price,
    ageRange: template.ageRange,
    organizer: template.organizer,
    contact: template.contact,
    link: template.link,
    tags: template.tags
  })).filter(e => e.title); // 빈 템플릿 제거
}

function generateWeeklyEvents(fridayDate) {
  const friday = new Date(fridayDate);
  friday.setHours(12, 0, 0, 0); // 시간대 문제 방지
  
  const saturday = new Date(friday);
  saturday.setDate(friday.getDate() + 1);
  const sunday = new Date(friday);
  sunday.setDate(friday.getDate() + 2);
  
  const events = {};
  
  // 금요일 이벤트
  if (TEMPLATES.friday.length > 0) {
    events[formatDate(friday)] = generateEventsForDay(friday, TEMPLATES.friday);
  }
  
  // 토요일 이벤트
  if (TEMPLATES.saturday.length > 0) {
    events[formatDate(saturday)] = generateEventsForDay(saturday, TEMPLATES.saturday);
  }
  
  // 일요일 이벤트
  if (TEMPLATES.sunday.length > 0) {
    events[formatDate(sunday)] = generateEventsForDay(sunday, TEMPLATES.sunday);
  }
  
  return events;
}

function generateMultipleWeeks(startFriday, weeks = 4) {
  let allEvents = {};
  let currentFriday = new Date(startFriday);
  
  for (let i = 0; i < weeks; i++) {
    const weekEvents = generateWeeklyEvents(currentFriday);
    allEvents = { ...allEvents, ...weekEvents };
    currentFriday.setDate(currentFriday.getDate() + 7);
  }
  
  return allEvents;
}

// 메인 실행
function main() {
  const args = process.argv.slice(2);
  let startDate;
  let weeks = 4;
  
  if (args[0]) {
    startDate = new Date(args[0]);
    if (isNaN(startDate.getTime())) {
      console.error('❌ 잘못된 날짜 형식입니다. YYYY-MM-DD 형식으로 입력하세요.');
      process.exit(1);
    }
  } else {
    startDate = getNextFriday();
  }
  
  if (args[1]) {
    weeks = parseInt(args[1]) || 4;
  }
  
  console.log(`\n📅 시작 금요일: ${formatDate(startDate)}`);
  console.log(`📆 생성 주수: ${weeks}주\n`);
  
  const events = generateMultipleWeeks(startDate, weeks);
  const jsonOutput = JSON.stringify(events, null, 2);
  
  // 파일 저장
  const outputDir = path.join(__dirname, '..', 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const filename = `events_${formatDate(startDate)}.json`;
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, jsonOutput, 'utf8');
  
  console.log(`✅ 파일 저장됨: output/${filename}\n`);
  console.log('=' .repeat(50));
  console.log('📋 아래 JSON을 Gist에 붙여넣으세요:');
  console.log('=' .repeat(50));
  console.log(jsonOutput);
  console.log('\n');
  
  // 요약
  const totalEvents = Object.values(events).flat().length;
  const totalDays = Object.keys(events).length;
  console.log(`📊 요약: ${totalDays}일, 총 ${totalEvents}개 이벤트 생성됨`);
}

main();
