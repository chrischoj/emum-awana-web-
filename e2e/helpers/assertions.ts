import { expect } from '@playwright/test';
import { supabaseAdmin } from './supabase-client';

/** 특정 멤버의 특정 날짜 점수를 DB에서 직접 조회 */
export async function getScoresForMember(memberId: string, trainingDate: string) {
  const { data, error } = await supabaseAdmin
    .from('weekly_scores')
    .select('*')
    .eq('member_id', memberId)
    .eq('training_date', trainingDate);

  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  return data ?? [];
}

/** 특정 멤버의 특정 카테고리 점수 조회 */
export async function getScoreByCategory(
  memberId: string,
  trainingDate: string,
  category: string
) {
  const { data, error } = await supabaseAdmin
    .from('weekly_scores')
    .select('*')
    .eq('member_id', memberId)
    .eq('training_date', trainingDate)
    .eq('category', category)
    .maybeSingle();

  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  return data;
}

/** 특정 팀의 게임 점수 합계 조회 */
export async function getGameScoreTotalForTeam(
  teamId: string,
  trainingDate: string
) {
  const { data, error } = await supabaseAdmin
    .from('game_score_entries')
    .select('points')
    .eq('team_id', teamId)
    .eq('training_date', trainingDate);

  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  return (data ?? []).reduce((sum, row) => sum + row.points, 0);
}

/** 특정 팀의 게임 점수 항목 수 조회 */
export async function getGameScoreCountForTeam(
  teamId: string,
  trainingDate: string
) {
  const { data, error } = await supabaseAdmin
    .from('game_score_entries')
    .select('id')
    .eq('team_id', teamId)
    .eq('training_date', trainingDate);

  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  return data?.length ?? 0;
}

/** 제출 상태 조회 */
export async function getSubmissionStatus(
  clubId: string,
  teamId: string,
  trainingDate: string
) {
  const { data, error } = await supabaseAdmin
    .from('weekly_score_submissions')
    .select('*')
    .eq('club_id', clubId)
    .eq('team_id', teamId)
    .eq('training_date', trainingDate)
    .maybeSingle();

  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  return data;
}

/** 출석 상태 조회 */
export async function getAttendanceForMember(
  memberId: string,
  trainingDate: string
) {
  const { data, error } = await supabaseAdmin
    .from('member_attendance')
    .select('*')
    .eq('member_id', memberId)
    .eq('training_date', trainingDate)
    .maybeSingle();

  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  return data;
}

/** 출석 레코드 수 조회 (중복 확인용) */
export async function getAttendanceCount(
  memberId: string,
  trainingDate: string
) {
  const { data, error } = await supabaseAdmin
    .from('member_attendance')
    .select('id')
    .eq('member_id', memberId)
    .eq('training_date', trainingDate);

  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  return data?.length ?? 0;
}

/** DB에서 점수 합계가 기대값과 일치하는지 검증 */
export async function assertTeamGameTotal(
  teamId: string,
  trainingDate: string,
  expectedTotal: number
) {
  const actual = await getGameScoreTotalForTeam(teamId, trainingDate);
  expect(actual).toBe(expectedTotal);
}

/** 특정 멤버의 주간 점수 합계 검증 */
export async function assertMemberWeeklyTotal(
  memberId: string,
  trainingDate: string,
  expectedTotal: number
) {
  const scores = await getScoresForMember(memberId, trainingDate);
  const actual = scores.reduce((sum, s) => sum + (s.total_points ?? 0), 0);
  expect(actual).toBe(expectedTotal);
}

/** 배지 신청 상태 조회 */
export async function getBadgeRequestStatus(requestId: string) {
  const { data, error } = await supabaseAdmin
    .from('badge_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  return data;
}

/** 특정 멤버의 배지 보유 수 조회 */
export async function getMemberBadgeCount(memberId: string) {
  const { data, error } = await supabaseAdmin
    .from('member_badges')
    .select('id')
    .eq('member_id', memberId);

  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  return data?.length ?? 0;
}

/** 특정 멤버의 특정 배지 보유 여부 */
export async function hasMemberBadge(memberId: string, badgeId: string) {
  const { data, error } = await supabaseAdmin
    .from('member_badges')
    .select('id')
    .eq('member_id', memberId)
    .eq('badge_id', badgeId)
    .maybeSingle();

  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  return data !== null;
}

/** 특정 멤버의 대기 중 배지 신청 목록 조회 */
export async function getPendingBadgeRequests(memberId: string) {
  const { data, error } = await supabaseAdmin
    .from('badge_requests')
    .select('*')
    .eq('member_id', memberId)
    .eq('status', 'requested');

  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  return data ?? [];
}

/** 게임 점수 잠금 상태 조회 */
export async function getGameScoreLock(clubId: string, trainingDate: string) {
  const { data, error } = await supabaseAdmin
    .from('game_score_locks')
    .select('*')
    .eq('club_id', clubId)
    .eq('training_date', trainingDate)
    .maybeSingle();

  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  return data;
}

// ── Room-level submission helpers ──

/** 제출 상태 조회 (room 단위) */
export async function getSubmissionByRoom(
  roomId: string,
  trainingDate: string
) {
  const { data, error } = await supabaseAdmin
    .from('weekly_score_submissions')
    .select('*')
    .eq('room_id', roomId)
    .eq('training_date', trainingDate)
    .maybeSingle();

  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  return data;
}

/** 특정 팀의 교실 목록 조회 */
export async function getRoomsForTeam(teamId: string) {
  const { data, error } = await supabaseAdmin
    .from('rooms')
    .select('*')
    .eq('team_id', teamId)
    .eq('active', true);

  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  return data ?? [];
}

/** 교사의 배정된 교실 조회 */
export async function getTeacherAssignedRooms(teacherId: string) {
  const { data, error } = await supabaseAdmin
    .from('active_teacher_assignments')
    .select('*')
    .eq('teacher_id', teacherId);

  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  return data ?? [];
}
