/**
 * 동시성 스트레스 테스트
 *
 * 아키텍처: Mother/Worker 패턴
 * - Mother: 테스트 라이프사이클(seed/cleanup), 검증(verification) 담당
 * - Worker: 개별 사용자를 시뮬레이션 (N명 동시 접근)
 *
 * 각 Worker는 독립적인 supabaseAdmin API 호출 → 실제 DB 수준 동시성
 * Promise.allSettled로 N건을 동시 발사 → 네트워크/DB 레벨 진짜 동시 접근
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-client';

const TEST_DATE = new Date().toISOString().split('T')[0];
const STRESS_MARKER = 'stress-test'; // cleanup 식별자

// ═══════════════════════════════════════════════════
// Worker Functions (개별 사용자 시뮬레이션)
// ═══════════════════════════════════════════════════

/** Worker: 점수 upsert (한 사용자가 한 멤버의 특정 카테고리 점수 입력) */
function workerUpsertScore(
  memberId: string,
  clubId: string,
  category: string,
  basePoints: number,
  multiplier = 1,
) {
  return supabaseAdmin
    .from('weekly_scores')
    .upsert(
      {
        member_id: memberId,
        club_id: clubId,
        training_date: TEST_DATE,
        category,
        base_points: basePoints,
        multiplier,
      },
      { onConflict: 'member_id,training_date,category' },
    );
}

/** Worker: 게임 점수 INSERT (한 사용자가 팀에 게임 점수 추가) */
function workerInsertGameScore(
  workerId: number,
  teamId: string,
  clubId: string,
  points: number,
) {
  return supabaseAdmin.from('game_score_entries').insert({
    team_id: teamId,
    club_id: clubId,
    training_date: TEST_DATE,
    points,
    description: `${STRESS_MARKER}-worker-${workerId}`,
  });
}

/** Worker: 출석 upsert (한 사용자가 멤버 출석 기록) */
function workerUpsertAttendance(
  memberId: string,
  status: 'present' | 'late' | 'absent',
) {
  return supabaseAdmin
    .from('member_attendance')
    .upsert(
      {
        member_id: memberId,
        training_date: TEST_DATE,
        status,
        present: status === 'present',
      },
      { onConflict: 'member_id,training_date' },
    );
}

/** Worker: 복합 작업 (한 사용자가 점수 + 출석 동시 입력) */
async function workerMixedOps(
  workerId: number,
  memberId: string,
  clubId: string,
  teamId: string,
) {
  const statuses = ['present', 'late', 'absent'] as const;
  await Promise.all([
    workerUpsertScore(memberId, clubId, 'attendance', 50),
    workerUpsertScore(memberId, clubId, 'handbook', 50),
    workerUpsertAttendance(memberId, statuses[workerId % 3]),
    workerInsertGameScore(workerId, teamId, clubId, 100),
  ]);
}

// ═══════════════════════════════════════════════════
// Mother: 테스트 엔티티 관리
// ═══════════════════════════════════════════════════

interface TestEntities {
  clubId: string;
  teams: { id: string; name: string }[];
  members: { id: string; team_id: string }[];
}

async function getTestEntities(): Promise<TestEntities> {
  const { data: clubs } = await supabaseAdmin.from('clubs').select('id').limit(1);
  if (!clubs?.length) throw new Error('No clubs found');
  const clubId = clubs[0].id;

  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('club_id', clubId);
  if (!teams?.length) throw new Error('No teams found');

  const { data: members } = await supabaseAdmin
    .from('members')
    .select('id, team_id')
    .eq('club_id', clubId)
    .eq('active', true)
    .not('team_id', 'is', null)
    .limit(20);
  if (!members?.length) throw new Error('No members found');

  return { clubId, teams, members };
}

// ═══════════════════════════════════════════════════
// Mother: Scoped Cleanup (자기 테스트 데이터만 삭제)
// ═══════════════════════════════════════════════════

async function cleanupStressTestData() {
  // 게임 점수: 마커로 식별하여 삭제
  await supabaseAdmin
    .from('game_score_entries')
    .delete()
    .like('description', `${STRESS_MARKER}%`);

  // weekly_scores: 오늘 날짜 데이터 삭제
  await supabaseAdmin
    .from('weekly_scores')
    .delete()
    .eq('training_date', TEST_DATE);

  // 출석: 오늘 날짜 데이터 삭제
  await supabaseAdmin
    .from('member_attendance')
    .delete()
    .eq('training_date', TEST_DATE);

  // 제출 상태: 오늘 날짜 데이터 삭제
  await supabaseAdmin
    .from('weekly_score_submissions')
    .delete()
    .eq('training_date', TEST_DATE);

  // 점수 수정 이력
  await supabaseAdmin
    .from('score_edit_history')
    .delete()
    .eq('training_date', TEST_DATE);
}

