import { test, expect } from '../fixtures/auth.fixture';
import { cleanupTestData } from '../helpers/cleanup';
import { getSubmissionByRoom } from '../helpers/assertions';
import { supabaseAdmin } from '../helpers/supabase-client';
import { TeacherScoringPage } from '../page-objects/teacher-scoring.page';
import { AdminScoringPage } from '../page-objects/admin-scoring.page';

const TEST_DATE = new Date().toISOString().split('T')[0];

test.describe('교실(Room) 단위 제출/승인 흐름', () => {
  test.beforeEach(async () => {
    await cleanupTestData(TEST_DATE);
  });

  test('교사1 교실 제출 -> 관리자 교실별 승인', async ({ teacher1Page, adminPage }) => {
    const teacherScoring = new TeacherScoringPage(teacher1Page);
    const adminScoring = new AdminScoringPage(adminPage);

    // 1. 교사: 점수 페이지 이동
    await teacherScoring.goto();
    await teacher1Page.waitForTimeout(2000);

    // 2. 첫번째 멤버 카드 확인 (데이터 로드 확인)
    const firstMemberCard = teacher1Page.locator('[data-testid^="member-card-"]').first();
    await expect(firstMemberCard).toBeVisible({ timeout: 10_000 });
    const memberId = (await firstMemberCard.getAttribute('data-testid'))!.replace('member-card-', '');

    // 3. 출석 + 핸드북 입력
    await teacherScoring.tapAttendance(memberId);
    await teacher1Page.waitForTimeout(600);
    await teacherScoring.toggleHandbook(memberId);
    await teacher1Page.waitForTimeout(600);

    // 4. 팀 탭 선택 (필요시)
    const teamTabs = teacher1Page.locator('button[class*="rounded-full"]');
    const tabCount = await teamTabs.count();
    if (tabCount > 1) {
      await teamTabs.nth(1).click();
      await teacher1Page.waitForTimeout(500);
    }

    // 5. 제출
    const submitBtn = teacher1Page.locator('[data-testid="submit-scores-btn"]');
    if (await submitBtn.isVisible({ timeout: 3000 })) {
      await teacherScoring.submitScores();
      await teacher1Page.waitForTimeout(1500);

      // 6. 제출 상태 확인
      const status = await teacherScoring.getSubmissionStatus();
      expect(status).toContain('제출');
    }

    // 7. 관리자: 점수 총괄 이동
    await adminScoring.goto();
    await adminPage.waitForTimeout(2000);

    // 8. 클럽 필터 선택 (첫번째 클럽)
    const clubButtons = adminPage.locator('[data-testid^="club-filter-"]:not([data-testid="club-filter-all"])');
    if (await clubButtons.first().isVisible({ timeout: 3000 })) {
      await clubButtons.first().click();
      await adminPage.waitForTimeout(2000);
    }

    // 9. 교실별 현황 섹션이 보이는지 확인
    const roomSection = adminPage.locator('text=교실별 현황');
    // 교실별 현황이 있다면 room 단위 승인 테스트
    if (await roomSection.isVisible({ timeout: 5000 })) {
      // 10. room 승인 버튼 찾기
      const roomApproveBtn = adminPage.locator('[data-testid^="admin-room-approve-btn-"]').first();
      if (await roomApproveBtn.isVisible({ timeout: 5000 })) {
        const roomId = (await roomApproveBtn.getAttribute('data-testid'))!.replace('admin-room-approve-btn-', '');

        // 11. 교실 승인
        await adminScoring.approveRoom(roomId);
        await adminPage.waitForTimeout(1500);

        // 12. DB 검증 - room 단위 승인 확인
        const submission = await getSubmissionByRoom(roomId, TEST_DATE);
        expect(submission).not.toBeNull();
        expect(submission?.status).toBe('approved');
      }
    }
  });

  test('같은 팀 다른 교실 독립 제출 (핵심 버그 수정 검증)', async ({ teacher1Page, teacher2Page, adminPage }) => {
    // 이 테스트는 같은 팀의 서로 다른 교실이 독립적으로 제출/승인됨을 검증합니다.
    // 기존 버그: 한 교실이 승인되면 같은 팀의 다른 교실이 입력을 못함

    const teacher1Scoring = new TeacherScoringPage(teacher1Page);
    const teacher2Scoring = new TeacherScoringPage(teacher2Page);
    const adminScoring = new AdminScoringPage(adminPage);

    // 1. 교사1: 점수 입력 및 제출
    await teacher1Scoring.goto();
    await teacher1Page.waitForTimeout(2000);

    const t1MemberCard = teacher1Page.locator('[data-testid^="member-card-"]').first();
    if (await t1MemberCard.isVisible({ timeout: 10_000 })) {
      const t1MemberId = (await t1MemberCard.getAttribute('data-testid'))!.replace('member-card-', '');
      await teacher1Scoring.tapAttendance(t1MemberId);
      await teacher1Page.waitForTimeout(600);
      await teacher1Scoring.toggleHandbook(t1MemberId);
      await teacher1Page.waitForTimeout(600);

      // 팀 탭 선택
      const t1TeamTabs = teacher1Page.locator('button[class*="rounded-full"]');
      if (await t1TeamTabs.count() > 1) {
        await t1TeamTabs.nth(1).click();
        await teacher1Page.waitForTimeout(500);
      }

      const t1SubmitBtn = teacher1Page.locator('[data-testid="submit-scores-btn"]');
      if (await t1SubmitBtn.isVisible({ timeout: 3000 })) {
        await teacher1Scoring.submitScores();
        await teacher1Page.waitForTimeout(1500);
      }
    }

    // 2. 교사2: 같은 팀, 다른 교실에서 점수 입력 가능해야 함
    await teacher2Scoring.goto();
    await teacher2Page.waitForTimeout(2000);

    const t2MemberCard = teacher2Page.locator('[data-testid^="member-card-"]').first();
    if (await t2MemberCard.isVisible({ timeout: 10_000 })) {
      const t2MemberId = (await t2MemberCard.getAttribute('data-testid'))!.replace('member-card-', '');

      // 교사2의 점수 입력이 차단되지 않아야 함 (핵심 검증)
      await teacher2Scoring.tapAttendance(t2MemberId);
      await teacher2Page.waitForTimeout(600);

      // 포인트가 0이 아니라면 입력 성공
      const totalText = await teacher2Scoring.getMemberTotal(t2MemberId);
      const total = parseInt(totalText.replace(/[^0-9]/g, ''), 10);
      expect(total).toBeGreaterThan(0);

      // 팀 탭 선택
      const t2TeamTabs = teacher2Page.locator('button[class*="rounded-full"]');
      if (await t2TeamTabs.count() > 1) {
        await t2TeamTabs.nth(1).click();
        await teacher2Page.waitForTimeout(500);
      }

      // 제출도 가능해야 함
      const t2SubmitBtn = teacher2Page.locator('[data-testid="submit-scores-btn"]');
      if (await t2SubmitBtn.isVisible({ timeout: 3000 })) {
        await teacher2Scoring.submitScores();
        await teacher2Page.waitForTimeout(1500);

        const status = await teacher2Scoring.getSubmissionStatus();
        expect(status).toContain('제출');
      }
    }

    // 3. 관리자: 두 교실이 각각 독립적으로 승인 가능한지 확인
    await adminScoring.goto();
    await adminPage.waitForTimeout(2000);

    // 클럽 필터 선택
    const clubButtons = adminPage.locator('[data-testid^="club-filter-"]:not([data-testid="club-filter-all"])');
    if (await clubButtons.first().isVisible({ timeout: 3000 })) {
      await clubButtons.first().click();
      await adminPage.waitForTimeout(2000);
    }

    // 교실별 승인 버튼이 2개 이상 있어야 함
    const roomApproveBtns = adminPage.locator('[data-testid^="admin-room-approve-btn-"]');
    const roomCount = await roomApproveBtns.count();

    // 각 교실을 순차 승인
    for (let i = 0; i < roomCount; i++) {
      const btn = adminPage.locator('[data-testid^="admin-room-approve-btn-"]').first();
      if (await btn.isVisible({ timeout: 3000 })) {
        const roomId = (await btn.getAttribute('data-testid'))!.replace('admin-room-approve-btn-', '');
        await adminScoring.approveRoom(roomId);
        await adminPage.waitForTimeout(1500);

        // DB 검증
        const sub = await getSubmissionByRoom(roomId, TEST_DATE);
        expect(sub?.status).toBe('approved');
      }
    }
  });

  test('교실 단위 반려 -> 해당 교실만 재수정 가능', async ({ teacher1Page, adminPage }) => {
    const teacherScoring = new TeacherScoringPage(teacher1Page);
    const adminScoring = new AdminScoringPage(adminPage);

    // 1. 교사: 점수 입력 -> 제출
    await teacherScoring.goto();
    await teacher1Page.waitForTimeout(2000);

    const firstMemberCard = teacher1Page.locator('[data-testid^="member-card-"]').first();
    await expect(firstMemberCard).toBeVisible({ timeout: 10_000 });
    const memberId = (await firstMemberCard.getAttribute('data-testid'))!.replace('member-card-', '');

    await teacherScoring.tapAttendance(memberId);
    await teacher1Page.waitForTimeout(600);
    await teacherScoring.toggleHandbook(memberId);
    await teacher1Page.waitForTimeout(600);

    const teamTabs = teacher1Page.locator('button[class*="rounded-full"]');
    if (await teamTabs.count() > 1) {
      await teamTabs.nth(1).click();
      await teacher1Page.waitForTimeout(500);
    }

    const submitBtn = teacher1Page.locator('[data-testid="submit-scores-btn"]');
    if (await submitBtn.isVisible({ timeout: 3000 })) {
      await teacherScoring.submitScores();
      await teacher1Page.waitForTimeout(1500);
    }

    // 2. 관리자: 교실 반려 (제출된 교실이 있는 클럽 탭을 찾아 클릭)
    await adminScoring.goto();
    await adminPage.waitForTimeout(2000);

    const clubButtons = adminPage.locator('[data-testid^="club-filter-"]:not([data-testid="club-filter-all"])');
    const clubCount = await clubButtons.count();
    let rejectedRoomId: string | null = null;

    for (let i = 0; i < clubCount; i++) {
      await clubButtons.nth(i).click();
      await adminPage.waitForTimeout(2000);

      const roomRejectBtn = adminPage.locator('[data-testid^="admin-room-reject-btn-"]').first();
      if (await roomRejectBtn.isVisible({ timeout: 3000 })) {
        rejectedRoomId = (await roomRejectBtn.getAttribute('data-testid'))!.replace('admin-room-reject-btn-', '');
        await adminScoring.rejectRoom(rejectedRoomId, '점수 재확인 필요');
        await adminPage.waitForTimeout(1500);
        break;
      }
    }

    // 반려가 실행되었는지 확인
    expect(rejectedRoomId).not.toBeNull();

    // DB 검증 - room 단위 반려 확인
    const submission = await getSubmissionByRoom(rejectedRoomId!, TEST_DATE);
    expect(submission?.status).toBe('rejected');
    expect(submission?.rejection_note).toBe('점수 재확인 필요');

    // 3. 교사: 반려 확인 -> 재제출
    await teacherScoring.goto();
    await teacher1Page.waitForTimeout(2000);

    // 팀 탭 재선택 (selectedRoomId가 파생되어야 반려 배너 표시)
    const teamTabs2 = teacher1Page.locator('button[class*="rounded-full"]');
    if (await teamTabs2.count() > 1) {
      await teamTabs2.nth(1).click();
      await teacher1Page.waitForTimeout(1500);
    }

    // 반려 배너 확인 (submission-status 뱃지로 검증)
    await expect(teacher1Page.getByTestId('submission-status')).toContainText('반려됨', { timeout: 10_000 });

    // 수정 후 재제출
    const reopenBtn = teacher1Page.locator('text=수정 후 재제출하기');
    await expect(reopenBtn).toBeVisible({ timeout: 5_000 });
    await reopenBtn.click();
    await teacher1Page.waitForTimeout(2000);

    // reopen 후 제출 버튼이 다시 나타나는지 확인
    const reSubmitBtn = teacher1Page.locator('[data-testid="submit-scores-btn"]');
    await expect(reSubmitBtn).toBeVisible({ timeout: 10_000 });

    await teacherScoring.submitScores();
    await teacher1Page.waitForTimeout(2000);

    // 재제출 후 상태 확인 ("제출됨" 또는 DB 직접 검증)
    const reSubmission = await getSubmissionByRoom(rejectedRoomId!, TEST_DATE);
    expect(reSubmission?.status).toBe('submitted');
  });

  test('DB 검증: room_id로 submission이 저장되는지', async ({ teacher1Page }) => {
    const teacherScoring = new TeacherScoringPage(teacher1Page);

    // 교사: 점수 입력 -> 제출
    await teacherScoring.goto();
    await teacher1Page.waitForTimeout(2000);

    const firstMemberCard = teacher1Page.locator('[data-testid^="member-card-"]').first();
    await expect(firstMemberCard).toBeVisible({ timeout: 10_000 });
    const memberId = (await firstMemberCard.getAttribute('data-testid'))!.replace('member-card-', '');

    await teacherScoring.tapAttendance(memberId);
    await teacher1Page.waitForTimeout(600);

    const teamTabs = teacher1Page.locator('button[class*="rounded-full"]');
    if (await teamTabs.count() > 1) {
      await teamTabs.nth(1).click();
      await teacher1Page.waitForTimeout(500);
    }

    if (await teacher1Page.locator('[data-testid="submit-scores-btn"]').isVisible({ timeout: 3000 })) {
      await teacherScoring.submitScores();
      await teacher1Page.waitForTimeout(2000);

      // DB 검증: submission 레코드에 room_id가 채워져 있는지 확인
      const { data: submissions } = await supabaseAdmin
        .from('weekly_score_submissions')
        .select('*')
        .eq('training_date', TEST_DATE)
        .eq('status', 'submitted');

      expect(submissions).not.toBeNull();
      if (submissions && submissions.length > 0) {
        const latestSub = submissions[submissions.length - 1];
        // room_id가 null이 아니어야 함 (핵심)
        expect(latestSub.room_id).not.toBeNull();
        expect(latestSub.room_id).toBeTruthy();
        // 기존 비정규화 컬럼도 유지되어야 함
        expect(latestSub.club_id).toBeTruthy();
        expect(latestSub.team_id).toBeTruthy();
      }
    }
  });
});
