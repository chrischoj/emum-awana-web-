import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';
import {
  addGameScoreToMultipleTeams,
  getGameScoresByDate,
  getTeamGameTotals,
  updateGameScore,
  deleteGameScore,
  getGameScoreLock,
} from '../../services/gameScoreService';
import type { GameScoreLock } from '../../services/gameScoreService';
import { supabase } from '../../lib/supabase';
import { cn, getToday } from '../../lib/utils';
import { OfflineBanner } from '../../components/ui/OfflineBanner';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useSessionCache } from '../../hooks/useSessionCache';
import { useOfflineQueue } from '../../hooks/useOfflineQueue';
import { useAppResume } from '../../hooks/useAppResume';
import type { GameScoreEntry } from '../../types/awana';

const POINT_PRESETS = [50, 100, 200, 400];
const DESCRIPTION_PRESETS = ['릴레이 게임', '개별 게임', '응원 점수', '보너스', '애교 점수'];

export default function GameScoringPage() {
  const { teacher } = useAuth();
  const { currentClub, clubs, setCurrentClub, teams } = useClub();
  const { isOffline } = useNetworkStatus();
  const { enqueue, pendingCount } = useOfflineQueue();

  const sparksClub = clubs.find((c) => c.type === 'sparks');
  const tntClub = clubs.find((c) => c.type === 'tnt');
  const hasBothClubs = !!sparksClub && !!tntClub;
  const [selectedDate] = useState(getToday());
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [points, setPoints] = useState(100);
  const [description, setDescription] = useState('');
  const [teamTotals, setTeamTotals] = useState<Record<string, number>>({});
  const [recentEntries, setRecentEntries] = useState<GameScoreEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [flashTeamId, setFlashTeamId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<GameScoreEntry | null>(null);
  const [editPoints, setEditPoints] = useState(0);
  const [editDescription, setEditDescription] = useState('');
  const [gameLock, setGameLock] = useState<GameScoreLock | null>(null);

  const gameCacheKey = `game-${currentClub?.id}-${selectedDate}`;
  const { restore: restoreGameTotals } = useSessionCache(gameCacheKey + '-totals', teamTotals, Object.keys(teamTotals).length > 0);
  const { restore: restoreGameEntries } = useSessionCache(gameCacheKey + '-entries', recentEntries, recentEntries.length > 0);

  const handleClubSwitch = (club: typeof currentClub) => {
    if (!club || club.id === currentClub?.id) return;
    setSelectedTeamIds(new Set());
    setCurrentClub(club);
  };

  const loadData = useCallback(async () => {
    if (!currentClub) return;
    try {
      const [totals, entries, lock] = await Promise.all([
        getTeamGameTotals(currentClub.id, selectedDate),
        getGameScoresByDate(currentClub.id, selectedDate),
        getGameScoreLock(currentClub.id, selectedDate),
      ]);
      setTeamTotals(totals);
      setRecentEntries(entries);
      setGameLock(lock);
    } catch {
      // 오프라인: 캐시에서 복원
      const cachedTotals = restoreGameTotals();
      const cachedEntries = restoreGameEntries();
      if (cachedTotals && Object.keys(cachedTotals).length > 0) setTeamTotals(cachedTotals);
      if (cachedEntries && cachedEntries.length > 0) setRecentEntries(cachedEntries);
      if (navigator.onLine) toast.error('데이터 로드 실패');
    }
  }, [currentClub, selectedDate, restoreGameTotals, restoreGameEntries]);

  const isLocked = isOffline ? false : !!gameLock;

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 백그라운드→포그라운드 복귀 시 스피너 없이 데이터 갱신
  useAppResume(() => { loadData(); });

  // Realtime: 잠금 상태 변경 감지
  useEffect(() => {
    if (!currentClub) return;
    const channel = supabase
      .channel(`game-lock-${currentClub.id}-${selectedDate}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_score_locks' }, () => {
        loadData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentClub, selectedDate, loadData]);

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!currentClub || selectedTeamIds.size === 0 || points <= 0) {
      toast.error('팀과 점수를 선택하세요');
      return;
    }

    // 로컬 낙관적 업데이트 (오프라인/온라인 모두 즉시 반영)
    const applyLocal = () => {
      navigator.vibrate?.(20);
      setTeamTotals((prev) => {
        const next = { ...prev };
        for (const tid of selectedTeamIds) {
          next[tid] = (next[tid] || 0) + points;
        }
        return next;
      });
      // 로컬 기록 추가 (오프라인에서도 기록 확인 가능)
      const now = new Date().toISOString();
      const newEntries: GameScoreEntry[] = Array.from(selectedTeamIds).map((tid) => ({
        id: `local-${Date.now()}-${tid}`,
        team_id: tid,
        club_id: currentClub!.id,
        training_date: selectedDate,
        points,
        description: description || null,
        recorded_by: teacher?.id || null,
        created_at: now,
      }));
      setRecentEntries((prev) => [...newEntries, ...prev]);
    };

    if (isOffline) {
      applyLocal();
      enqueue('addGameScore', {
        teamIds: Array.from(selectedTeamIds),
        clubId: currentClub.id,
        trainingDate: selectedDate,
        points,
        description: description || undefined,
        recordedBy: teacher?.id,
      });
      toast.success(`${selectedTeamIds.size}팀에 ${points}점 부여! (오프라인)`);
      setSelectedTeamIds(new Set());
      setDescription('');
      return;
    }

    // 온라인: 서버 잠금 재확인
    const lock = await getGameScoreLock(currentClub.id, selectedDate);
    if (lock) {
      setGameLock(lock);
      toast.error('관리자가 점수를 잠금 처리했습니다');
      return;
    }
    setSubmitting(true);
    try {
      await addGameScoreToMultipleTeams({
        teamIds: Array.from(selectedTeamIds),
        clubId: currentClub.id,
        trainingDate: selectedDate,
        points,
        description: description || undefined,
        recordedBy: teacher?.id,
      });

      // Flash animation
      for (const tid of selectedTeamIds) {
        setFlashTeamId(tid);
        await new Promise((r) => setTimeout(r, 200));
      }
      setFlashTeamId(null);

      applyLocal();
      toast.success(`${selectedTeamIds.size}팀에 ${points}점 부여!`);
      setSelectedTeamIds(new Set());
      setDescription('');
      await loadData();
    } catch {
      if (navigator.onLine) toast.error('점수 부여 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!currentClub) return;
    if (isOffline) {
      // 오프라인: 로컬에서만 제거
      const entry = recentEntries.find(e => e.id === entryId);
      if (entry) {
        setRecentEntries(prev => prev.filter(e => e.id !== entryId));
        setTeamTotals(prev => ({ ...prev, [entry.team_id]: (prev[entry.team_id] || 0) - entry.points }));
        toast.success('기록 삭제됨 (오프라인)');
      }
      return;
    }
    const lock = await getGameScoreLock(currentClub.id, selectedDate);
    if (lock) { setGameLock(lock); toast.error('잠금 상태입니다'); return; }
    try {
      await deleteGameScore(entryId);
      toast.success('기록 삭제됨');
      await loadData();
    } catch {
      if (navigator.onLine) toast.error('삭제 실패');
    }
  };

  const handleStartEdit = (entry: GameScoreEntry) => {
    setEditingEntry(entry);
    setEditPoints(entry.points);
    setEditDescription(entry.description || '');
  };

  const handleSaveEdit = async () => {
    if (!editingEntry || !currentClub) return;

    if (isOffline) {
      // 오프라인: 로컬에서만 수정
      const diff = editPoints - editingEntry.points;
      setRecentEntries(prev => prev.map(e =>
        e.id === editingEntry.id ? { ...e, points: editPoints, description: editDescription } : e
      ));
      setTeamTotals(prev => ({ ...prev, [editingEntry.team_id]: (prev[editingEntry.team_id] || 0) + diff }));
      toast.success('수정됨 (오프라인)');
      setEditingEntry(null);
      return;
    }

    const lock = await getGameScoreLock(currentClub.id, selectedDate);
    if (lock) { setGameLock(lock); setEditingEntry(null); toast.error('잠금 상태입니다'); return; }
    try {
      await updateGameScore(editingEntry.id, { points: editPoints, description: editDescription });
      toast.success('수정됨');
      setEditingEntry(null);
      await loadData();
    } catch {
      if (navigator.onLine) toast.error('수정 실패');
    }
  };

  return (
    <div className="pb-4">
      {isOffline && <OfflineBanner pendingCount={pendingCount} />}

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">게임 점수</h1>
        <span className="text-sm text-gray-500">{selectedDate}</span>
      </div>

      {/* Club type selector (Sparks / T&T) */}
      {hasBothClubs && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => handleClubSwitch(sparksClub)}
            className={cn(
              'flex-1 py-2.5 rounded-lg text-sm font-bold transition-all',
              currentClub?.type === 'sparks'
                ? 'bg-red-500 text-white shadow-sm'
                : 'bg-gray-100 text-gray-500'
            )}
          >
            스팍스
          </button>
          <button
            onClick={() => handleClubSwitch(tntClub)}
            className={cn(
              'flex-1 py-2.5 rounded-lg text-sm font-bold transition-all',
              currentClub?.type === 'tnt'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-500'
            )}
          >
            티엔티
          </button>
        </div>
      )}

      {isLocked && (
        <div data-testid="game-lock-banner" className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔒</span>
            <p className="text-sm text-amber-700 font-medium">
              관리자가 이 날짜의 게임 점수를 잠금 처리했습니다. 수정할 수 없습니다.
            </p>
          </div>
        </div>
      )}

      {/* Team score overview */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-500 mb-3">오늘의 팀 점수</h2>
        <div className="grid grid-cols-4 gap-2">
          {teams.map((team) => (
            <div
              key={team.id}
              data-testid={`game-team-total-${team.id}`}
              className={cn(
                'text-center py-3 px-2 rounded-lg transition-all',
                flashTeamId === team.id && 'animate-pulse scale-105'
              )}
              style={{ backgroundColor: team.color + '20' }}
            >
              <p className="text-xs font-bold" style={{ color: team.color }}>
                {team.name}
              </p>
              <p className="text-xl font-bold mt-1" style={{ color: team.color }}>
                {(teamTotals[team.id] || 0).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Score input */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-500 mb-3">점수 부여</h2>

        {/* Description */}
        <div className="mb-3">
          <div className="flex flex-wrap gap-2 mb-2">
            {DESCRIPTION_PRESETS.map((desc) => (
              <button
                key={desc}
                data-testid={`game-desc-preset-${desc}`}
                onClick={() => setDescription(desc)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  description === desc
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                    : 'bg-gray-100 text-gray-600'
                )}
              >
                {desc}
              </button>
            ))}
          </div>
          <input
            type="text"
            data-testid="game-description-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="직접 입력..."
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>

        {/* Team selection */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {teams.map((team) => (
            <button
              key={team.id}
              data-testid={`game-team-btn-${team.id}`}
              onClick={() => !isLocked && toggleTeam(team.id)}
              disabled={isLocked}
              className={cn(
                'py-3 rounded-lg text-sm font-bold border-2 transition-all touch-manipulation',
                selectedTeamIds.has(team.id)
                  ? 'border-current text-white active:scale-95'
                  : 'border-gray-200 text-gray-600 bg-gray-50 active:scale-95'
              )}
              style={
                selectedTeamIds.has(team.id)
                  ? { backgroundColor: team.color, borderColor: team.color }
                  : undefined
              }
            >
              {team.name}
              <div className="text-xs mt-0.5 opacity-70">
                {selectedTeamIds.has(team.id) ? '✓' : ''}
              </div>
            </button>
          ))}
        </div>

        {/* Points */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <button
            data-testid="game-points-minus"
            onClick={() => setPoints(Math.max(0, points - 50))}
            disabled={isLocked}
            className="w-12 h-12 rounded-full bg-gray-100 text-gray-700 text-xl font-bold active:scale-95 touch-manipulation disabled:opacity-50"
          >
            −
          </button>
          <input
            type="number"
            data-testid="game-points-input"
            value={points}
            onChange={(e) => setPoints(Math.max(0, Number(e.target.value)))}
            className="w-24 text-center text-2xl font-bold border border-gray-300 rounded-lg py-2"
          />
          <button
            data-testid="game-points-plus"
            onClick={() => setPoints(points + 50)}
            disabled={isLocked}
            className="w-12 h-12 rounded-full bg-indigo-600 text-white text-xl font-bold active:scale-95 touch-manipulation disabled:opacity-50"
          >
            +
          </button>
        </div>
        <div className="flex justify-center gap-2 mb-4">
          {POINT_PRESETS.map((p) => (
            <button
              key={p}
              data-testid={`game-point-preset-${p}`}
              onClick={() => setPoints(p)}
              disabled={isLocked}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium disabled:opacity-50',
                points === p ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'
              )}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Submit */}
        <button
          data-testid="game-submit-btn"
          onClick={handleSubmit}
          disabled={submitting || selectedTeamIds.size === 0 || isLocked}
          className="w-full py-3 rounded-lg bg-indigo-600 text-white font-bold text-base disabled:opacity-50 active:scale-[0.98] transition-all touch-manipulation"
        >
          {submitting ? '저장 중...' : `선택된 팀에 ${points}점 부여`}
        </button>
      </div>

      {/* Recent entries */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-500">점수 기록 (오늘)</h2>
        </div>
        {recentEntries.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">기록이 없습니다</p>
        ) : (
          <div className="space-y-0">
            {recentEntries.slice(0, 10).map((entry) => {
              const team = teams.find((t) => t.id === entry.team_id);
              const time = new Date(entry.created_at).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between text-sm py-2 border-b border-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{time}</span>
                    {team && (
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium text-white"
                        style={{ backgroundColor: team.color }}
                      >
                        {team.name}
                      </span>
                    )}
                    {entry.description && (
                      <span className="text-xs text-gray-400">{entry.description}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-indigo-600">+{entry.points}</span>
                    {!isLocked && (
                      <>
                        <button
                          onClick={() => handleStartEdit(entry)}
                          className="text-xs text-gray-400 hover:text-indigo-600 px-1"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="text-xs text-gray-400 hover:text-red-600 px-1"
                        >
                          삭제
                        </button>
                      </>
                    )}
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
              <button
                onClick={() => setEditingEntry(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium"
              >
                취소
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