// ═══════════════════════════════════════════════════
// Mother: 검증 함수 (Verification)
// ═══════════════════════════════════════════════════

async function verifyUniqueConstraint(
  table: string,
  filters: Record<string, string>,
  expectedCount: number,
) {
  let query = supabaseAdmin.from(table).select('id');
  for (const [key, val] of Object.entries(filters)) {
    query = query.eq(key, val);
  }
  const { data } = await query;
  return { actual: data?.length ?? 0, expected: expectedCount };
}

// ═══════════════════════════════════════════════════
// 테스트 스위트
// ═══════════════════════════════════════════════════

test.describe('동시성 스트레스 테스트 (Mother/Worker)', () => {
  let entities: TestEntities;

  // Mother: 전체 테스트 시작 전 cleanup + entity 로드
  test.beforeAll(async () => {
    await cleanupStressTestData();
    entities = await getTestEntities();
  });

  // Mother: 각 테스트 전 cleanup (이전 테스트 잔여 데이터 제거)
  test.beforeEach(async () => {
    await cleanupStressTestData();
  });

  // Mother: 전체 테스트 후 최종 cleanup
  test.afterAll(async () => {
    await cleanupStressTestData();
  });

  // ─── 1. 점수 동시성 ───

  test('10명 동시 같은 멤버 점수 upsert → UNIQUE 1개 보장', async () => {
    const N = 10;
    const member = entities.members[0];

    // N명의 Worker가 동시에 같은 멤버의 핸드북 점수 upsert
    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        workerUpsertScore(member.id, entities.clubId, 'handbook', 50 + i),
      ),
    );

    // 검증: 모든 Worker 성공
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(N);

    // 검증: UNIQUE 제약 → 정확히 1개 레코드
    const check = await verifyUniqueConstraint(
      'weekly_scores',
      { member_id: member.id, training_date: TEST_DATE, category: 'handbook' },
      1,
    );
    expect(check.actual).toBe(check.expected);
  });

  test('10명 동시 출석 upsert → UNIQUE 1개 보장, 유효 상태', async () => {
    const N = 10;
    const member = entities.members[0];
    const statuses = ['present', 'late', 'absent'] as const;

    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        workerUpsertAttendance(member.id, statuses[i % 3]),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(N);

    // UNIQUE → 정확히 1개
    const { data } = await supabaseAdmin
      .from('member_attendance')
      .select('id, status')
      .eq('member_id', member.id)
      .eq('training_date', TEST_DATE);

    expect(data?.length).toBe(1);
    expect(['present', 'late', 'absent']).toContain(data![0].status);
  });

  test('4카테고리 × 3중복 동시 upsert → 카테고리당 정확히 1개', async () => {
    const member = entities.members[0];
    const categories = ['attendance', 'handbook', 'uniform', 'recitation'] as const;

    // 4카테고리 × 3중복 = 12 Worker 동시 실행
    const results = await Promise.allSettled(
      categories.flatMap((cat) =>
        Array.from({ length: 3 }, () =>
          workerUpsertScore(
            member.id,
            entities.clubId,
            cat,
            cat === 'recitation' ? 100 : 50,
            cat === 'recitation' ? 2 : 1,
          ),
        ),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(12);

    const { data } = await supabaseAdmin
      .from('weekly_scores')
      .select('category, total_points')
      .eq('member_id', member.id)
      .eq('training_date', TEST_DATE);

    // 각 카테고리당 1개 = 총 4개
    expect(data?.length).toBe(4);
    // 총합: 50 + 50 + 50 + 200 = 350
    const total = (data ?? []).reduce((sum, s) => sum + (s.total_points ?? 0), 0);
    expect(total).toBe(350);
  });

  // ─── 2. 게임 점수 동시성 ───

  test('10명 동시 게임 점수 INSERT → 10건 무손실, 합계 정확', async () => {
    const N = 10;
    const POINTS = 100;
    const teamId = entities.teams[0].id;

    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        workerInsertGameScore(i, teamId, entities.clubId, POINTS),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(N);

    const { data } = await supabaseAdmin
      .from('game_score_entries')
      .select('id, points')
      .eq('team_id', teamId)
      .eq('training_date', TEST_DATE)
      .like('description', `${STRESS_MARKER}%`);

    expect(data?.length).toBe(N);
    expect((data ?? []).reduce((sum, r) => sum + r.points, 0)).toBe(N * POINTS);
  });

  test('100명 동시 게임 점수 INSERT → 100건 무손실, 합계 정확', async () => {
    const N = 100;
    const POINTS = 10;
    const teamId = entities.teams[0].id;

    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        workerInsertGameScore(i, teamId, entities.clubId, POINTS),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(N);

    const { data } = await supabaseAdmin
      .from('game_score_entries')
      .select('id, points')
      .eq('team_id', teamId)
      .eq('training_date', TEST_DATE)
      .like('description', `${STRESS_MARKER}%`);

    expect(data?.length).toBe(N);
    expect((data ?? []).reduce((sum, r) => sum + r.points, 0)).toBe(N * POINTS);
  });

  // ─── 3. 복합 동시성 ───

  test('10명 복합 동시 작업 (점수+출석+게임) → 전체 무결성', async () => {
    const N = Math.min(10, entities.members.length);

    // 각 Worker가 서로 다른 멤버에 대해 복합 작업 수행
    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) => {
        const member = entities.members[i];
        const team = entities.teams.find((t) => t.id === member.team_id) ?? entities.teams[0];
        return workerMixedOps(i, member.id, entities.clubId, team.id);
      }),
    );

    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(N);

    // 검증 1: 각 멤버에 점수 2개 (attendance + handbook)
    for (let i = 0; i < N; i++) {
      const { data: scores } = await supabaseAdmin
        .from('weekly_scores')
        .select('id')
        .eq('member_id', entities.members[i].id)
        .eq('training_date', TEST_DATE);
      expect(scores?.length).toBe(2);
    }

    // 검증 2: 각 멤버에 출석 1개
    for (let i = 0; i < N; i++) {
      const { data: att } = await supabaseAdmin
        .from('member_attendance')
        .select('id')
        .eq('member_id', entities.members[i].id)
        .eq('training_date', TEST_DATE);
      expect(att?.length).toBe(1);
    }

    // 검증 3: 게임 점수 N건 존재
    const { data: gameEntries } = await supabaseAdmin
      .from('game_score_entries')
      .select('id')
      .eq('training_date', TEST_DATE)
      .like('description', `${STRESS_MARKER}%`);
    expect(gameEntries?.length).toBe(N);
  });

  test('같은 멤버에 10명 동시 복합 작업 → UNIQUE 보장 + 게임 누적', async () => {
    const N = 10;
    const member = entities.members[0];
    const teamId = member.team_id;

    // 10명이 동일 멤버에 대해 동시 작업
    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        workerMixedOps(i, member.id, entities.clubId, teamId),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(N);

    // 점수: UNIQUE → 카테고리당 1개
    const { data: scores } = await supabaseAdmin
      .from('weekly_scores')
      .select('id')
      .eq('member_id', member.id)
      .eq('training_date', TEST_DATE);
    expect(scores?.length).toBe(2); // attendance + handbook

    // 출석: UNIQUE → 1개
    const { data: att } = await supabaseAdmin
      .from('member_attendance')
      .select('id')
      .eq('member_id', member.id)
      .eq('training_date', TEST_DATE);
    expect(att?.length).toBe(1);

    // 게임: INSERT → N건 누적
    const { data: games } = await supabaseAdmin
      .from('game_score_entries')
      .select('id')
      .eq('team_id', teamId)
      .eq('training_date', TEST_DATE)
      .like('description', `${STRESS_MARKER}%`);
    expect(games?.length).toBe(N);
  });

  // ─── 4. 시상 집계 정확도 (동시 작업 후 검증) ───

  test('동시 시드 후 → 팀별 핸드북 합계 정확', async () => {
    // 모든 멤버에 4카테고리 점수를 동시 시드
    const seedFns = entities.members.flatMap((member) => [
      () => workerUpsertScore(member.id, entities.clubId, 'attendance', 50),
      () => workerUpsertScore(member.id, entities.clubId, 'handbook', 50),
      () => workerUpsertScore(member.id, entities.clubId, 'uniform', 50),
      () => workerUpsertScore(member.id, entities.clubId, 'recitation', 100, 2),
    ]);

    // 1차 동시 시드
    const results = await Promise.allSettled(seedFns.map((fn) => fn()));

    // 실패한 작업 재시도 (Supabase는 에러를 throw하지 않고 { error } 반환)
    const failedIdxs = results
      .map((r, i) =>
        r.status === 'rejected' || (r.status === 'fulfilled' && r.value?.error) ? i : -1,
      )
      .filter((i) => i >= 0);
    if (failedIdxs.length > 0) {
      await Promise.allSettled(failedIdxs.map((i) => seedFns[i]()));
    }

    // 팀별 기대값
    const expectedTeamTotals: Record<string, number> = {};
    for (const member of entities.members) {
      expectedTeamTotals[member.team_id] =
        (expectedTeamTotals[member.team_id] || 0) + 350; // 50+50+50+200
    }

    // 검증
    for (const [teamId, expectedTotal] of Object.entries(expectedTeamTotals)) {
      const teamMemberIds = entities.members
        .filter((m) => m.team_id === teamId)
        .map((m) => m.id);

      const { data } = await supabaseAdmin
        .from('weekly_scores')
        .select('total_points')
        .in('member_id', teamMemberIds)
        .eq('training_date', TEST_DATE);

      const actual = (data ?? []).reduce((sum, s) => sum + (s.total_points ?? 0), 0);
      expect(actual).toBe(expectedTotal);
    }
  });

  test('동시 시드 후 → 게임 점수 팀별 합계 정확', async () => {
    // 각 팀에 서로 다른 점수 동시 시드
    const seedOps = entities.teams.flatMap((team, i) => [
      workerInsertGameScore(i * 2, team.id, entities.clubId, (i + 1) * 100),
      workerInsertGameScore(i * 2 + 1, team.id, entities.clubId, (i + 1) * 50),
    ]);
    await Promise.allSettled(seedOps);

    for (let i = 0; i < entities.teams.length; i++) {
      const team = entities.teams[i];
      const expected = (i + 1) * 100 + (i + 1) * 50;

      const { data } = await supabaseAdmin
        .from('game_score_entries')
        .select('points')
        .eq('team_id', team.id)
        .eq('training_date', TEST_DATE)
        .like('description', `${STRESS_MARKER}%`);

      const actual = (data ?? []).reduce((sum, r) => sum + r.points, 0);
      expect(actual).toBe(expected);
    }
  });

  test('approved만 집계 반영 (rejected/draft 제외)', async () => {
    if (entities.teams.length < 2) {
      test.skip();
      return;
    }
    const approvedTeam = entities.teams[0];
    const rejectedTeam = entities.teams[1];
    const approvedMembers = entities.members.filter((m) => m.team_id === approvedTeam.id);
    const rejectedMembers = entities.members.filter((m) => m.team_id === rejectedTeam.id);

    // 양 팀 멤버에 동시 점수 시드
    const seedFns = [...approvedMembers, ...rejectedMembers].flatMap((m) => [
      () => workerUpsertScore(m.id, entities.clubId, 'handbook', 50),
      () => workerUpsertScore(m.id, entities.clubId, 'attendance', 50),
    ]);
    const seedResults = await Promise.allSettled(seedFns.map((fn) => fn()));
    const failedIdxs = seedResults
      .map((r, i) =>
        r.status === 'rejected' || (r.status === 'fulfilled' && r.value?.error) ? i : -1,
      )
      .filter((i) => i >= 0);
    if (failedIdxs.length > 0) {
      await Promise.allSettled(failedIdxs.map((i) => seedFns[i]()));
    }

    // 제출 상태 시드
    await supabaseAdmin.from('weekly_score_submissions').upsert(
      { club_id: entities.clubId, team_id: approvedTeam.id, training_date: TEST_DATE, status: 'approved' },
      { onConflict: 'club_id,team_id,training_date' },
    );
    await supabaseAdmin.from('weekly_score_submissions').upsert(
      { club_id: entities.clubId, team_id: rejectedTeam.id, training_date: TEST_DATE, status: 'rejected', rejection_note: '테스트' },
      { onConflict: 'club_id,team_id,training_date' },
    );

    // 집계 로직 재현: approved pair만 수집
    const { data: approvedSubs } = await supabaseAdmin
      .from('weekly_score_submissions')
      .select('team_id, training_date')
      .eq('club_id', entities.clubId)
      .eq('status', 'approved')
      .eq('training_date', TEST_DATE);

    const approvedSet = new Set(
      (approvedSubs ?? []).map((s) => `${s.team_id}:${s.training_date}`),
    );

    expect(approvedSet.has(`${approvedTeam.id}:${TEST_DATE}`)).toBe(true);
    expect(approvedSet.has(`${rejectedTeam.id}:${TEST_DATE}`)).toBe(false);

    // 실제 집계
    const { data: allScores } = await supabaseAdmin
      .from('weekly_scores')
      .select('member_id, total_points, training_date')
      .eq('training_date', TEST_DATE);

    const memberTeamMap = new Map(entities.members.map((m) => [m.id, m.team_id]));
    const teamTotals: Record<string, number> = {};
    for (const score of allScores ?? []) {
      const teamId = memberTeamMap.get(score.member_id);
      if (teamId && approvedSet.has(`${teamId}:${score.training_date}`)) {
        teamTotals[teamId] = (teamTotals[teamId] || 0) + (score.total_points || 0);
      }
    }

    if (approvedMembers.length > 0) {
      expect(teamTotals[approvedTeam.id]).toBeGreaterThan(0);
    }
    expect(teamTotals[rejectedTeam.id]).toBeUndefined();
  });

  test('핸드북 + 게임 Grand Total 정확도', async () => {
    const team = entities.teams[0];
    const teamMembers = entities.members.filter((m) => m.team_id === team.id);
    if (teamMembers.length === 0) { test.skip(); return; }

    // 동시 시드: 핸드북 + 게임
    const GAME_POINTS = [100, 200, 150];
    const seedFns = [
      ...teamMembers.flatMap((m) => [
        () => workerUpsertScore(m.id, entities.clubId, 'attendance', 50),
        () => workerUpsertScore(m.id, entities.clubId, 'handbook', 50),
        () => workerUpsertScore(m.id, entities.clubId, 'uniform', 50),
      ]),
      ...GAME_POINTS.map((pts, i) =>
        () => workerInsertGameScore(900 + i, team.id, entities.clubId, pts),
      ),
    ];
    const seedResults = await Promise.allSettled(seedFns.map((fn) => fn()));
    const failedSeedIdxs = seedResults
      .map((r, i) =>
        r.status === 'rejected' || (r.status === 'fulfilled' && r.value?.error) ? i : -1,
      )
      .filter((i) => i >= 0);
    if (failedSeedIdxs.length > 0) {
      await Promise.allSettled(failedSeedIdxs.map((i) => seedFns[i]()));
    }

    // 기대값
    const expectedHandbook = teamMembers.length * 150;
    const expectedGame = GAME_POINTS.reduce((a, b) => a + b, 0);

    // 실제 핸드북 합계
    const { data: hbScores } = await supabaseAdmin
      .from('weekly_scores')
      .select('total_points')
      .in('member_id', teamMembers.map((m) => m.id))
      .eq('training_date', TEST_DATE);
    const actualHandbook = (hbScores ?? []).reduce((sum, s) => sum + (s.total_points ?? 0), 0);

    // 실제 게임 합계
    const { data: gameEntries } = await supabaseAdmin
      .from('game_score_entries')
      .select('points')
      .eq('team_id', team.id)
      .eq('training_date', TEST_DATE)
      .like('description', `${STRESS_MARKER}%`);
    const actualGame = (gameEntries ?? []).reduce((sum, e) => sum + e.points, 0);

    expect(actualHandbook).toBe(expectedHandbook);
    expect(actualGame).toBe(expectedGame);
    expect(actualHandbook + actualGame).toBe(expectedHandbook + expectedGame);
  });

  test('암송 배수(multiplier) 정확도: 1x~10x', async () => {
    const member = entities.members[0];
    const testCases = [
      { multiplier: 1, expected: 100 },
      { multiplier: 3, expected: 300 },
      { multiplier: 5, expected: 500 },
      { multiplier: 10, expected: 1000 },
    ];

    for (const tc of testCases) {
      await supabaseAdmin
        .from('weekly_scores')
        .delete()
        .eq('member_id', member.id)
        .eq('training_date', TEST_DATE)
        .eq('category', 'recitation');

      await supabaseAdmin.from('weekly_scores').insert({
        member_id: member.id,
        club_id: entities.clubId,
        training_date: TEST_DATE,
        category: 'recitation',
        base_points: 100,
        multiplier: tc.multiplier,
      });

      const { data } = await supabaseAdmin
        .from('weekly_scores')
        .select('total_points')
        .eq('member_id', member.id)
        .eq('training_date', TEST_DATE)
        .eq('category', 'recitation')
        .single();

      expect(data?.total_points).toBe(tc.expected);
    }
  });
});
