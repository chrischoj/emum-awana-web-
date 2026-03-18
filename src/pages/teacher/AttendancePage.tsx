import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';
import { useTeacherAssignment } from '../../hooks/useTeacherAssignment';
import {
  recordAttendance,
  bulkRecordAttendance,
  getAttendanceByDate,
  getAttendancePoints,
} from '../../services/attendanceService';
import { upsertScore } from '../../services/scoringService';
import { cn, getToday } from '../../lib/utils';
import { Avatar } from '../../components/ui/Avatar';
import { OfflineBanner } from '../../components/ui/OfflineBanner';
import { DatePickerWithToday } from '../../components/ui/DatePickerWithToday';
import { useMemberProfile } from '../../contexts/MemberProfileContext';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useSessionCache } from '../../hooks/useSessionCache';
import { useOfflineQueue } from '../../hooks/useOfflineQueue';
import type { AttendanceStatus } from '../../types/awana';

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string; bg: string }> = {
  present: { label: '출석', color: 'text-green-700', bg: 'bg-green-100 border-green-400' },
  late: { label: '지각', color: 'text-yellow-700', bg: 'bg-yellow-100 border-yellow-400' },
  absent: { label: '결석', color: 'text-red-700', bg: 'bg-red-100 border-red-400' },
};

interface MemberAttendanceState {
  status: AttendanceStatus;
  absenceReason: string;
}

