import { test, expect } from '../fixtures/auth.fixture';
import { cleanupTestData } from '../helpers/cleanup';
import { getAttendanceForMember, getAttendanceCount } from '../helpers/assertions';
import { TeacherAttendancePage } from '../page-objects/teacher-attendance.page';

const TEST_DATE = new Date().toISOString().split('T')[0];

test.describe('동시 출석', () => {
  test.beforeEach(async () => {
    await cleanupTestData(TEST_DATE);
  });

  test('일괄 출석 vs 개별 변경 동시 → 최종 상태 일관', async ({
    teacher1Page,
    teacher2Page,
  }) => {
    const att1 = new TeacherAttendancePage(teacher1Page);
    const att2 = new TeacherAttendancePage(teacher2Page);

    await Promise.all([att1.goto(), att2.goto()]);
    await Promise.all([
      teacher1Page.waitForTimeout(2000),
      teacher2Page.waitForTimeout(2000),
    ]);

    // 교사2: 첫번째 멤버를 찾아서 개별 출석 토글
    const memberRow = teacher2Page.locator('[data-testid^="att-member-"]').first();
    await expect(memberRow).toBeVisible({ timeout: 10_000 });
    const memberId = (await memberRow.getAttribute('data-testid'))!.replace('att-member-', '');

    // 동시에: 교사1 = 전체 출석, 교사2 = 개별 토글 (지각으로)
    await Promise.all([
      att1.bulkPresent(),
      (async () => {
        await att2.tapStatus(memberId); // none → present
        await teacher2Page.waitForTimeout(200);
        await att2.tapStatus(memberId); // present → late
      })(),
    ]);

    // 서버 처리 대기
    await teacher1Page.waitForTimeout(3000);

    // DB 검증 - member_attendance에 정확히 1개 레코드 (UNIQUE 제약)
    const count = await getAttendanceCount(memberId, TEST_DATE);
    expect(count).toBe(1);

    // 상태는 'present' 또는 'late' 중 하나 (last-write-wins)
    const record = await getAttendanceForMember(memberId, TEST_DATE);
    expect(record).not.toBeNull();
    expect(['present', 'late']).toContain(record!.status);
  });
});
