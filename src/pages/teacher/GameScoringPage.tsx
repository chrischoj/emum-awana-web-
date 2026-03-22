import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';
import {
  getGameScoresByDate,
  getTeamGameTotals,
  getGameScoreLock,
} from '../../services/gameScoreService';
import type { GameScoreLock } from '../../services/gameScoreService';
import { supabase } from '../../lib/supabase';
import { cn, getToday, sortTeamsByColor } from '../../lib/utils';
import { OfflineBanner } from '../../components/ui/OfflineBanner';
import { SyncStatusIndicator } from '../../components/ui/SyncStatusIndicator';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useSessionCache } from '../../hooks/useSessionCache';
import { useOptimisticGameQueue } from '../../hooks/useOptimisticGameQueue';
import { useAppResume } from '../../hooks/useAppResume';
import type { GameScoreEntry } from '../../types/awana';

const POINT_PRESETS = [100, 200, 400];
const STAGES = ['릴레이 게임', '개별 게임', '응원 점수', '보너스'] as const;
type Stage = (typeof STAGES)[number];

export default function GameScoringPage() {
  const { teacher } = useAuth();
  const { currentClub, clubs, setCurrentClub, teams } = useClub();
  const { isOffline } = useNetworkStatus();

  const sparksClub = clubs.find((c) => c.type === 'sparks');
  const tntClub = clubs.find((c) => c.type === 'tnt');
  const hasBothClubs = !!sparksClub && !!tntClub;
  const [selectedDate] = useState(getToday());
  const [activeStage, setActiveStage] = useState<Stage>('릴레이 게임');
  const [teamTotals, setTeamTotals] = useState<Record<string, number>>({});
  const [recentEntries, setRecentEntries] = useState<GameScoreEntry[]>([]);
  const [flashTeamId, setFlashTeamId] = useState<string | null>(null);
  const [gameLock, setGameLock] = useState<GameScoreLock | null>(null);

  // Selected preset buttons per team (toggle on/off)
  const [selectedPresets, setSelectedPresets] = useState<Record<string, Set<number>>>({});

  // BottomSheet edit state
  const [editingEntry, setEditingEntry] = useState<GameScoreEntry | null>(null);
  const [editPoints, setEditPoints] = useState(0);
  const [editDescription, setEditDescription] = useState('');

  const gameCacheKey = `game-${currentClub?.id}-${selectedDate}`;
  const { restore: restoreGameTotals } = useSessionCache(gameCacheKey + '-totals', teamTotals, Object.keys(teamTotals).length > 0);
  const { restore: restoreGameEntries } = useSessionCache(gameCacheKey + '-entries', recentEntries, recentEntries.length > 0);

  const handleClubSwitch = (club: typeof currentClub) => {
    if (!club || club.id === currentClub?.id) return;
    setSelectedPresets({});
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
      const cachedTotals = restoreGameTotals();
      const cachedEntries = restoreGameEntries();
      if (cachedTotals && Object.keys(cachedTotals).length > 0) setTeamTotals(cachedTotals);
      if (cachedEntries && cachedEntries.length > 0) setRecentEntries(cachedEntries);
      if (navigator.onLine) toast.error('데이터 로드 실패');
    }
  }, [currentClub, selectedDate, restoreGameTotals, restoreGameEntries]);

  const { enqueueAdd, enqueueUpdate, enqueueDelete, pendingCount, isSyncing } =
    useOptimisticGameQueue({
      clubId: currentClub?.id,
      date: selectedDate,
      teamTotals,
      recentEntries,
      setTeamTotals,
      setRecentEntries,
      loadData,
    });

  const isLocked = isOffline ? false : !!gameLock;

  useEffect(() => { loadData(); }, [loadData]);

  useAppResume(() => {
    if (pendingCount === 0) loadData();
  });

  useEffect(() => {
    if (!currentClub) return;
    const channel = supabase
      .channel(`game-lock-${currentClub.id}-${selectedDate}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_score_locks' }, async () => {
        try {
          const lock = await getGameScoreLock(currentClub.id, selectedDate);
          setGameLock(lock);
        } catch { /* ignore */ }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentClub, selectedDate]);

  // ── Sorted teams ──────────────────────────────────────────────
  const sortedTeams = useMemo(() => sortTeamsByColor(teams), [teams]);

  // ── Stage subtotals per team ──────────────────────────────────
  const stageSubtotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of recentEntries) {
      if (entry.description === activeStage) {
        map[entry.team_id] = (map[entry.team_id] || 0) + entry.points;
      }
    }
    return map;
  }, [recentEntries, activeStage]);

  // ── Entries grouped by team (oldest first = newest at bottom) ─
  const entriesByTeam = useMemo(() => {
    const map: Record<string, GameScoreEntry[]> = {};
    for (const team of sortedTeams) {
      map[team.id] = [];
    }
    for (const entry of recentEntries) {
      if (map[entry.team_id]) {
        map[entry.team_id].push(entry);
      }
    }
    // Reverse: oldest first so newest appears at bottom
    for (const teamId of Object.keys(map)) {
      map[teamId] = map[teamId].slice().reverse();
    }
    return map;
  }, [recentEntries, sortedTeams]);

  // ── Pending totals derived from selections ───────────────────
  const pendingTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [teamId, presets] of Object.entries(selectedPresets)) {
      const sum = Array.from(presets).reduce((a, b) => a + b, 0);
      if (sum > 0) map[teamId] = sum;
    }
    return map;
  }, [selectedPresets]);

  const hasPendingScores = useMemo(
    () => Object.keys(pendingTotals).length > 0,
    [pendingTotals],
  );

  // ── Handlers ──────────────────────────────────────────────────

  const handleTogglePreset = (teamId: string, points: number) => {
    if (isLocked) return;
    navigator.vibrate?.(15);
    setSelectedPresets((prev) => {
      const current = new Set(prev[teamId] || []);
      if (current.has(points)) {
        current.delete(points);
      } else {
        current.add(points);
      }
      return { ...prev, [teamId]: current };
    });
  };

  const handleResetAll = () => {
    setSelectedPresets({});
  };

  const handleConfirm = () => {
    if (!currentClub || !hasPendingScores) return;

    if (gameLock) {
      toast.error('관리자가 점수를 잠금 처리했습니다');
      return;
    }

    const teamsToScore = sortedTeams.filter((t) => (pendingTotals[t.id] || 0) > 0);

    for (const team of teamsToScore) {
      enqueueAdd({
        teamIds: [team.id],
        clubId: currentClub.id,
        trainingDate: selectedDate,
        points: pendingTotals[team.id],
        description: activeStage,
        recordedBy: teacher?.id,
      });
    }

    // Flash animation for all scored teams
    teamsToScore.forEach((team, i) => {
      setTimeout(() => setFlashTeamId(team.id), i * 150);
    });
    setTimeout(() => setFlashTeamId(null), teamsToScore.length * 150 + 300);

    toast.success(`${teamsToScore.length}팀 ${activeStage} 점수 반영!`);
    setSelectedPresets({});
  };

  const handleStartEdit = (entry: GameScoreEntry) => {
    setEditingEntry(entry);
    setEditPoints(entry.points);
    setEditDescription(entry.description || '');
  };

  const handleSaveEdit = () => {
    if (!editingEntry || !currentClub) return;

    if (gameLock) {
      toast.error('잠금 상태입니다');
      setEditingEntry(null);
      return;
    }

    enqueueUpdate(
      editingEntry.id,
      { points: editPoints, description: editDescription },
      editingEntry,
    );

    toast.success('수정됨');
    setEditingEntry(null);
  };

  const handleDeleteEntry = () => {
    if (!editingEntry || !currentClub) return;

    if (gameLock) {
      toast.error('잠금 상태입니다');
      setEditingEntry(null);
      return;
    }

    enqueueDelete(editingEntry.id, editingEntry);
    toast.success('삭제됨');
    setEditingEntry(null);
  };

  // ── Team color helpers ────────────────────────────────────────

  const teamColorGradient = (color: string) =>
    `linear-gradient(135deg, ${color}DD, ${color}99)`;

  return (
    <div className="pb-4">
      {isOffline ? (
        <OfflineBanner pendingCount={pendingCount} />
      ) : (
        <SyncStatusIndicator pendingCount={pendingCount} isSyncing={isSyncing} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold text-gray-900">게임 점수</h1>
        <span className="text-sm text-gray-500">{selectedDate}</span>
      </div>

      {/* Club selector */}
      {hasBothClubs && (
        <div className="flex gap-2 mb-3">
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

      {/* Lock banner */}
      {isLocked && (
        <div data-testid="game-lock-banner" className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔒</span>
            <p className="text-sm text-amber-700 font-medium">
              관리자가 이 날짜의 게임 점수를 잠금 처리했습니다.
            </p>
          </div>
        </div>
      )}

      {/* Stage tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-3 scrollbar-hide">
        {STAGES.map((stage) => (
          <button
            key={stage}
            onClick={() => setActiveStage(stage)}
            className={cn(
              'flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap',
              activeStage === stage
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 active:bg-gray-200'
            )}
          >
            {stage}
          </button>
        ))}
      </div>

      {/* Team cards 2×2 grid */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {sortedTeams.map((team) => {
          const total = teamTotals[team.id] || 0;
          const stageSub = stageSubtotals[team.id] || 0;
          const teamSelected = selectedPresets[team.id] || new Set<number>();
          const pending = pendingTotals[team.id] || 0;
          const isFlashing = flashTeamId === team.id;

          return (
            <div
              key={team.id}
              data-testid={`game-team-card-${team.id}`}
              className={cn(
                'rounded-2xl overflow-hidden border border-gray-100 shadow-sm transition-all duration-200',
                isFlashing && 'ring-2 ring-offset-1 scale-[1.02]',
                isLocked && 'opacity-60'
              )}
              style={isFlashing ? { ringColor: team.color } : undefined}
            >
              {/* Card header */}
              <div
                className="px-3 py-2 text-white"
                style={{ background: teamColorGradient(team.color) }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold drop-shadow-sm">{team.name}</span>
                  <span className="text-[11px] font-medium opacity-90">{activeStage}: {stageSub.toLocaleString()}</span>
                </div>
                <div className="flex items-baseline justify-between mt-0.5">
                  <p className="text-2xl font-extrabold tabular-nums drop-shadow-sm">
                    {total.toLocaleString()}점
                  </p>
                  {pending > 0 && (
                    <span className="text-sm font-bold bg-white/30 rounded-full px-2 py-0.5 tabular-nums">
                      +{pending.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Point preset toggle buttons */}
              <div className="grid grid-cols-3 gap-1.5 p-2.5 bg-white">
                {POINT_PRESETS.map((pts) => {
                  const isSelected = teamSelected.has(pts);
                  return (
                    <button
                      key={pts}
                      data-testid={`game-quick-${team.id}-${pts}`}
                      onClick={() => handleTogglePreset(team.id, pts)}
                      disabled={isLocked}
                      className={cn(
                        'py-2.5 rounded-lg text-sm font-bold transition-all touch-manipulation',
                        'active:scale-95 disabled:opacity-40 disabled:active:scale-100',
                        isSelected
                          ? 'border-2 shadow-sm'
                          : 'border border-gray-200'
                      )}
                      style={
                        isSelected
                          ? { backgroundColor: team.color, color: '#fff', borderColor: team.color }
                          : { backgroundColor: `${team.color}0A`, color: team.color }
                      }
                    >
                      +{pts}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirm / Reset bar */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={handleResetAll}
          disabled={!hasPendingScores}
          className="px-4 py-3 rounded-lg bg-gray-100 text-gray-600 text-sm font-semibold disabled:opacity-40 active:bg-gray-200 transition-all touch-manipulation"
        >
          초기화
        </button>
        <button
          onClick={handleConfirm}
          disabled={!hasPendingScores || isLocked}
          className="flex-1 py-3 rounded-lg bg-indigo-600 text-white font-bold text-base disabled:opacity-40 active:scale-[0.98] transition-all touch-manipulation"
        >
          {hasPendingScores
            ? `${activeStage} 점수 반영`
            : '팀별 점수를 입력하세요'}
        </button>
      </div>

      {/* Team-based history (oldest first → newest at bottom) */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">오늘의 팀별 기록</h2>

        {recentEntries.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">기록이 없습니다</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" style={{ minWidth: 0 }}>
            {sortedTeams.map((team) => {
              const entries = entriesByTeam[team.id] || [];
              const teamTotal = teamTotals[team.id] || 0;

              return (
                <div key={team.id} className="flex-shrink-0" style={{ width: `calc(25% - 6px)`, minWidth: '90px' }}>
                  {/* Team column header */}
                  <div
                    className="rounded-t-lg px-2 py-1.5 text-center"
                    style={{ background: teamColorGradient(team.color) }}
                  >
                    <p className="text-xs font-bold text-white truncate">{team.name}</p>
                    <p className="text-sm font-extrabold text-white tabular-nums">{teamTotal.toLocaleString()}</p>
                  </div>

                  {/* Entries (oldest first, newest at bottom) */}
                  <div className="border border-t-0 border-gray-100 rounded-b-lg bg-gray-50 min-h-[60px]">
                    {entries.length === 0 ? (
                      <p className="text-[10px] text-gray-300 text-center py-3">-</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {entries.map((entry) => (
                          <button
                            key={entry.id}
                            onClick={() => !isLocked && handleStartEdit(entry)}
                            className="w-full text-left px-2 py-1.5 hover:bg-white transition-colors active:bg-gray-100"
                          >
                            <p className="text-[10px] text-gray-400 truncate leading-tight min-h-[14px]">{entry.description || '\u00A0'}</p>
                            <p className="text-sm font-bold tabular-nums" style={{ color: team.color }}>
                              +{entry.points}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit/Delete BottomSheet */}
      <BottomSheet open={!!editingEntry} onClose={() => setEditingEntry(null)}>
        {editingEntry && (
          <div className="px-5 pb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">점수 수정</h3>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">점수</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {POINT_PRESETS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setEditPoints(p)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                        editPoints === p
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-700'
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={editPoints}
                  onChange={(e) => setEditPoints(Math.max(0, Number(e.target.value)))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">설명</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {STAGES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setEditDescription(s)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                        editDescription === s
                          ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                          : 'bg-gray-100 text-gray-600'
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
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
                onClick={handleDeleteEntry}
                className="px-4 py-2.5 bg-red-50 text-red-600 rounded-lg text-sm font-medium active:bg-red-100 transition-colors"
              >
                삭제
              </button>
              <button
                onClick={() => setEditingEntry(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium"
              >
                취소
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium active:bg-indigo-700 transition-colors"
              >
                저장
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
