import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useClub } from '../../contexts/ClubContext';
import { getGameScoresByDate, getTeamGameTotals, updateGameScore, deleteGameScore, getGameScoreLock, lockGameScores, unlockGameScores } from '../../services/gameScoreService';
import type { GameScoreLock } from '../../services/gameScoreService';
import { useAuth } from '../../contexts/AuthContext';
import { getToday, cn } from '../../lib/utils';
import type { GameScoreEntry, Team } from '../../types/awana';

interface ColorTotal {
  name: string;
  color: string;
  total: number;
}

export default function GameScoresAdmin() {
  const { currentClub, clubs, setCurrentClub, teams } = useClub();
  const { teacher: adminTeacher } = useAuth();
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [viewMode, setViewMode] = useState<'all' | string>('all');
  const [teamTotals, setTeamTotals] = useState<Record<string, number>>({});
  const [colorTotals, setColorTotals] = useState<ColorTotal[]>([]);
  const [entries, setEntries] = useState<GameScoreEntry[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [teacherNames, setTeacherNames] = useState<Map<string, string>>(new Map());
  const [editingEntry, setEditingEntry] = useState<GameScoreEntry | null>(null);
  const [editPoints, setEditPoints] = useState(0);
  const [editDescription, setEditDescription] = useState('');
  const [gameLock, setGameLock] = useState<GameScoreLock | null>(null);

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
      const [totals, data, teachersRes, lock] = await Promise.all([
        getTeamGameTotals(currentClub.id, selectedDate),
        getGameScoresByDate(currentClub.id, selectedDate),
        supabase.from('teachers').select('id, name'),
        getGameScoreLock(currentClub.id, selectedDate),
      ]);
      setTeamTotals(totals);
      setEntries(data);
      const nameMap = new Map<string, string>();
      for (const t of (teachersRes.data || [])) nameMap.set(t.id, t.name);
      setTeacherNames(nameMap);
      setGameLock(lock);
    } catch {
      toast.error('데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }

  async function loadAllData() {
    setLoading(true);
    try {
      const [teamsRes, entriesRes, teachersRes] = await Promise.all([
        supabase.from('teams').select('*').order('name'),
        supabase.from('game_score_entries').select('*').eq('training_date', selectedDate).order('created_at', { ascending: false }),
        supabase.from('teachers').select('id, name'),
      ]);

      const fetchedTeams = (teamsRes.data as Team[]) || [];
      const fetchedEntries = (entriesRes.data as GameScoreEntry[]) || [];

      setAllTeams(fetchedTeams);
      setEntries(fetchedEntries);
      setGameLock(null); // all view doesn't have per-club lock

      const nameMap = new Map<string, string>();
      for (const t of (teachersRes.data || [])) nameMap.set(t.id, t.name);
      setTeacherNames(nameMap);

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

  useEffect(() => {
    const channel = supabase
      .channel(`admin-game-scores-${selectedDate}-${viewMode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_score_entries' }, () => {
        if (viewMode === 'all') loadAllData();
        else loadClubData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_score_locks' }, () => {
        if (viewMode === 'all') loadAllData();
        else loadClubData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedDate, viewMode, currentClub, clubs]);

  const handleDeleteEntry = async (entryId: string) => {
    try {
      await deleteGameScore(entryId);
      toast.success('삭제됨');
      if (viewMode === 'all') await loadAllData();
      else await loadClubData();
    } catch {
      toast.error('삭제 실패');
    }
  };

  const handleStartEdit = (entry: GameScoreEntry) => {
    setEditingEntry(entry);
    setEditPoints(entry.points);
    setEditDescription(entry.description || '');
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) return;
    try {
      await updateGameScore(editingEntry.id, { points: editPoints, description: editDescription });
      toast.success('수정됨');
      setEditingEntry(null);
      if (viewMode === 'all') await loadAllData();
      else await loadClubData();
    } catch {
      toast.error('수정 실패');
    }
  };

  const handleToggleLock = async () => {
    if (!currentClub || !adminTeacher) return;
    try {
      if (gameLock) {
        await unlockGameScores(currentClub.id, selectedDate);
        toast.success('게임 점수 잠금 해제됨');
      } else {
        await lockGameScores(currentClub.id, selectedDate, adminTeacher.id);
        toast.success('게임 점수 잠금됨');
      }
      await loadClubData();
    } catch {
      toast.error('잠금 처리 실패');
    }
  };

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

      {viewMode !== 'all' && (
        <div className={cn(
          'flex items-center justify-between p-3 rounded-xl mb-4 border',
          gameLock
            ? 'bg-amber-50 border-amber-200'
            : 'bg-green-50 border-green-200'
        )}>
          <div className="flex items-center gap-2">
            <span className="text-lg">{gameLock ? '🔒' : '🔓'}</span>
            <div>
              <p className={cn('text-sm font-medium', gameLock ? 'text-amber-700' : 'text-green-700')}>
                {gameLock ? '점수가 잠겨있습니다' : '점수 입력 가능 상태'}
              </p>
              {gameLock && (
                <p className="text-xs text-amber-600">
                  {new Date(gameLock.locked_at).toLocaleString('ko-KR')} 잠금
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleToggleLock}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              gameLock
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            )}
          >
            {gameLock ? '잠금 해제' : '잠금'}
          </button>
        </div>
      )}

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
        <div className="grid grid-cols-2 gap-3 mb-6 lg:grid-cols-4">
          {teams.map((team) => (
            <div key={team.id} className="bg-white rounded-xl border border-gray-200 p-4" style={{ borderTopColor: team.color, borderTopWidth: 3 }}>
              <p className="text-sm font-bold" style={{ color: team.color }}>{team.name}</p>
              <p className="text-2xl font-bold text-center mt-1">{(teamTotals[team.id] || 0).toLocaleString()}</p>
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
              const teacherName = entry.recorded_by ? teacherNames.get(entry.recorded_by) : null;
              return (
                <div key={entry.id} className="flex items-center justify-between py-2 border-b border-gray-50 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{new Date(entry.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                    {viewMode === 'all' && (
                      <span className="text-xs text-gray-500">[{clubMap.get(entry.club_id) || ''}]</span>
                    )}
                    {team && <span className="px-2 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: team.color }}>{team.name}</span>}
                    {entry.description && <span className="text-gray-500">{entry.description}</span>}
                    {teacherName && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{teacherName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-indigo-600">+{entry.points}</span>
                    <button onClick={() => handleStartEdit(entry)} className="text-xs text-gray-400 hover:text-indigo-600 px-1">수정</button>
                    <button onClick={() => handleDeleteEntry(entry.id)} className="text-xs text-gray-400 hover:text-red-600 px-1">삭제</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editingEntry && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-4">점수 수정</h3>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">점수</label>
                <input
                  type="number"
                  value={editPoints}
                  onChange={(e) => setEditPoints(Math.max(0, Number(e.target.value)))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">설명</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="게임 설명..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditingEntry(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">취소</button>
              <button onClick={handleSaveEdit} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
