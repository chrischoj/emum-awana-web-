import { test, expect } from '../fixtures/auth.fixture';
import { cleanupTestData } from '../helpers/cleanup';
import { getScoresForMember, getScoreByCategory } from '../helpers/assertions';
import { TeacherScoringPage } from '../page-objects/teacher-scoring.page';

const TEST_DATE = new Date().toISOString().split('T')[0];

test.describe('동시 점수 입력', () => {
  test.beforeEach(async () => {
    await cleanupTestData(TEST_DATE);
  });

  test('두 교사가 서로 다른 팀 점수 동시 입력 → 모두 정확 저장', async ({
    teacher1Page,
    teacher2Page,
  }) => {
    const scoring1 = new TeacherScoringPage(teacher1Page);
    const scoring2 = new TeacherScoringPage(teacher2Page);

    // 두 교사 동시에 점수 페이지 이동
    await Promise.all([scoring1.goto(), scoring2.goto()]);
    await Promise.all([
      teacher1Page.waitForTimeout(2000),
      teacher2Page.waitForTimeout(2000),
    ]);

    // 각 교사의 첫번째 멤버 카드 찾기
    const card1 = teacher1Page.locator('[data-testid^="member-card-"]').first();
    const card2 = teacher2Page.locator('[data-testid^="member-card-"]').first();

    await expect(card1).toBeVisible({ timeout: 10_000 });
    await expect(card2).toBeVisible({ timeout: 10_000 });

    const memberId1 = (await card1.getAttribute('data-testid'))!.replace('member-card-', '');
    const memberId2 = (await card2.getAttribute('data-testid'))!.replace('member-card-', '');

    // 동시에 출석 탭
    await Promise.all([
      scoring1.tapAttendance(memberId1),
      scoring2.tapAttendance(memberId2),
    ]);

    // 동시에 핸드북 토글
    await Promise.all([
      scoring1.toggleHandbook(memberId1),
      scoring2.toggleHandbook(memberId2),
    ]);

    // debounce + sync 대기
    await Promise.all([
      teacher1Page.waitForTimeout(2000),
      teacher2Page.waitForTimeout(2000),
    ]);

    // DB 검증 - 양쪽 모두 정확히 저장
    const scores1 = await getScoresForMember(memberId1, TEST_DATE);
    const scores2 = await getScoresForMember(memberId2, TEST_DATE);

    expect(scores1.length).toBeGreaterThan(0);
    expect(scores2.length).toBeGreaterThan(0);

    // 각 멤버의 출석 점수 확인
    const att1 = await getScoreByCategory(memberId1, TEST_DATE, 'attendance');
    const att2 = await getScoreByCategory(memberId2, TEST_DATE, 'attendance');
    expect(att1).not.toBeNull();
    expect(att2).not.toBeNull();
  });

  test('동일 멤버에 동시 upsert → last-write-wins, UNIQUE 제약 준수', async ({
    teacher1Page,
    teacher2Page,
  }) => {
    const scoring1 = new TeacherScoringPage(teacher1Page);
    const scoring2 = new TeacherScoringPage(teacher2Page);

    await Promise.all([scoring1.goto(), scoring2.goto()]);
    await Promise.all([
      teacher1Page.waitForTimeout(2000),
      teacher2Page.waitForTimeout(2000),
    ]);

    // 동일 멤버 찾기
    const card1 = teacher1Page.locator('[data-testid^="member-card-"]').first();
    await expect(card1).toBeVisible({ timeout: 10_000 });
    const memberId = (await card1.getAttribute('data-testid'))!.replace('member-card-', '');

    // 양쪽에서 동시에 같은 멤버 핸드북 토글
    await Promise.all([
      scoring1.toggleHandbook(memberId),
      scoring2.toggleHandbook(memberId),
    ]);

    // sync 대기
    await Promise.all([
      teacher1Page.waitForTimeout(2000),
      teacher2Page.waitForTimeout(2000),
    ]);

    // DB 검증 - UNIQUE 제약 조건 덕분에 정확히 1개 레코드만 존재
    const hbScore = await getScoreByCategory(memberId, TEST_DATE, 'handbook');
    // upsert이므로 반드시 1개만 존재 (중복 없음)
    expect(hbScore).not.toBeNull();
  });
});
