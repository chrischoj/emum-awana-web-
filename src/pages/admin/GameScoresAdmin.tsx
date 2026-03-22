import { useState, useEffect, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useClub } from '../../contexts/ClubContext';
import { getGameScoresByDate, getTeamGameTotals, updateGameScore, deleteGameScore, getGameScoreLock, lockGameScores, unlockGameScores } from '../../services/gameScoreService';
import type { GameScoreLock } from '../../services/gameScoreService';
import { useAuth } from '../../contexts/AuthContext';
import { getToday, cn, sortTeamsByColor } from '../../lib/utils';
import type { GameScoreEntry, Team } from '../../types/awana';
import { DatePickerWithToday } from '../../components/ui/DatePickerWithToday';
import { useAppResume } from '../../hooks/useAppResume';

interface ColorTotal {
  name: string;
  color: string;
  total: number;
  teamIds: string[];
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
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setTick] = useState(0);

  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const teacherNamesLoaded = useRef(false);

  useEffect(() => {
    if (teacherNamesLoaded.current) return;
    supabase.from('teachers').select('id, name').then(({ data }) => {
      const nameMap = new Map<string, string>();
      for (const t of (data || [])) nameMap.set(t.id, t.name);
      setTeacherNames(nameMap);
      teacherNamesLoaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (viewMode !== 'all') {
      const club = clubs.find((c) => c.id === viewMode);
      if (club && club.id !== currentClub?.id) setCurrentClub(club);
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
      const [totals, data, lock] = await Promise.all([
        getTeamGameTotals(currentClub.id, selectedDate),
        getGameScoresByDate(currentClub.id, selectedDate),
        getGameScoreLock(currentClub.id, selectedDate),
      ]);
      setTeamTotals(totals);
      setEntries(data);
      setGameLock(lock);
    } catch {
      toast.error('데이터 로드 실패');
    } finally {
      setLastUpdated(new Date());
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
      setGameLock(null);

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
        totals.push({ name, color, total, teamIds });
      }
      setColorTotals(sortTeamsByColor(totals));
    } catch {
      toast.error('데이터 로드 실패');
    } finally {
      setLastUpdated(new Date());
      setLoading(false);
    }
  }

  useAppResume(() => {
    if (viewMode === 'all') loadAllData();
    else loadClubData();
  });

  useEffect(() => {
    if (!lastUpdated) return;
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (viewMode === 'all') await loadAllData();
      else await loadClubData();
      toast.success('갱신됨');
    } finally {
      setRefreshing(false);
    }
  };

  const getTimeSinceUpdate = () => {
    if (!lastUpdated) return '';
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 5) return '방금 전';
    if (seconds < 60) return `${seconds}초 전`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}분 전`;
  };

  useEffect(() => {
    const debouncedRefresh = () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = setTimeout(() => {
        if (viewMode === 'all') loadAllData();
        else loadClubData();
      }, 300);
    };
    const channel = supabase
      .channel(`admin-game-scores-${selectedDate}-${viewMode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_score_entries' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_score_locks' }, debouncedRefresh)
      .subscribe();
    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
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

  // ── Entries grouped by team/color column (oldest first = newest at bottom) ─
  const columnData = useMemo(() => {
    if (viewMode === 'all') {
      // Group by color name across clubs
      return colorTotals.map((ct) => ({
        key: ct.name,
        name: ct.name,
        color: ct.color,
        total: ct.total,
        entries: entries
          .filter((e) => ct.teamIds.includes(e.team_id))
          .slice()
          .reverse(), // oldest first, newest at bottom
      }));
    } else {
      // Per-club: group by team
      const sorted = sortTeamsByColor(teams);
      return sorted.map((team) => ({
        key: team.id,
        name: team.name,
        color: team.color,
        total: teamTotals[team.id] || 0,
        entries: entries
          .filter((e) => e.team_id === team.id)
          .slice()
          .reverse(), // oldest first, newest at bottom
      }));
    }
  }, [viewMode, colorTotals, teams, teamTotals, entries]);

  const teamColorGradient = (color: string) =>
    `linear-gradient(135deg, ${color}DD, ${color}99)`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">게임 점수 관리</h1>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          </button>
          {lastUpdated && (
            <span className="text-xs text-gray-400">{getTimeSinceUpdate()}</span>
          )}
        </div>
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
        <DatePickerWithToday value={selectedDate} onChange={setSelectedDate} />
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

      {/* Team-based column history */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold mb-3">팀별 점수 기록</h2>
        {loading ? (
          <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" /></div>
        ) : entries.length === 0 ? (
          <p className="text-gray-400 text-center py-4 text-sm">기록이 없습니다</p>
        ) : (
          <div className={cn(
            'grid gap-3',
            columnData.length <= 4 ? 'grid-cols-4' : `grid-cols-${Math.min(columnData.length, 6)}`
          )}>
            {columnData.map((col) => (
              <div key={col.key} className="min-w-0">
                {/* Column header */}
                <div
                  className="rounded-t-lg px-3 py-2 text-center"
                  style={{ background: teamColorGradient(col.color) }}
                >
                  <p className="text-xs font-bold text-white truncate">{col.name}</p>
                  <p className="text-lg font-extrabold text-white tabular-nums">{col.total.toLocaleString()}</p>
                </div>

                {/* Entries (oldest first, newest at bottom) */}
                <div className="border border-t-0 border-gray-100 rounded-b-lg bg-gray-50 min-h-[80px] max-h-[400px] overflow-y-auto">
                  {col.entries.length === 0 ? (
                    <p className="text-xs text-gray-300 text-center py-4">-</p>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {col.entries.map((entry) => {
                        const teacherName = entry.recorded_by ? teacherNames.get(entry.recorded_by) : null;
                        const time = new Date(entry.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                        return (
                          <div
                            key={entry.id}
                            className="px-2.5 py-2 hover:bg-white transition-colors group"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-400">{time}</span>
                              <span className="text-sm font-bold tabular-nums" style={{ color: col.color }}>
                                +{entry.points}
                              </span>
                            </div>
                            {entry.description && (
                              <p className="text-[11px] text-gray-500 truncate mt-0.5">{entry.description}</p>
                            )}
                            {viewMode === 'all' && (
                              <p className="text-[10px] text-gray-400 mt-0.5">{clubMap.get(entry.club_id) || ''}</p>
                            )}
                            {teacherName && (
                              <p className="text-[10px] text-gray-400">{teacherName}</p>
                            )}
                            <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleStartEdit(entry)}
                                className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium"
                              >
                                수정
                              </button>
                              <button
                                onClick={() => handleDeleteEntry(entry.id)}
                                className="text-[10px] text-red-400 hover:text-red-600 font-medium"
                              >
                                삭제
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
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
