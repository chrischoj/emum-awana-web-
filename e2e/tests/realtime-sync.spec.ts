import { test, expect } from '../fixtures/auth.fixture';
import { cleanupTestData } from '../helpers/cleanup';
import { TeacherScoringPage } from '../page-objects/teacher-scoring.page';

const TEST_DATE = new Date().toISOString().split('T')[0];

test.describe('실시간 동기화', () => {
  test.beforeEach(async () => {
    await cleanupTestData(TEST_DATE);
  });

  test('교사1 점수 변경 → 교사2 화면 실시간 반영', async ({
    teacher1Page,
    teacher2Page,
  }) => {
    const scoring1 = new TeacherScoringPage(teacher1Page);
    const scoring2 = new TeacherScoringPage(teacher2Page);

    // 두 교사 동시에 점수 페이지 이동
    await Promise.all([scoring1.goto(), scoring2.goto()]);
    await Promise.all([
      teacher1Page.waitForTimeout(3000),
      teacher2Page.waitForTimeout(3000),
    ]);

    // 교사1: 첫번째 멤버 찾기
    const card1 = teacher1Page.locator('[data-testid^="member-card-"]').first();
    await expect(card1).toBeVisible({ timeout: 10_000 });
    const memberId = (await card1.getAttribute('data-testid'))!.replace('member-card-', '');

    // 교사2에서 같은 멤버의 합계 확인
    const memberTotalOnTeacher2 = teacher2Page.locator(`[data-testid="member-total-${memberId}"]`);
    const initialTotal = await memberTotalOnTeacher2.textContent();

    // 교사1: 출석 입력
    await scoring1.tapAttendance(memberId);
    await teacher1Page.waitForTimeout(600);

    // 교사1: 핸드북 토글
    await scoring1.toggleHandbook(memberId);

    // 실시간 업데이트 대기 (Supabase realtime)
    await teacher2Page.waitForTimeout(5000);

    // 교사2: 점수가 변경되었는지 확인
    const updatedTotal = await memberTotalOnTeacher2.textContent();
    // 초기값과 다르면 실시간 동기화 성공
    // (초기값이 0pt이고 출석+핸드북으로 점수가 추가되었을 것)
    expect(updatedTotal).not.toBe(initialTotal);
  });
});