export default function AttendancePage() {
  const { teacher } = useAuth();
  const { currentClub, curriculumTemplate, teams, members } = useClub();
  const { openMemberProfile } = useMemberProfile();
  const { assignedTeamIds, assignedMembers, isReadOnly, isUnassigned } = useTeacherAssignment();
  const { isOffline } = useNetworkStatus();
  const { enqueue, pendingCount } = useOfflineQueue();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const visibleTeams = isUnassigned ? teams : teams.filter(t => assignedTeamIds.includes(t.id));

  // 배정된 반이 1개면 자동 선택
  useEffect(() => {
    if (!isUnassigned && visibleTeams.length === 1) {
      setSelectedTeamId(visibleTeams[0].id);
    }
  }, [isUnassigned, visibleTeams]);

  const attendanceBasePoints = curriculumTemplate?.scoring_categories?.find(c => c.key === 'attendance')?.basePoints ?? 50;
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [attendance, setAttendance] = useState<Record<string, MemberAttendanceState>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AttendanceStatus | 'all'>('all');

  const attCacheKey = `attendance-${currentClub?.id}-${selectedDate}`;
  const { restore: restoreAttendance } = useSessionCache(attCacheKey, attendance, Object.keys(attendance).length > 0);

  const baseMembers = isUnassigned ? members : assignedMembers;

  // Initialize all members as unset
  useEffect(() => {
    if (!currentClub) return;
    setLoading(true);

    const initial: Record<string, MemberAttendanceState> = {};
    for (const m of baseMembers) {
      initial[m.id] = { status: 'present', absenceReason: '' };
    }

    getAttendanceByDate(selectedDate, currentClub.id)
      .then((records) => {
        for (const rec of records) {
          const status = rec.status || (rec.present ? 'present' : 'absent');
          if (initial[rec.member_id] && status !== 'none') {
            initial[rec.member_id] = {
              status,
              absenceReason: rec.absence_reason || '',
            };
          }
        }
        setAttendance(initial);
      })
      .catch(() => {
        // 오프라인: 캐시에서 복원, 없으면 기본값 사용
        const cached = restoreAttendance();
        if (cached && Object.keys(cached).length > 0) {
          setAttendance(cached);
        } else {
          setAttendance(initial);
          if (navigator.onLine) toast.error('출석 데이터 로드 실패');
        }
      })
      .finally(() => setLoading(false));
  }, [currentClub, selectedDate, members]);

  const handleStatusChange = useCallback(
    (memberId: string) => {
      if (isReadOnly) return;
      const cycle: AttendanceStatus[] = ['present', 'late', 'absent'];
      setAttendance((prev) => {
        const current = prev[memberId];
        if (!current) return prev;
        const idx = cycle.indexOf(current.status);
        const nextStatus = cycle[(idx + 1) % 3];
        navigator.vibrate?.(10);

        const attParams = {
          memberId,
          trainingDate: selectedDate,
          status: nextStatus,
          absenceReason: nextStatus === 'absent' ? current.absenceReason : undefined,
        };
        const scoreParams = currentClub ? {
          memberId,
          clubId: currentClub.id,
          trainingDate: selectedDate,
          category: 'attendance' as const,
          basePoints: getAttendancePoints(nextStatus, attendanceBasePoints),
          multiplier: 1,
          recordedBy: teacher?.id,
        } : null;

        if (isOffline) {
          enqueue('recordAttendance', attParams);
          if (scoreParams) enqueue('upsertScore', scoreParams);
        } else {
          recordAttendance(attParams).catch(() => {
            if (!navigator.onLine) enqueue('recordAttendance', attParams);
            else toast.error('저장 실패');
          });
          if (scoreParams) {
            upsertScore(scoreParams).catch(() => {
              if (!navigator.onLine) enqueue('upsertScore', scoreParams);
            });
          }
        }

        return {
          ...prev,
          [memberId]: { ...current, status: nextStatus },
        };
      });
    },
    [selectedDate, currentClub, attendanceBasePoints, teacher, isReadOnly, isOffline, enqueue]
  );

  const handleReasonChange = (memberId: string, reason: string) => {
    setAttendance((prev) => ({
      ...prev,
      [memberId]: { ...prev[memberId], absenceReason: reason },
    }));
  };

  const handleReasonBlur = (memberId: string) => {
    const entry = attendance[memberId];
    if (entry?.status === 'absent') {
      const params = {
        memberId,
        trainingDate: selectedDate,
        status: 'absent' as const,
        absenceReason: entry.absenceReason,
      };
      if (isOffline) {
        enqueue('recordAttendance', params);
      } else {
        recordAttendance(params).catch(() => {
          if (!navigator.onLine) enqueue('recordAttendance', params);
          else toast.error('사유 저장 실패');
        });
      }
    }
  };

  const handleBulkPresent = async () => {
    if (!currentClub) return;
    if (isReadOnly) return;

    // 로컬 state는 항상 업데이트 (오프라인이든 온라인이든)
    const updated: Record<string, MemberAttendanceState> = {};
    for (const m of baseMembers) {
      updated[m.id] = { status: 'present', absenceReason: '' };
    }
    setAttendance(updated);
    navigator.vibrate?.(20);

    if (isOffline) {
      toast.success('전체 출석 처리됨 (오프라인)');
      return;
    }

    try {
      await bulkRecordAttendance(
        baseMembers.map((m) => m.id),
        selectedDate,
        'present'
      );
      const points = getAttendancePoints('present', attendanceBasePoints);
      await Promise.all(
        baseMembers.map((m) =>
          upsertScore({
            memberId: m.id,
            clubId: currentClub.id,
            trainingDate: selectedDate,
            category: 'attendance',
            basePoints: points,
            multiplier: 1,
            recordedBy: teacher?.id,
          }).catch(() => {})
        )
      );
      toast.success('전체 출석 처리됨');
    } catch {
      if (navigator.onLine) toast.error('일괄 출석 실패');
    }
  };

  // Counts
  const counts = { present: 0, late: 0, absent: 0 };
  for (const m of baseMembers) {
    const entry = attendance[m.id];
    if (entry) counts[entry.status]++;
  }

  const teamFilteredMembers = selectedTeamId
    ? baseMembers.filter((m) => m.team_id === selectedTeamId)
    : baseMembers;
  const filteredMembers =
    filter === 'all'
      ? teamFilteredMembers
      : teamFilteredMembers.filter((m) => attendance[m.id]?.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="pb-4">
      {isOffline && <OfflineBanner pendingCount={pendingCount} />}

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">출석</h1>
        <DatePickerWithToday
          value={selectedDate}
          onChange={setSelectedDate}
          className="px-2 py-1"
        />
      </div>

      {/* Team tabs - 2개 이상일 때만 표시 */}
      {(isUnassigned || visibleTeams.length >= 2) && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-3 scrollbar-hide">
          <button
            onClick={() => setSelectedTeamId(null)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors',
              !selectedTeamId ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'
            )}
          >
            전체
          </button>
          {visibleTeams.map((team) => (
            <button
              key={team.id}
              onClick={() => setSelectedTeamId(team.id)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors',
                selectedTeamId === team.id ? 'text-white' : 'bg-gray-100 text-gray-700'
              )}
              style={selectedTeamId === team.id ? { backgroundColor: team.color } : undefined}
            >
              {team.name}
            </button>
          ))}
        </div>
      )}

      {/* Unassigned banner */}
      {isUnassigned && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700 font-medium">반 배정 후 입력이 가능합니다</p>
          <p className="text-xs text-amber-600 mt-0.5">현재 열람 전용 모드입니다</p>
        </div>
      )}

      {/* Bulk action + filter */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={handleBulkPresent}
          disabled={isReadOnly}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg active:scale-95 touch-manipulation disabled:opacity-50"
        >
          전체 출석
        </button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {[
          { key: 'all' as const, label: '전체', count: baseMembers.length },
          { key: 'present' as const, label: '출석', count: counts.present },
          { key: 'late' as const, label: '지각', count: counts.late },
          { key: 'absent' as const, label: '결석', count: counts.absent },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0',
              filter === key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'
            )}
          >
            {label} {count}
          </button>
        ))}
      </div>

      {/* Member list */}
      <div className="space-y-2">
        {filteredMembers.map((member) => {
          const entry = attendance[member.id];
          if (!entry) return null;
          const team = teams.find((t) => t.id === member.team_id);
          const config = STATUS_CONFIG[entry.status];

          return (
            <div
              key={member.id}
              className="bg-white rounded-xl border border-gray-200 p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {team && (
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: team.color }}
                    />
                  )}
                  <button onClick={() => openMemberProfile(member.id)} className="flex items-center gap-2 hover:opacity-80">
                    <Avatar name={member.name} src={member.avatar_url} size="sm" />
                    <span className="font-medium text-gray-900 text-sm">{member.name}</span>
                  </button>
                </div>

                <button
                  onClick={() => handleStatusChange(member.id)}
                  disabled={isReadOnly}
                  className={cn(
                    'px-4 py-2 rounded-lg border-2 text-sm font-bold transition-all active:scale-95 touch-manipulation min-w-[72px]',
                    config.bg,
                    config.color,
                    isReadOnly && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  {config.label}
                </button>
              </div>

              {/* Absence reason (inline) */}
              {entry.status === 'absent' && (
                <input
                  type="text"
                  value={entry.absenceReason}
                  onChange={(e) => handleReasonChange(member.id, e.target.value)}
                  onBlur={() => handleReasonBlur(member.id)}
                  placeholder="결석 사유 입력..."
                  className="mt-2 w-full text-sm border border-red-200 rounded-lg px-3 py-1.5 bg-red-50 placeholder-red-300"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
