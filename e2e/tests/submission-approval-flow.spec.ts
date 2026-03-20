import { test, expect } from '../fixtures/auth.fixture';
import { cleanupTestData } from '../helpers/cleanup';
import { getSubmissionStatus, getScoresForMember } from '../helpers/assertions';
import { TeacherScoringPage } from '../page-objects/teacher-scoring.page';
import { AdminScoringPage } from '../page-objects/admin-scoring.page';

const TEST_DATE = new Date().toISOString().split('T')[0];

test.describe('제출-승인 전체 흐름', () => {
  test.beforeEach(async () => {
    await cleanupTestData(TEST_DATE);
  });

  test('교사 점수입력 → 제출 → 관리자 승인', async ({ teacher1Page, adminPage }) => {
    const teacherScoring = new TeacherScoringPage(teacher1Page);
    const adminScoring = new AdminScoringPage(adminPage);

    // 1. 교사: 점수 페이지 이동
    await teacherScoring.goto();
    await teacher1Page.waitForTimeout(2000); // 데이터 로드 대기

    // 2. 교사: 첫번째 보이는 멤버 카드의 출석 탭
    // (실제 멤버 ID는 런타임에 결정되므로 첫번째 멤버 카드를 찾아서 사용)
    const firstMemberCard = teacher1Page.locator('[data-testid^="member-card-"]').first();
    await expect(firstMemberCard).toBeVisible({ timeout: 10_000 });
    const memberId = (await firstMemberCard.getAttribute('data-testid'))!.replace('member-card-', '');

    // 3. 교사: 출석 입력
    await teacherScoring.tapAttendance(memberId);
    await teacher1Page.waitForTimeout(600); // debounce 대기

    // 4. 교사: 핸드북 토글
    await teacherScoring.toggleHandbook(memberId);
    await teacher1Page.waitForTimeout(600);

    // 5. DB 검증 - 점수가 저장되었는지
    await teacher1Page.waitForTimeout(1500); // sync 대기
    const scores = await getScoresForMember(memberId, TEST_DATE);
    expect(scores.length).toBeGreaterThan(0);

    // 6. 교사: 제출
    // 팀 선택이 필요할 수 있으므로 첫번째 팀 탭 클릭
    const firstTeamTab = teacher1Page.locator('[data-testid^="team-tab-"]').first();
    if (await firstTeamTab.isVisible()) {
      await firstTeamTab.click();
      await teacher1Page.waitForTimeout(500);
    }

    await teacherScoring.submitScores();
    await teacher1Page.waitForTimeout(1000);

    // 7. UI 검증 - 제출 상태
    const status = await teacherScoring.getSubmissionStatus();
    expect(status).toContain('제출');

    // 8. 관리자: 승인 페이지 이동
    await adminScoring.goto();
    await adminPage.waitForTimeout(2000);

    // 9. 관리자: 승인 버튼 클릭 (첫번째 승인 가능한 팀)
    const approveBtn = adminPage.locator('[data-testid^="admin-approve-btn-"]').first();
    if (await approveBtn.isVisible({ timeout: 5_000 })) {
      const teamId = (await approveBtn.getAttribute('data-testid'))!.replace('admin-approve-btn-', '');
      await adminScoring.approveTeam(teamId);
      await adminPage.waitForTimeout(1000);
    }
  });

  test('반려 → 재제출 → 재승인', async ({ teacher1Page, adminPage }) => {
    const teacherScoring = new TeacherScoringPage(teacher1Page);
    const adminScoring = new AdminScoringPage(adminPage);

    // 1. 교사: 점수 입력 후 제출
    await teacherScoring.goto();
    await teacher1Page.waitForTimeout(2000);

    const firstMemberCard = teacher1Page.locator('[data-testid^="member-card-"]').first();
    await expect(firstMemberCard).toBeVisible({ timeout: 10_000 });
    const memberId = (await firstMemberCard.getAttribute('data-testid'))!.replace('member-card-', '');

    await teacherScoring.tapAttendance(memberId);
    await teacher1Page.waitForTimeout(600);

    const firstTeamTab = teacher1Page.locator('[data-testid^="team-tab-"]').first();
    if (await firstTeamTab.isVisible()) {
      await firstTeamTab.click();
      await teacher1Page.waitForTimeout(500);
    }

    await teacherScoring.submitScores();
    await teacher1Page.waitForTimeout(1000);

    // 2. 관리자: 반려
    await adminScoring.goto();
    await adminPage.waitForTimeout(2000);

    const rejectBtn = adminPage.locator('[data-testid^="admin-reject-btn-"]').first();
    if (await rejectBtn.isVisible({ timeout: 5_000 })) {
      const teamId = (await rejectBtn.getAttribute('data-testid'))!.replace('admin-reject-btn-', '');
      await adminScoring.rejectTeam(teamId, '점수 재확인 필요');
      await adminPage.waitForTimeout(1000);
    }

    // 3. 교사: 반려 확인 후 재제출
    await teacherScoring.goto();
    await teacher1Page.waitForTimeout(2000);

    // 반려 배너가 보여야 함
    await expect(teacher1Page.locator('text=반려됨')).toBeVisible({ timeout: 5_000 });

    // 수정 후 재제출하기 클릭
    const reopenBtn = teacher1Page.locator('text=수정 후 재제출하기');
    if (await reopenBtn.isVisible()) {
      await reopenBtn.click();
      await teacher1Page.waitForTimeout(1000);
    }

    // 재제출
    await teacherScoring.submitScores();
    await teacher1Page.waitForTimeout(1000);

    // 4. 관리자: 재승인
    await adminScoring.goto();
    await adminPage.waitForTimeout(2000);

    const approveBtn = adminPage.locator('[data-testid^="admin-approve-btn-"]').first();
    if (await approveBtn.isVisible({ timeout: 5_000 })) {
      const teamId = (await approveBtn.getAttribute('data-testid'))!.replace('admin-approve-btn-', '');
      await adminScoring.approveTeam(teamId);
    }
  });
});
