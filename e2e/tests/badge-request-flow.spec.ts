import { test, expect } from '../fixtures/auth.fixture';
import { cleanupBadgeTestData } from '../helpers/cleanup';
import { BADGE_REQUEST } from '../helpers/selectors';
import {
  getBadgeRequestStatus,
  getMemberBadgeCount,
  hasMemberBadge,
  getPendingBadgeRequests,
} from '../helpers/assertions';
import { TeacherScoringPage } from '../page-objects/teacher-scoring.page';
import { supabaseAdmin } from '../helpers/supabase-client';

// ── 테스트용 시드 배지 ──
const SEED_BADGES = [
  { name: 'E2E 테스트 배지 A', badge_type: 'custom' as const, category: 'jewel' as const, sort_order: 9901 },
  { name: 'E2E 테스트 배지 B', badge_type: 'custom' as const, category: 'promotion' as const, sort_order: 9902 },
];

let seededBadgeIds: string[] = [];

/** 테스트용 배지 시드 (없으면 생성) */
async function seedBadges() {
  // 이미 존재하면 재사용
  const { data: existing } = await supabaseAdmin
    .from('badges')
    .select('id, name')
    .in('name', SEED_BADGES.map((b) => b.name));

  if (existing && existing.length >= 2) {
    seededBadgeIds = existing.map((b) => b.id);
    return existing;
  }

  // 없으면 insert
  const { data, error } = await supabaseAdmin
    .from('badges')
    .insert(SEED_BADGES)
    .select('id, name');
  if (error) throw new Error(`배지 시드 실패: ${error.message}`);
  seededBadgeIds = (data ?? []).map((b) => b.id);
  return data!;
}

/** 시드 배지 삭제 */
async function cleanupSeedBadges() {
  if (seededBadgeIds.length > 0) {
    await supabaseAdmin.from('badges').delete().in('id', seededBadgeIds);
    seededBadgeIds = [];
  }
}

async function getFirstBadge(): Promise<{ id: string; name: string }> {
  const { data } = await supabaseAdmin
    .from('badges')
    .select('id, name')
    .in('name', SEED_BADGES.map((b) => b.name))
    .order('name', { ascending: true })
    .limit(1);
  if (!data || data.length === 0) throw new Error('시드 배지를 찾을 수 없습니다');
  return data[0];
}

async function getSecondBadge(): Promise<{ id: string; name: string }> {
  const { data } = await supabaseAdmin
    .from('badges')
    .select('id, name')
    .in('name', SEED_BADGES.map((b) => b.name))
    .order('name', { ascending: true })
    .limit(2);
  if (!data || data.length < 2) throw new Error('시드 배지 2개를 찾을 수 없습니다');
  return data[1];
}

