import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useClub } from '../../contexts/ClubContext';
import { getGameScoresByDate, getTeamGameTotals } from '../../services/gameScoreService';
import { getToday } from '../../lib/utils';
import type { GameScoreEntry, Team } from '../../types/awana';

interface ColorTotal {
  name: string;
  color: string;
  total: number;
}

export default function GameScoresAdmin() {
  const { currentClub, clubs, setCurrentClub, teams } = useClub();
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [viewMode, setViewMode] = useState<'all' | string>('all');
  const [teamTotals, setTeamTotals] = useState<Record<string, number>>({});
  const [colorTotals, setColorTotals] = useState<ColorTotal[]>([]);
  const [entries, setEntries] = useState<GameScoreEntry[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (viewMode !== 'all') {
      const club = clubs.find((c) => c.id === viewMode);
      if (club) setCurrentClub(club);
    }
  }, [viewMode, clubs]);

  useEffect(() => {
    if (viewMode === 'all') {
      if (clubs.length > 0) loadAllData();
    } else if (currentClub && currentClub.id === viewMode) {
      loadClubData();
    }
  }, [viewMode, currentClub, selectedDate, clubs]);

  async function loadClubData() {
    if (!currentClub) return;
    setLoading(true);
    try {
      const [totals, data] = await Promise.all([
        getTeamGameTotals(currentClub.id, selectedDate),
        getGameScoresByDate(currentClub.id, selectedDate),
      ]);
      setTeamTotals(totals);
      setEntries(data);
    } catch {
      toast.error('데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }

  async function loadAllData() {
    setLoading(true);
    try {
      const [teamsRes, entriesRes] = await Promise.all([
        supabase.from('teams').select('*').order('name'),
        supabase.from('game_score_entries').select('*').eq('training_date', selectedDate).order('created_at', { ascending: false }),
      ]);

      const fetchedTeams = (teamsRes.data as Team[]) || [];
      const fetchedEntries = (entriesRes.data as GameScoreEntry[]) || [];
      setAllTeams(fetchedTeams);
      setEntries(fetchedEntries);

      // Aggregate by color
      const colorGroupMap = new Map<string, { color: string; teamIds: string[] }>();
      for (const team of fetchedTeams) {
        const existing = colorGroupMap.get(team.name);
        if (existing) existing.teamIds.push(team.id);
        else colorGroupMap.set(team.name, { color: team.color, teamIds: [team.id] });
      }

      const totals: ColorTotal[] = [];
      for (const [name, { color, teamIds }] of colorGroupMap) {
        const total = fetchedEntries
          .filter((e) => teamIds.includes(e.team_id))
          .reduce((sum, e) => sum + e.points, 0);
        totals.push({ name, color, total });
      }
      setColorTotals(totals);
    } catch {
      toast.error('데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }

  const clubMap = new Map(clubs.map((c) => [c.id, c.name]));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">게임 점수 관리</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${viewMode === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            모두(총합)
          </button>
          {clubs.map((club) => (
            <button key={club.id} onClick={() => setViewMode(club.id)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${viewMode === club.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              {club.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>

      {/* Team/Color totals */}
      {viewMode === 'all' ? (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {colorTotals.map((ct) => (
            <div key={ct.name} className="bg-white rounded-xl border border-gray-200 p-4 text-center" style={{ borderTopColor: ct.color, borderTopWidth: 3 }}>
              <p className="text-sm font-bold" style={{ color: ct.color }}>{ct.name}</p>
              <p className="text-2xl font-bold mt-1">{ct.total.toLocaleString()}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {teams.map((team) => (
            <div key={team.id} className="bg-white rounded-xl border border-gray-200 p-4 text-center" style={{ borderTopColor: team.color, borderTopWidth: 3 }}>
              <p className="text-sm font-bold" style={{ color: team.color }}>{team.name}</p>
              <p className="text-2xl font-bold mt-1">{(teamTotals[team.id] || 0).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Entry list */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold mb-3">점수 기록</h2>
        {loading ? (
          <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" /></div>
        ) : entries.length === 0 ? (
          <p className="text-gray-400 text-center py-4 text-sm">기록이 없습니다</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => {
              const team = viewMode === 'all'
                ? allTeams.find((t) => t.id === entry.team_id)
                : teams.find((t) => t.id === entry.team_id);
              return (
                <div key={entry.id} className="flex items-center justify-between py-2 border-b border-gray-50 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{new Date(entry.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                    {viewMode === 'all' && (
                      <span className="text-xs text-gray-500">[{clubMap.get(entry.club_id) || ''}]</span>
                    )}
                    {team && <span className="px-2 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: team.color }}>{team.name}</span>}
                    {entry.description && <span className="text-gray-500">{entry.description}</span>}
                  </div>
                  <span className="font-bold text-indigo-600">+{entry.points}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
