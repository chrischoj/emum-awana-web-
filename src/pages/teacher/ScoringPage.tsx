import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';
import { getWeeklyScores, upsertScore } from '../../services/scoringService';
import { recordAttendance, getAttendancePoints } from '../../services/attendanceService';
import { cn, getToday } from '../../lib/utils';
import { Avatar } from '../../components/ui/Avatar';
import { useMemberProfile } from '../../contexts/MemberProfileContext';
import type { WeeklyScore, ScoringCategory, AttendanceStatus, Member } from '../../types/awana';

const ATTENDANCE_CYCLE: AttendanceStatus[] = ['present', 'late', 'absent'];
const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: '출석', late: '지각', absent: '결석',
};
const ATTENDANCE_COLORS: Record<AttendanceStatus, string> = {
  present: 'bg-green-100 text-green-800 border-green-400',
  late: 'bg-yellow-100 text-yellow-800 border-yellow-400',
  absent: 'bg-red-100 text-red-800 border-red-400',
};

interface MemberScoreState {
  attendance: { status: AttendanceStatus; points: number };
  handbook: { done: boolean; points: number };
  uniform: { done: boolean; points: number };
  recitation: { multiplier: number; points: number };
  total: number;
}

function calcTotal(s: Omit<MemberScoreState, 'total'>): number {
  return s.attendance.points + s.handbook.points + s.uniform.points + s.recitation.points;
}

