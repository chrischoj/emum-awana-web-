import { supabase } from '../lib/supabase';
import type { WeeklyScore, ScoringCategory, MemberWeeklySummary, Member, WeeklyScoreSubmission, ScoreEditHistory } from '../types/awana';
import { createNotifications, getAdminTeacherIds, getTeamName, getClubName, createNotification, getRoomName } from './notificationService';

export async function getWeeklyScores(clubId: string, trainingDate: string): Promise<WeeklyScore[]> {
  const { data, error } = await supabase
    .from('weekly_scores')
    .select('*')
    .eq('club_id', clubId)
    .eq('training_date', trainingDate);

  if (error) throw error;
  return (data as WeeklyScore[]) || [];
}

export async function upsertScore(params: {
  memberId: string;
  clubId: string;
  trainingDate: string;
  category: ScoringCategory;
  basePoints: number;
  multiplier: number;
  recordedBy?: string;
}): Promise<WeeklyScore> {
  const { data, error } = await supabase
    .from('weekly_scores')
    .upsert(
      {
        member_id: params.memberId,
        club_id: params.clubId,
        training_date: params.trainingDate,
        category: params.category,
        base_points: params.basePoints,
        multiplier: params.multiplier,
        recorded_by: params.recordedBy || null,
      },
      { onConflict: 'member_id,training_date,category' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as WeeklyScore;
}

export async function deleteScore(memberId: string, trainingDate: string, category: ScoringCategory): Promise<void> {
  const { error } = await supabase
    .from('weekly_scores')
    .delete()
    .eq('member_id', memberId)
    .eq('training_date', trainingDate)
    .eq('category', category);
  if (error) throw error;
}

export async function getMemberScoreSummaries(
  clubId: string,
  trainingDate: string,
  members: Member[]
): Promise<MemberWeeklySummary[]> {
  const scores = await getWeeklyScores(clubId, trainingDate);

  const scoreMap = new Map<string, Map<ScoringCategory, WeeklyScore>>();
  for (const score of scores) {
    if (!scoreMap.has(score.member_id)) {
      scoreMap.set(score.member_id, new Map());
    }
    scoreMap.get(score.member_id)!.set(score.category, score);
  }

  return members.map((member) => {
    const memberScores = scoreMap.get(member.id);
    const categories: ScoringCategory[] = ['attendance', 'handbook', 'uniform', 'recitation'];
    const scoresRecord = {} as Record<ScoringCategory, WeeklyScore | null>;
    let totalPoints = 0;

    for (const cat of categories) {
      const score = memberScores?.get(cat) ?? null;
      scoresRecord[cat] = score;
      totalPoints += score?.total_points ?? 0;
    }

    return {
      member_id: member.id,
      member_name: member.name,
      team_id: member.team_id,
      team_name: null,
      scores: scoresRecord,
      total_points: totalPoints,
    };
  });
}

export async function getTeamScoreTotals(
  clubId: string,
  dateFrom: string,
  dateTo: string
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('weekly_scores')
    .select('member_id, total_points')
    .eq('club_id', clubId)
    .gte('training_date', dateFrom)
    .lte('training_date', dateTo);

  if (error) throw error;

  const { data: members } = await supabase
    .from('members')
    .select('id, team_id')
    .eq('club_id', clubId)
    .eq('active', true);

  const memberTeamMap = new Map<string, string>();
  for (const m of members || []) {
    if (m.team_id) memberTeamMap.set(m.id, m.team_id);
  }

  const teamTotals: Record<string, number> = {};
  for (const score of data || []) {
    const teamId = memberTeamMap.get(score.member_id);
    if (teamId) {
      teamTotals[teamId] = (teamTotals[teamId] || 0) + (score.total_points || 0);
    }
  }

  return teamTotals;
}

// ============================================
// Score Submission Workflow (점수 제출 워크플로우)
// ============================================

/** 제출 상태 조회 (교실+날짜) */
export async function getSubmission(
  roomId: string,
  trainingDate: string
): Promise<WeeklyScoreSubmission | null> {
  const { data, error } = await supabase
    .from('weekly_score_submissions')
    .select('*')
    .eq('room_id', roomId)
    .eq('training_date', trainingDate)
    .maybeSingle();
  if (error) throw error;
  return data as WeeklyScoreSubmission | null;
}

/** 제출 상태 조회 (클럽+날짜, 전체 팀) */
export async function getSubmissionsByDate(
  clubId: string,
  trainingDate: string
): Promise<WeeklyScoreSubmission[]> {
  const { data, error } = await supabase
    .from('weekly_score_submissions')
    .select('*')
    .eq('club_id', clubId)
    .eq('training_date', trainingDate);
  if (error) throw error;
  return (data as WeeklyScoreSubmission[]) || [];
}

/** 교사: draft -> submitted 제출 */
export async function submitScores(params: {
  clubId: string;
  teamId: string;
  roomId: string;
  trainingDate: string;
  submittedBy: string;
}): Promise<WeeklyScoreSubmission> {
  const { data, error } = await supabase
    .from('weekly_score_submissions')
    .upsert(
      {
        club_id: params.clubId,
        team_id: params.teamId,
        room_id: params.roomId,
        training_date: params.trainingDate,
        status: 'submitted',
        submitted_by: params.submittedBy,
        submitted_at: new Date().toISOString(),
        rejection_note: null,
      },
      { onConflict: 'room_id,training_date' }
    )
    .select()
    .single();
  if (error) throw error;

  // 알림: admin들에게 점수 제출 알림
  try {
    const [adminIds, teamName, clubName, roomName] = await Promise.all([
      getAdminTeacherIds(),
      getTeamName(params.teamId),
      getClubName(params.clubId),
      getRoomName(params.roomId),
    ]);
    await createNotifications({
      recipientIds: adminIds,
      type: 'score_submitted',
      title: `${roomName}(${teamName}/${clubName}) 점수가 제출되었습니다`,
      metadata: { team_id: params.teamId, club_id: params.clubId, room_id: params.roomId, training_date: params.trainingDate },
    });
  } catch (e) {
    console.error('점수 제출 알림 생성 실패:', e);
  }

  return data as WeeklyScoreSubmission;
}

/** 교사: rejected -> draft 로 되돌리기 (수정 시작) */
export async function reopenSubmission(params: {
  roomId: string;
  trainingDate: string;
}): Promise<void> {
  const { error } = await supabase
    .from('weekly_score_submissions')
    .update({ status: 'draft', updated_at: new Date().toISOString() })
    .eq('room_id', params.roomId)
    .eq('training_date', params.trainingDate)
    .eq('status', 'rejected');
  if (error) throw error;
}

/** 관리자: submitted -> approved */
export async function approveSubmission(params: {
  roomId: string;
  trainingDate: string;
  approvedBy: string;
  clubId: string;
  teamId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('weekly_score_submissions')
    .update({
      status: 'approved',
      approved_by: params.approvedBy,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('room_id', params.roomId)
    .eq('training_date', params.trainingDate);
  if (error) throw error;

  // 알림: 제출한 교사에게 승인 알림
  try {
    const { data: submission } = await supabase
      .from('weekly_score_submissions')
      .select('submitted_by')
      .eq('room_id', params.roomId)
      .eq('training_date', params.trainingDate)
      .single();
    if (submission?.submitted_by) {
      const [teamName, clubName, roomName] = await Promise.all([
        getTeamName(params.teamId),
        getClubName(params.clubId),
        getRoomName(params.roomId),
      ]);
      await createNotification({
        recipientId: submission.submitted_by,
        type: 'score_approved',
        title: `${roomName}(${teamName}/${clubName}) 점수가 승인되었습니다`,
        metadata: { team_id: params.teamId, club_id: params.clubId, room_id: params.roomId, training_date: params.trainingDate },
      });
    }
  } catch (e) {
    console.error('점수 승인 알림 생성 실패:', e);
  }
}

/** 관리자: submitted -> rejected */
export async function rejectSubmission(params: {
  roomId: string;
  trainingDate: string;
  rejectionNote: string;
  clubId: string;
  teamId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('weekly_score_submissions')
    .update({
      status: 'rejected',
      rejection_note: params.rejectionNote,
      updated_at: new Date().toISOString(),
    })
    .eq('room_id', params.roomId)
    .eq('training_date', params.trainingDate);
  if (error) throw error;

  // 알림: 제출한 교사에게 반려 알림
  try {
    const { data: submission } = await supabase
      .from('weekly_score_submissions')
      .select('submitted_by')
      .eq('room_id', params.roomId)
      .eq('training_date', params.trainingDate)
      .single();
    if (submission?.submitted_by) {
      const [teamName, clubName, roomName] = await Promise.all([
        getTeamName(params.teamId),
        getClubName(params.clubId),
        getRoomName(params.roomId),
      ]);
      await createNotification({
        recipientId: submission.submitted_by,
        type: 'score_rejected',
        title: `${roomName}(${teamName}/${clubName}) 점수가 반려되었습니다`,
        body: params.rejectionNote,
        metadata: { team_id: params.teamId, club_id: params.clubId, room_id: params.roomId, training_date: params.trainingDate, rejection_note: params.rejectionNote },
      });
    }
  } catch (e) {
    console.error('점수 반려 알림 생성 실패:', e);
  }
}

// ============================================
// Score Edit History (점수 수정 이력)
// ============================================

/** 관리자 점수 수정 (이력 기록 포함) */
export async function editScoreWithHistory(params: {
  weeklyScoreId: string;
  newBasePoints: number;
  newMultiplier: number;
  editedBy: string;
  editReason: string;
}): Promise<WeeklyScore> {
  // 1. 기존 점수 조회
  const { data: existing, error: fetchError } = await supabase
    .from('weekly_scores')
    .select('*')
    .eq('id', params.weeklyScoreId)
    .single();
  if (fetchError) throw fetchError;

  const oldScore = existing as WeeklyScore;
  const newTotalPoints = params.newBasePoints * params.newMultiplier;

  // 2. 이력 기록
  const { error: historyError } = await supabase
    .from('score_edit_history')
    .insert({
      weekly_score_id: params.weeklyScoreId,
      member_id: oldScore.member_id,
      club_id: oldScore.club_id,
      training_date: oldScore.training_date,
      category: oldScore.category,
      old_base_points: oldScore.base_points,
      old_multiplier: oldScore.multiplier,
      old_total_points: oldScore.total_points,
      new_base_points: params.newBasePoints,
      new_multiplier: params.newMultiplier,
      new_total_points: newTotalPoints,
      edited_by: params.editedBy,
      edit_reason: params.editReason,
    });
  if (historyError) throw historyError;

  // 3. 점수 업데이트
  const { data: updated, error: updateError } = await supabase
    .from('weekly_scores')
    .update({
      base_points: params.newBasePoints,
      multiplier: params.newMultiplier,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.weeklyScoreId)
    .select()
    .single();
  if (updateError) throw updateError;

  return updated as WeeklyScore;
}

/** 점수 수정 이력 조회 (멤버+날짜) */
export async function getScoreEditHistory(
  memberId: string,
  trainingDate: string
): Promise<ScoreEditHistory[]> {
  const { data, error } = await supabase
    .from('score_edit_history')
    .select('*')
    .eq('member_id', memberId)
    .eq('training_date', trainingDate)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as ScoreEditHistory[]) || [];
}

/** 특정 점수의 수정 이력 조회 */
export async function getScoreEditHistoryByScoreId(
  weeklyScoreId: string
): Promise<ScoreEditHistory[]> {
  const { data, error } = await supabase
    .from('score_edit_history')
    .select('*')
    .eq('weekly_score_id', weeklyScoreId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as ScoreEditHistory[]) || [];
}
