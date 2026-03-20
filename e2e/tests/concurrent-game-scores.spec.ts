import { test, expect } from '../fixtures/auth.fixture';
import { cleanupTestData } from '../helpers/cleanup';
import { getGameScoreTotalForTeam, getGameScoreCountForTeam } from '../helpers/assertions';
import { TeacherGamePage } from '../page-objects/teacher-game.page';

const TEST_DATE = new Date().toISOString().split('T')[0];

test.describe('동시 게임 점수', () => {
  test.beforeEach(async () => {
    await cleanupTestData(TEST_DATE);
  });

  test('세 교사 동시 게임 점수 추가 → 합산 정확', async ({
    teacher1Page,
    teacher2Page,
    teacher3Page,
  }) => {
    const game1 = new TeacherGamePage(teacher1Page);
    const game2 = new TeacherGamePage(teacher2Page);
    const game3 = new TeacherGamePage(teacher3Page);

    // 동시에 게임 점수 페이지 이동
    await Promise.all([game1.goto(), game2.goto(), game3.goto()]);
    await Promise.all([
      teacher1Page.waitForTimeout(2000),
      teacher2Page.waitForTimeout(2000),
      teacher3Page.waitForTimeout(2000),
    ]);

    // 첫번째 팀 버튼 찾기
    const teamBtn1 = teacher1Page.locator('[data-testid^="game-team-btn-"]').first();
    await expect(teamBtn1).toBeVisible({ timeout: 10_000 });
    const teamId = (await teamBtn1.getAttribute('data-testid'))!.replace('game-team-btn-', '');

    // 세 교사가 같은 팀에 동시에 100점씩 부여
    await Promise.all([
      game1.selectTeam(teamId),
      game2.selectTeam(teamId),
      game3.selectTeam(teamId),
    ]);

    await Promise.all([
      game1.selectPointPreset(100),
      game2.selectPointPreset(100),
      game3.selectPointPreset(100),
    ]);

    // 동시 제출
    await Promise.all([game1.submit(), game2.submit(), game3.submit()]);

    // 서버 처리 대기
    await teacher1Page.waitForTimeout(3000);

    // DB 검증 - 3개 항목, 합계 300점
    const total = await getGameScoreTotalForTeam(teamId, TEST_DATE);
    const count = await getGameScoreCountForTeam(teamId, TEST_DATE);

    expect(count).toBe(3);
    expect(total).toBe(300);
  });

  test('잠금 상태에서 입력 시도 → UI에서 차단', async ({ teacher1Page, adminPage }) => {
    const game = new TeacherGamePage(teacher1Page);
    await game.goto();
    await teacher1Page.waitForTimeout(2000);

    // 관리자가 게임 잠금 설정 (DB 직접 조작)
    const { supabaseAdmin } = await import('../helpers/supabase-client');

    // 현재 클럽 ID 가져오기
    const { data: clubs } = await supabaseAdmin.from('clubs').select('id').limit(1);
    if (!clubs || clubs.length === 0) {
      test.skip();
      return;
    }

    await supabaseAdmin.from('game_score_locks').upsert({
      club_id: clubs[0].id,
      training_date: TEST_DATE,
      locked_by: 'test-admin',
    });

    // 교사 페이지 리로드
    await game.goto();
    await teacher1Page.waitForTimeout(2000);

    // 잠금 배너 확인
    const locked = await game.isLocked();
    expect(locked).toBe(true);

    // 정리
    await supabaseAdmin
      .from('game_score_locks')
      .delete()
      .eq('club_id', clubs[0].id)
      .eq('training_date', TEST_DATE);
  });
});
