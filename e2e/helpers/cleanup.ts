import { supabaseAdmin } from './supabase-client';

/**
 * 특정 날짜의 테스트 데이터를 FK 순서에 따라 삭제합니다.
 * docs/CRITICAL_test-reset-queries.sql 기반.
 */
export async function cleanupTestData(trainingDate: string) {
  // badge 관련 테이블 (training_date 없으므로 전체 테스트 데이터 삭제)
  await cleanupBadgeTestData();

  // FK 순서: score_edit_history → weekly_scores → ...
  const tables = [
    'score_edit_history',
    'weekly_scores',
    'game_score_entries',
    'game_score_locks',
    'weekly_score_submissions',
    'member_attendance',
    'teacher_attendance',
  ];

  for (const table of tables) {
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .eq('training_date', trainingDate);

    if (error) {
      console.warn(`[cleanup] ${table} 삭제 실패:`, error.message);
    }
  }
}

/**
 * 특정 클럽의 특정 날짜 데이터만 삭제합니다.
 */
export async function cleanupClubTestData(clubId: string, trainingDate: string) {
  // club_id 컬럼이 있는 테이블만 필터
  const clubTables = [
    'weekly_scores',
    'game_score_entries',
    'game_score_locks',
    'weekly_score_submissions',
  ];

  // club_id 없는 테이블은 training_date로만 삭제
  await supabaseAdmin.from('score_edit_history').delete().eq('training_date', trainingDate);

  for (const table of clubTables) {
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .eq('club_id', clubId)
      .eq('training_date', trainingDate);

    if (error) {
      console.warn(`[cleanup] ${table} 삭제 실패:`, error.message);
    }
  }

  // 출석은 training_date로만 삭제
  await supabaseAdmin.from('member_attendance').delete().eq('training_date', trainingDate);
  await supabaseAdmin.from('teacher_attendance').delete().eq('training_date', trainingDate);
}

/**
 * 배지 신청/보유 테스트 데이터를 삭제합니다.
 * badge_requests와 member_badges는 training_date 컬럼이 없으므로
 * 최근 생성된 테스트 데이터(오늘)만 삭제합니다.
 */
export async function cleanupBadgeTestData() {
  const today = new Date().toISOString().split('T')[0];

  // badge_requests: 오늘 생성된 것만 삭제
  const { error: reqErr } = await supabaseAdmin
    .from('badge_requests')
    .delete()
    .gte('created_at', `${today}T00:00:00`)
    .lt('created_at', `${today}T23:59:59.999`);
  if (reqErr) console.warn('[cleanup] badge_requests 삭제 실패:', reqErr.message);

  // member_badges: 오늘 생성된 것만 삭제 (awarded_date는 date 타입)
  const { error: badgeErr } = await supabaseAdmin
    .from('member_badges')
    .delete()
    .eq('awarded_date', today);
  if (badgeErr) console.warn('[cleanup] member_badges 삭제 실패:', badgeErr.message);
}

/**
 * 현재 날짜(오늘)의 테스트 데이터를 삭제합니다.
 */
export async function cleanupToday() {
  const today = new Date().toISOString().split('T')[0];
  await cleanupTestData(today);
}
