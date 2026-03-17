import { supabase } from '../lib/supabase';
import type { WeeklyScore, ScoringCategory, MemberWeeklySummary, Member } from '../types/awana';

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