export default function ScoringPage() {
  const { teacher } = useAuth();
  const { currentClub, curriculumTemplate, teams, members } = useClub();
  const { openMemberProfile } = useMemberProfile();
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, MemberScoreState>>({});
  const [loading, setLoading] = useState(true);
  const [recitationMemberId, setRecitationMemberId] = useState<string | null>(null);
  const pendingSyncs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const filteredMembers = selectedTeamId
    ? members.filter((m) => m.team_id === selectedTeamId)
    : members;

  // Load scores
  useEffect(() => {
    if (!currentClub) return;
    setLoading(true);

    getWeeklyScores(currentClub.id, selectedDate)
      .then((weeklyScores) => {
        const scoreMap: Record<string, MemberScoreState> = {};
        for (const member of members) {
          const memberScores = weeklyScores.filter((s) => s.member_id === member.id);
          const att = memberScores.find((s) => s.category === 'attendance');
          const hb = memberScores.find((s) => s.category === 'handbook');
          const uni = memberScores.find((s) => s.category === 'uniform');
          const rec = memberScores.find((s) => s.category === 'recitation');

          const attPoints = att?.total_points ?? 0;
          const attStatus: AttendanceStatus = attPoints >= 50 ? 'present' : 'absent';

          const state: Omit<MemberScoreState, 'total'> = {
            attendance: { status: att ? attStatus : 'present', points: att?.total_points ?? 0 },
            handbook: { done: (hb?.base_points ?? 0) > 0, points: hb?.total_points ?? 0 },
            uniform: { done: (uni?.base_points ?? 0) > 0, points: uni?.total_points ?? 0 },
            recitation: { multiplier: rec?.multiplier ?? 0, points: rec?.total_points ?? 0 },
          };
          scoreMap[member.id] = { ...state, total: calcTotal(state) };
        }
        setScores(scoreMap);
      })
      .catch(() => toast.error('점수 로드 실패'))
      .finally(() => setLoading(false));
  }, [currentClub, selectedDate, members]);

  // Debounced sync to Supabase
  const syncScore = useCallback(
    (memberId: string, category: ScoringCategory, basePoints: number, multiplier: number) => {
      if (!currentClub) return;
      const key = `${memberId}-${category}`;
      const existing = pendingSyncs.current.get(key);
      if (existing) clearTimeout(existing);

      const timeout = setTimeout(() => {
        upsertScore({
          memberId,
          clubId: currentClub.id,
          trainingDate: selectedDate,
          category,
          basePoints,
          multiplier,
          recordedBy: teacher?.id,
        }).catch(() => toast.error('점수 저장 실패'));
        pendingSyncs.current.delete(key);
      }, 500);
      pendingSyncs.current.set(key, timeout);
    },
    [currentClub, selectedDate, teacher]
  );

  const syncAttendance = useCallback(
    (memberId: string, status: AttendanceStatus) => {
      recordAttendance({
        memberId,
        trainingDate: selectedDate,
        status,
      }).catch(() => toast.error('출석 저장 실패'));
    },
    [selectedDate]
  );

  const handleAttendanceTap = (memberId: string) => {
    navigator.vibrate?.(10);
    setScores((prev) => {
      const current = prev[memberId];
      if (!current) return prev;
      const idx = ATTENDANCE_CYCLE.indexOf(current.attendance.status);
      const nextStatus = ATTENDANCE_CYCLE[(idx + 1) % 3];
      const points = getAttendancePoints(nextStatus);
      const updated = {
        ...current,
        attendance: { status: nextStatus, points },
      };
      updated.total = calcTotal(updated);
      syncScore(memberId, 'attendance', points, 1);
      syncAttendance(memberId, nextStatus);
      return { ...prev, [memberId]: updated };
    });
  };

  const handleToggle = (memberId: string, category: 'handbook' | 'uniform') => {
    navigator.vibrate?.(10);
    setScores((prev) => {
      const current = prev[memberId];
      if (!current) return prev;
      const wasOn = current[category].done;
      const points = wasOn ? 0 : 50;
      const updated = {
        ...current,
        [category]: { done: !wasOn, points },
      };
      updated.total = calcTotal(updated);
      syncScore(memberId, category, points, 1);
      return { ...prev, [memberId]: updated };
    });
  };

  const handleRecitationChange = (memberId: string, delta: number) => {
    navigator.vibrate?.(10);
    setScores((prev) => {
      const current = prev[memberId];
      if (!current) return prev;
      const newMult = Math.max(0, current.recitation.multiplier + delta);
      const points = 100 * newMult;
      const updated = {
        ...current,
        recitation: { multiplier: newMult, points },
      };
      updated.total = calcTotal(updated);
      syncScore(memberId, 'recitation', 100, newMult);
      return { ...prev, [memberId]: updated };
    });
  };

  const teamTotal = filteredMembers.reduce(
    (sum, m) => sum + (scores[m.id]?.total ?? 0),
    0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">점수 입력</h1>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-2 py-1"
        />
      </div>

      {/* Team tabs */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
        <button
          onClick={() => setSelectedTeamId(null)}
          className={cn(
            'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors',
            !selectedTeamId ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'
          )}
        >
          전체
        </button>
        {teams.map((team) => (
          <button
            key={team.id}
            onClick={() => setSelectedTeamId(team.id)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors',
              selectedTeamId === team.id
                ? 'text-white'
                : 'bg-gray-100 text-gray-700'
            )}
            style={selectedTeamId === team.id ? { backgroundColor: team.color } : undefined}
          >
            {team.name}
          </button>
        ))}
      </div>

      {/* Member cards */}
      <div className="space-y-3">
        {filteredMembers.map((member) => {
          const s = scores[member.id];
          if (!s) return null;
          const team = teams.find((t) => t.id === member.team_id);

          return (
            <div key={member.id} className="bg-white rounded-xl border border-gray-200 p-3">
              {/* Member header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {team && (
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: team.color }}
                    />
                  )}
                  <button onClick={() => openMemberProfile(member.id)} className="flex items-center gap-2 hover:opacity-80">
                    <Avatar name={member.name} src={member.avatar_url} size="sm" />
                    <span className="font-semibold text-gray-900 text-sm">{member.name}</span>
                  </button>
                </div>
                <span className="text-sm font-bold text-indigo-600">{s.total}pt</span>
              </div>

              {/* Score chips */}
              <div className="grid grid-cols-4 gap-2">
                {/* Attendance */}
                <button
                  type="button"
                  onClick={() => handleAttendanceTap(member.id)}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-lg px-1 py-2 border-2 transition-all active:scale-95 select-none touch-manipulation',
                    ATTENDANCE_COLORS[s.attendance.status]
                  )}
                >
                  <span className="text-[10px] font-medium">출석</span>
                  <span className="text-base font-bold">{s.attendance.points}</span>
                  <span className="text-[10px]">{ATTENDANCE_LABELS[s.attendance.status]}</span>
                </button>

                {/* Handbook */}
                <button
                  type="button"
                  onClick={() => handleToggle(member.id, 'handbook')}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-lg px-1 py-2 border-2 transition-all active:scale-95 select-none touch-manipulation',
                    s.handbook.done
                      ? 'bg-green-100 text-green-800 border-green-400'
                      : 'bg-gray-100 text-gray-500 border-transparent'
                  )}
                >
                  <span className="text-[10px] font-medium">핸드북</span>
                  <span className="text-base font-bold">{s.handbook.points}</span>
                  <span className="text-[10px]">{s.handbook.done ? '✓' : '✗'}</span>
                </button>

                {/* Uniform */}
                <button
                  type="button"
                  onClick={() => handleToggle(member.id, 'uniform')}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-lg px-1 py-2 border-2 transition-all active:scale-95 select-none touch-manipulation',
                    s.uniform.done
                      ? 'bg-green-100 text-green-800 border-green-400'
                      : 'bg-gray-100 text-gray-500 border-transparent'
                  )}
                >
                  <span className="text-[10px] font-medium">단복</span>
                  <span className="text-base font-bold">{s.uniform.points}</span>
                  <span className="text-[10px]">{s.uniform.done ? '✓' : '✗'}</span>
                </button>

                {/* Recitation */}
                <button
                  type="button"
                  onClick={() =>
                    setRecitationMemberId(
                      recitationMemberId === member.id ? null : member.id
                    )
                  }
                  className={cn(
                    'flex flex-col items-center justify-center rounded-lg px-1 py-2 border-2 transition-all active:scale-95 select-none touch-manipulation',
                    s.recitation.multiplier > 0
                      ? 'bg-green-100 text-green-800 border-green-400'
                      : 'bg-gray-100 text-gray-500 border-transparent'
                  )}
                >
                  <span className="text-[10px] font-medium">암송</span>
                  <span className="text-base font-bold">{s.recitation.points}</span>
                  {s.recitation.multiplier > 0 && (
                    <span className="text-[10px] text-indigo-600">x{s.recitation.multiplier}</span>
                  )}
                </button>
              </div>

              {/* Recitation stepper (inline expand) */}
              {recitationMemberId === member.id && (
                <div className="mt-2 flex items-center justify-center gap-4 py-2 bg-indigo-50 rounded-lg">
                  <button
                    type="button"
                    onClick={() => handleRecitationChange(member.id, -1)}
                    className="w-12 h-12 rounded-full bg-white border-2 border-gray-300 text-xl font-bold text-gray-700 active:scale-95 touch-manipulation"
                  >
                    −
                  </button>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-indigo-700">{s.recitation.multiplier}</p>
                    <p className="text-xs text-gray-500">구절</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRecitationChange(member.id, 1)}
                    className="w-12 h-12 rounded-full bg-indigo-600 text-white text-xl font-bold active:scale-95 touch-manipulation"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between z-20">
        <div>
          <span className="text-sm text-gray-500">팀 합계</span>
          <span className="ml-2 text-lg font-bold text-indigo-600">{teamTotal.toLocaleString()}pt</span>
        </div>
        <span className="text-xs text-green-600 font-medium">자동 저장됨</span>
      </div>
    </div>
  );
}
