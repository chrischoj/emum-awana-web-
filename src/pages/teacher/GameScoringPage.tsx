import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';
import {
  addGameScoreToMultipleTeams,
  getGameScoresByDate,
  getTeamGameTotals,
  deleteLastGameScore,
} from '../../services/gameScoreService';
import { getSubmissionsByDate } from '../../services/scoringService';
import { cn, getToday } from '../../lib/utils';
import type { GameScoreEntry, WeeklyScoreSubmission } from '../../types/awana';

const POINT_PRESETS = [50, 100, 200, 400];
const DESCRIPTION_PRESETS = ['릴레이 게임', '개별 게임', '응원 점수', '보너스', '애교 점수'];

export default function GameScoringPage() {
  const { teacher } = useAuth();
  const { currentClub, teams } = useClub();
  const [selectedDate] = useState(getToday());
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [points, setPoints] = useState(100);
  const [description, setDescription] = useState('');
  const [teamTotals, setTeamTotals] = useState<Record<string, number>>({});
  const [recentEntries, setRecentEntries] = useState<GameScoreEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [flashTeamId, setFlashTeamId] = useState<string | null>(null);
  const [teamSubmissions, setTeamSubmissions] = useState<Map<string, WeeklyScoreSubmission>>(new Map());

  const loadData = useCallback(async () => {
    if (!currentClub) return;
    const [totals, entries, subs] = await Promise.all([
      getTeamGameTotals(currentClub.id, selectedDate),
      getGameScoresByDate(currentClub.id, selectedDate),
      getSubmissionsByDate(currentClub.id, selectedDate),
    ]);
    setTeamTotals(totals);
    setRecentEntries(entries);
    const subMap = new Map<string, WeeklyScoreSubmission>();
    for (const s of subs) subMap.set(s.team_id, s);
    setTeamSubmissions(subMap);
  }, [currentClub, selectedDate]);

  useEffect(() => {
    loadData().catch(() => toast.error('데이터 로드 실패'));
  }, [loadData]);

  const isTeamLocked = (teamId: string) => {
    const sub = teamSubmissions.get(teamId);
    return sub?.status === 'submitted' || sub?.status === 'approved';
  };

  const getTeamSubmissionStatus = (teamId: string) => teamSubmissions.get(teamId);

  const toggleTeam = (teamId: string) => {
    if (isTeamLocked(teamId)) return;
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
      navigator.vibrate?.(20);

      // Flash animation
      for (const tid of selectedTeamIds) {
        setFlashTeamId(tid);
        await new Promise((r) => setTimeout(r, 200));
      }
      setFlashTeamId(null);

      // Optimistic update
      setTeamTotals((prev) => {
        const next = { ...prev };
        for (const tid of selectedTeamIds) {
          next[tid] = (next[tid] || 0) + points;
        }
        return next;
      });

      toast.success(`${selectedTeamIds.size}팀에 ${points}점 부여!`);
      setSelectedTeamIds(new Set());
      setDescription('');
      await loadData();
    } catch {
      toast.error('점수 부여 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUndo = async () => {
    if (!currentClub) return;
    try {
      await deleteLastGameScore(currentClub.id, selectedDate);
      toast.success('마지막 기록 취소됨');
      await loadData();
    } catch {
      toast.error('취소 실패');
    }
  };

  return (
    <div className="pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">게임 점수</h1>
        <span className="text-sm text-gray-500">{selectedDate}</span>
      </div>

      {/* Team score overview */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-500 mb-3">오늘의 팀 점수</h2>
        <div className="grid grid-cols-4 gap-2">
          {teams.map((team) => (
            <div
              key={team.id}
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

      {/* 잠금된 팀 안내 */}
      {teams.some(t => isTeamLocked(t.id)) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
          <p className="text-xs text-blue-700 font-medium">
            제출/승인된 팀은 점수를 수정할 수 없습니다. 담임교사가 제출한 팀은 잠금 처리됩니다.
          </p>
        </div>
      )}

      {/* 반려된 팀 안내 */}
      {teams.filter(t => teamSubmissions.get(t.id)?.status === 'rejected').map(t => {
        const sub = teamSubmissions.get(t.id)!;
        return (
          <div key={t.id} className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
            <p className="text-xs text-red-700 font-medium">
              {t.name} 팀이 반려되었습니다{sub.rejection_note ? `: ${sub.rejection_note}` : ''}
            </p>
          </div>
        );
      })}

      {/* Score input */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-500 mb-3">점수 부여</h2>

        {/* Description */}
        <div className="mb-3">
          <div className="flex flex-wrap gap-2 mb-2">
            {DESCRIPTION_PRESETS.map((desc) => (
              <button
                key={desc}
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
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="직접 입력..."
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>

        {/* Team selection */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {teams.map((team) => {
            const locked = isTeamLocked(team.id);
            const sub = getTeamSubmissionStatus(team.id);
            return (
              <button
                key={team.id}
                onClick={() => toggleTeam(team.id)}
                disabled={locked}
                className={cn(
                  'py-3 rounded-lg text-sm font-bold border-2 transition-all touch-manipulation',
                  locked
                    ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                    : selectedTeamIds.has(team.id)
                      ? 'border-current text-white active:scale-95'
                      : 'border-gray-200 text-gray-600 bg-gray-50 active:scale-95'
                )}
                style={
                  !locked && selectedTeamIds.has(team.id)
                    ? { backgroundColor: team.color, borderColor: team.color }
                    : undefined
                }
              >
                {team.name}
                <div className="text-xs mt-0.5 opacity-70">
                  {locked
                    ? (sub?.status === 'approved' ? '승인됨' : '제출됨')
                    : selectedTeamIds.has(team.id) ? '✓' : ''}
                </div>
              </button>
            );
          })}
        </div>

        {/* Points */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <button
            onClick={() => setPoints(Math.max(0, points - 50))}
            className="w-12 h-12 rounded-full bg-gray-100 text-gray-700 text-xl font-bold active:scale-95 touch-manipulation"
          >
            −
          </button>
          <input
            type="number"
            value={points}
            onChange={(e) => setPoints(Math.max(0, Number(e.target.value)))}
            className="w-24 text-center text-2xl font-bold border border-gray-300 rounded-lg py-2"
          />
          <button
            onClick={() => setPoints(points + 50)}
            className="w-12 h-12 rounded-full bg-indigo-600 text-white text-xl font-bold active:scale-95 touch-manipulation"
          >
            +
          </button>
        </div>
        <div className="flex justify-center gap-2 mb-4">
          {POINT_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPoints(p)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium',
                points === p ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'
              )}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || selectedTeamIds.size === 0}
          className="w-full py-3 rounded-lg bg-indigo-600 text-white font-bold text-base disabled:opacity-50 active:scale-[0.98] transition-all touch-manipulation"
        >
          {submitting ? '저장 중...' : `선택된 팀에 ${points}점 부여`}
        </button>
      </div>

      {/* Recent entries */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-500">점수 기록 (오늘)</h2>
          {recentEntries.length > 0 && (
            <button
              onClick={handleUndo}
              className="text-xs text-red-500 font-medium hover:text-red-700"
            >
              실행 취소
            </button>
          )}
        </div>
        {recentEntries.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">기록이 없습니다</p>
        ) : (
          <div className="space-y-2">
            {recentEntries.slice(0, 10).map((entry) => {
              const team = teams.find((t) => t.id === entry.team_id);
              const time = new Date(entry.created_at).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50"
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
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-indigo-600">+{entry.points}</span>
                    {entry.description && (
                      <span className="text-xs text-gray-400">{entry.description}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
