import { supabase } from '../lib/supabase';
import type { GameScoreEntry } from '../types/awana';

export async function addGameScore(params: {
  teamId: string;
  clubId: string;
  trainingDate: string;
  points: number;
  description?: string;
  recordedBy?: string;
}): Promise<GameScoreEntry> {
  const { data, error } = await supabase
    .from('game_score_entries')
    .insert({
      team_id: params.teamId,
      club_id: params.clubId,
      training_date: params.trainingDate,
      points: params.points,
      description: params.description || null,
      recorded_by: params.recordedBy || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as GameScoreEntry;
}

export async function addGameScoreToMultipleTeams(params: {
  teamIds: string[];
  clubId: string;
  trainingDate: string;
  points: number;
  description?: string;
  recordedBy?: string;
}): Promise<GameScoreEntry[]> {
  const records = params.teamIds.map((teamId) => ({
    team_id: teamId,
    club_id: params.clubId,
    training_date: params.trainingDate,
    points: params.points,
    description: params.description || null,
    recorded_by: params.recordedBy || null,
  }));

  const { data, error } = await supabase
    .from('game_score_entries')
    .insert(records)
    .select();

  if (error) throw error;
  return (data as GameScoreEntry[]) || [];
}

export async function getGameScoresByDate(
  clubId: string,
  trainingDate: string
): Promise<GameScoreEntry[]> {
  const { data, error } = await supabase
    .from('game_score_entries')
    .select('*')
    .eq('club_id', clubId)
    .eq('training_date', trainingDate)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as GameScoreEntry[]) || [];
}

export async function getTeamGameTotals(
  clubId: string,
  trainingDate: string
): Promise<Record<string, number>> {
  const entries = await getGameScoresByDate(clubId, trainingDate);

  const totals: Record<string, number> = {};
  for (const entry of entries) {
    totals[entry.team_id] = (totals[entry.team_id] || 0) + entry.points;
  }
  return totals;
}

export async function getTeamGameTotalsForRange(
  clubId: string,
  dateFrom: string,
  dateTo: string
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('game_score_entries')
    .select('team_id, points')
    .eq('club_id', clubId)
    .gte('training_date', dateFrom)
    .lte('training_date', dateTo);

  if (error) throw error;

  const totals: Record<string, number> = {};
  for (const entry of data || []) {
    totals[entry.team_id] = (totals[entry.team_id] || 0) + entry.points;
  }
  return totals;
}

export async function deleteLastGameScore(
  clubId: string,
  trainingDate: string
): Promise<void> {
  const { data } = await supabase
    .from('game_score_entries')
    .select('id')
    .eq('club_id', clubId)
    .eq('training_date', trainingDate)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (data) {
    const { error } = await supabase
      .from('game_score_entries')
      .delete()
      .eq('id', data.id);
    if (error) throw error;
  }
}
