import { cleanupToday } from './helpers/cleanup';

async function globalTeardown() {
  console.log('[global-teardown] 오늘 날짜 테스트 데이터 정리 중...');
  await cleanupToday();
  console.log('[global-teardown] 정리 완료');
}

export default globalTeardown;
