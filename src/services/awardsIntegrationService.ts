import { supabase } from '../lib/supabase';
import type { AwardsData, TeamName, ClubType } from '../types/awana';
import { TEAM_NAMES } from '../types/awana';

const AWARDS_BASE_URL = 'https://awana-awards.netlify.app';

export async function getTeamHandbookTotals(
  clubId: string,
  dateFrom: string,
  dateTo: string
): Promise<Record<string, number>> {
  const { data: scores, error } = await supabase
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
  for (const score of scores || []) {
    const teamId = memberTeamMap.get(score.member_id);
    if (teamId) {
      teamTotals[teamId] = (teamTotals[teamId] || 0) + (score.total_points || 0);
    }
  }
  return teamTotals;
}

export async function getTeamGameTotals(
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

export async function buildAwardsData(
  dateFrom: string,
  dateTo: string
): Promise<AwardsData> {
  const { data: clubs } = await supabase.from('clubs').select('id, type');

  const result: AwardsData = {
    handbook: {
      sparks: { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0 },
      tnt: { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0 },
    },
    game: {
      sparks: { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0 },
      tnt: { RED: 0, BLUE: 0, GREEN: 0, YELLOW: 0 },
    },
  };

  for (const club of clubs || []) {
    const clubType = club.type as ClubType;

    const { data: teamsData } = await supabase
      .from('teams')
      .select('id, name')
      .eq('club_id', club.id);

    const teamNameMap = new Map<string, TeamName>();
    for (const t of teamsData || []) {
      if (TEAM_NAMES.includes(t.name as TeamName)) {
        teamNameMap.set(t.id, t.name as TeamName);
      }
    }

    const [hbTotals, gmTotals] = await Promise.all([
      getTeamHandbookTotals(club.id, dateFrom, dateTo),
      getTeamGameTotals(club.id, dateFrom, dateTo),
    ]);

    for (const [teamId, points] of Object.entries(hbTotals)) {
      const teamName = teamNameMap.get(teamId);
      if (teamName) {
        result.handbook[clubType][teamName] += points;
      }
    }

    for (const [teamId, points] of Object.entries(gmTotals)) {
      const teamName = teamNameMap.get(teamId);
      if (teamName) {
        result.game[clubType][teamName] += points;
      }
    }
  }

  return result;
}

export function buildCeremonyUrl(data: AwardsData): string {
  const order = [
    ...TEAM_NAMES.map((t) => data.handbook.sparks[t] ?? 0),
    ...TEAM_NAMES.map((t) => data.handbook.tnt[t] ?? 0),
    ...TEAM_NAMES.map((t) => data.game.sparks[t] ?? 0),
    ...TEAM_NAMES.map((t) => data.game.tnt[t] ?? 0),
  ];
  const encoded = btoa(encodeURIComponent(order.join(',')));
  return `${AWARDS_BASE_URL}/?d=${encodeURIComponent(encoded)}`;
}