test.describe('뱃지 신청 → 승인/반려 흐름', () => {
  test.beforeAll(async () => {
    await seedBadges();
  });

  test.beforeEach(async () => {
    await cleanupBadgeTestData();
  });

  test.afterAll(async () => {
    await cleanupBadgeTestData();
    await cleanupSeedBadges();
  });

  test('교사 뱃지 신청 → 관리자 승인 → member_badges 자동 INSERT', async ({
    teacher1Page,
    adminPage,
  }) => {
    const teacherScoring = new TeacherScoringPage(teacher1Page);
    const adminScoring = new TeacherScoringPage(adminPage);
    const badge = await getFirstBadge();

    // 1. 교사: 점수 페이지 이동
    await teacherScoring.goto();
    await teacher1Page.waitForTimeout(2000);

    // 2. 첫번째 멤버 카드 찾기
    const firstMemberCard = teacher1Page.locator('[data-testid^="member-card-"]').first();
    await expect(firstMemberCard).toBeVisible({ timeout: 10_000 });
    const memberId = (await firstMemberCard.getAttribute('data-testid'))!.replace('member-card-', '');

    // 3. 뱃지 패널 열기
    await teacherScoring.openBadgePanel(memberId);
    await teacher1Page.waitForTimeout(500);

    // 4. 뱃지 칩 선택
    const chipLocator = teacher1Page.locator(BADGE_REQUEST.chip(badge.id));
    await expect(chipLocator).toBeVisible({ timeout: 5_000 });
    await teacherScoring.selectBadgeChip(badge.id);

    // 5. 메모 입력
    await teacherScoring.fillBadgeNote('E2E 테스트 신청');

    // 6. 신청하기
    await teacherScoring.submitBadgeRequest();
    await teacher1Page.waitForTimeout(3000);

    // 7. DB 검증 - 대기 중 신청이 있어야 함
    const pending = await getPendingBadgeRequests(memberId);
    expect(pending.length).toBe(1);
    expect(pending[0].badge_id).toBe(badge.id);
    const requestId = pending[0].id;

    // 8. 관리자: 점수 페이지에서 배너 확인
    await adminScoring.goto();
    await adminPage.waitForTimeout(3000);

    const banner = adminPage.locator(BADGE_REQUEST.reviewBanner);
    await expect(banner).toBeVisible({ timeout: 10_000 });

    // 9. 모아보기 모달 열기
    await adminScoring.openBadgeReviewModal();
    await adminPage.waitForTimeout(1500);

    // 10. 승인 버튼 클릭
    const approveBtn = adminPage.locator(BADGE_REQUEST.approveButton(requestId));
    await expect(approveBtn).toBeVisible({ timeout: 10_000 });
    await adminScoring.approveBadgeRequest(requestId);
    await adminPage.waitForTimeout(2500);

    // 11. DB 검증 - 신청 상태가 approved
    const updatedReq = await getBadgeRequestStatus(requestId);
    expect(updatedReq?.status).toBe('approved');

    // 12. DB 검증 - member_badges에 자동 INSERT 됨
    const hasBadge = await hasMemberBadge(memberId, badge.id);
    expect(hasBadge).toBe(true);
  });

  test('교사 뱃지 신청 → 관리자 반려 → 반려 사유 확인', async ({
    teacher1Page,
    adminPage,
  }) => {
    const teacherScoring = new TeacherScoringPage(teacher1Page);
    const adminScoring = new TeacherScoringPage(adminPage);
    const badge = await getSecondBadge();

    // 1. 교사: 뱃지 신청
    await teacherScoring.goto();
    await teacher1Page.waitForTimeout(2000);

    const firstMemberCard = teacher1Page.locator('[data-testid^="member-card-"]').first();
    await expect(firstMemberCard).toBeVisible({ timeout: 10_000 });
    const memberId = (await firstMemberCard.getAttribute('data-testid'))!.replace('member-card-', '');

    await teacherScoring.openBadgePanel(memberId);
    await teacher1Page.waitForTimeout(500);
    await teacherScoring.selectBadgeChip(badge.id);
    await teacherScoring.submitBadgeRequest();
    await teacher1Page.waitForTimeout(3000);

    // 2. 신청 ID 확인
    const pending = await getPendingBadgeRequests(memberId);
    expect(pending.length).toBe(1);
    const requestId = pending[0].id;

    // 3. 관리자: 반려
    await adminScoring.goto();
    await adminPage.waitForTimeout(3000);

    const banner = adminPage.locator(BADGE_REQUEST.reviewBanner);
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await adminScoring.openBadgeReviewModal();
    await adminPage.waitForTimeout(1500);

    // 반려 버튼 → 사유 입력 → 반려 확인
    await adminScoring.rejectBadgeRequest(requestId, '자격 미달');
    await adminPage.waitForTimeout(2500);

    // 4. DB 검증 - 반려 상태 + 사유
    const updatedReq = await getBadgeRequestStatus(requestId);
    expect(updatedReq?.status).toBe('rejected');
    expect(updatedReq?.rejection_note).toBe('자격 미달');

    // 5. member_badges에 INSERT 되지 않아야 함
    const hasBadge = await hasMemberBadge(memberId, badge.id);
    expect(hasBadge).toBe(false);
  });

  test('동일 뱃지 중복 신청 차단 (대기 중인 신청이 있으면 칩 비활성)', async ({
    teacher1Page,
  }) => {
    const teacherScoring = new TeacherScoringPage(teacher1Page);
    const badge = await getSecondBadge();

    // 1. 교사: 첫 번째 신청
    await teacherScoring.goto();
    await teacher1Page.waitForTimeout(2000);

    const firstMemberCard = teacher1Page.locator('[data-testid^="member-card-"]').first();
    await expect(firstMemberCard).toBeVisible({ timeout: 10_000 });
    const memberId = (await firstMemberCard.getAttribute('data-testid'))!.replace('member-card-', '');

    await teacherScoring.openBadgePanel(memberId);
    await teacher1Page.waitForTimeout(500);
    await teacherScoring.selectBadgeChip(badge.id);
    await teacherScoring.submitBadgeRequest();
    await teacher1Page.waitForTimeout(3000);

    // 2. 페이지 새로고침 후 패널 다시 열기 (realtime 데이터 반영)
    await teacherScoring.goto();
    await teacher1Page.waitForTimeout(2000);
    await teacherScoring.openBadgePanel(memberId);
    await teacher1Page.waitForTimeout(500);

    // 3. 같은 뱃지 칩이 disabled 상태여야 함
    const chip = teacher1Page.locator(BADGE_REQUEST.chip(badge.id));
    await expect(chip).toBeDisabled({ timeout: 5_000 });

    // "대기" 텍스트가 칩 내에 표시되어야 함
    await expect(chip).toContainText('대기');
  });

  test('승인 후 재신청 차단 (보유 뱃지 칩 비활성)', async ({
    teacher1Page,
    adminPage,
  }) => {
    const teacherScoring = new TeacherScoringPage(teacher1Page);
    const adminScoring = new TeacherScoringPage(adminPage);
    const badge = await getSecondBadge();

    // 1. 교사: 뱃지 신청
    await teacherScoring.goto();
    await teacher1Page.waitForTimeout(2000);

    const firstMemberCard = teacher1Page.locator('[data-testid^="member-card-"]').first();
    await expect(firstMemberCard).toBeVisible({ timeout: 10_000 });
    const memberId = (await firstMemberCard.getAttribute('data-testid'))!.replace('member-card-', '');

    await teacherScoring.openBadgePanel(memberId);
    await teacher1Page.waitForTimeout(500);
    await teacherScoring.selectBadgeChip(badge.id);
    await teacherScoring.submitBadgeRequest();
    await teacher1Page.waitForTimeout(3000);

    // 2. 관리자: 승인
    const pending = await getPendingBadgeRequests(memberId);
    const requestId = pending.find((r) => r.badge_id === badge.id)!.id;

    await adminScoring.goto();
    await adminPage.waitForTimeout(3000);
    await adminScoring.openBadgeReviewModal();
    await adminPage.waitForTimeout(1500);
    await adminScoring.approveBadgeRequest(requestId);
    await adminPage.waitForTimeout(2500);

    // 3. 교사: 페이지 새로고침 후 패널 열기
    await teacherScoring.goto();
    await teacher1Page.waitForTimeout(2000);
    await teacherScoring.openBadgePanel(memberId);
    await teacher1Page.waitForTimeout(500);

    // 4. 승인된 뱃지 칩이 disabled + "보유" 표시
    const chip = teacher1Page.locator(BADGE_REQUEST.chip(badge.id));
    await expect(chip).toBeDisabled({ timeout: 5_000 });
    await expect(chip).toContainText('보유');

    // 5. DB 검증 - member_badges에 존재
    const count = await getMemberBadgeCount(memberId);
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
