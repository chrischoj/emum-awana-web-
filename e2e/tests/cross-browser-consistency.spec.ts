import { test, expect } from '../fixtures/auth.fixture';
import { cleanupTestData } from '../helpers/cleanup';
import { getScoresForMember } from '../helpers/assertions';
import { TeacherScoringPage } from '../page-objects/teacher-scoring.page';

const TEST_DATE = new Date().toISOString().split('T')[0];

test.describe('크로스 브라우저 일관성', () => {
  test.beforeEach(async () => {
    await cleanupTestData(TEST_DATE);
  });

  test('동일 조작이 동일한 DB 결과를 생성', async ({ teacher1Page }) => {
    const scoring = new TeacherScoringPage(teacher1Page);

    await scoring.goto();
    await teacher1Page.waitForTimeout(2000);

    // 첫번째 멤버 찾기
    const firstCard = teacher1Page.locator('[data-testid^="member-card-"]').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    const memberId = (await firstCard.getAttribute('data-testid'))!.replace('member-card-', '');

    // 출석 입력
    await scoring.tapAttendance(memberId);
    await teacher1Page.waitForTimeout(600);

    // 핸드북 토글
    await scoring.toggleHandbook(memberId);
    await teacher1Page.waitForTimeout(600);

    // 단복 토글
    await scoring.toggleUniform(memberId);
    await teacher1Page.waitForTimeout(600);

    // sync 대기
    await teacher1Page.waitForTimeout(2000);

    // DB 검증 - 점수가 정확히 저장되었는지
    const scores = await getScoresForMember(memberId, TEST_DATE);
    expect(scores.length).toBeGreaterThanOrEqual(3); // attendance, handbook, uniform

    // 출석 점수 확인
    const attScore = scores.find(s => s.category === 'attendance');
    expect(attScore).toBeTruthy();
    expect(attScore!.total_points).toBeGreaterThan(0);

    // 핸드북 점수 확인
    const hbScore = scores.find(s => s.category === 'handbook');
    expect(hbScore).toBeTruthy();
    expect(hbScore!.total_points).toBe(50);

    // 단복 점수 확인
    const uniScore = scores.find(s => s.category === 'uniform');
    expect(uniScore).toBeTruthy();
    expect(uniScore!.total_points).toBe(50);
  });
});
