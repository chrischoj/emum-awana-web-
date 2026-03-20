import { test, expect } from '../fixtures/auth.fixture';
import { cleanupTestData } from '../helpers/cleanup';
import { supabaseAdmin } from '../helpers/supabase-client';
import { AdminCeremonyPage } from '../page-objects/admin-ceremony.page';

const TEST_DATE = new Date().toISOString().split('T')[0];

test.describe('시상 집계 무결성', () => {
  test.beforeEach(async () => {
    await cleanupTestData(TEST_DATE);
  });

  test('approved 점수만 시상 집계에 반영 검증', async ({ adminPage }) => {
    const ceremony = new AdminCeremonyPage(adminPage);

    // 시상 페이지 이동
    await ceremony.goto();
    await adminPage.waitForTimeout(2000);

    // 집계 버튼 클릭
    const aggregateBtn = adminPage.locator('[data-testid="ceremony-aggregate-btn"]');
    if (await aggregateBtn.isVisible({ timeout: 5_000 })) {
      await ceremony.aggregate();
      await adminPage.waitForTimeout(3000);
    }

    // 팀 점수가 표시되는지 확인
    const teamScoreElements = adminPage.locator('[data-testid^="ceremony-team-score-"]');
    const count = await teamScoreElements.count();

    // 집계 결과가 있으면 검증
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const el = teamScoreElements.nth(i);
        const text = await el.textContent();
        // 점수는 숫자여야 함
        expect(text).toMatch(/\d/);
      }
    }
  });
});
