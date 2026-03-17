import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';
import {
  recordAttendance,
  bulkRecordAttendance,
  getAttendanceByDate,
  getAttendancePoints,
} from '../../services/attendanceService';
import { upsertScore } from '../../services/scoringService';
import { cn, getToday } from '../../lib/utils';
import { Avatar } from '../../components/ui/Avatar';
import { useMemberProfile } from '../../contexts/MemberProfileContext';
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

  const attendanceBasePoints = curriculumTemplate?.scoring_categories?.find(c => c.key === 'attendance')?.basePoints ?? 50;
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [attendance, setAttendance] = useState<Record<string, MemberAttendanceState>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AttendanceStatus | 'all'>('all');

  // Initialize all members as unset
  useEffect(() => {
    if (!currentClub) return;
    setLoading(true);

    const initial: Record<string, MemberAttendanceState> = {};
    for (const m of members) {
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
        setAttendance(initial);
        toast.error('출석 데이터 로드 실패');
      })
      .finally(() => setLoading(false));
  }, [currentClub, selectedDate, members]);

  const handleStatusChange = useCallback(
    (memberId: string) => {
      const cycle: AttendanceStatus[] = ['present', 'late', 'absent'];
      setAttendance((prev) => {
        const current = prev[memberId];
        if (!current) return prev;
        const idx = cycle.indexOf(current.status);
        const nextStatus = cycle[(idx + 1) % 3];
        navigator.vibrate?.(10);

        // Sync to backend
        recordAttendance({
          memberId,
          trainingDate: selectedDate,
          status: nextStatus,
          absenceReason: nextStatus === 'absent' ? current.absenceReason : undefined,
        }).catch(() => toast.error('저장 실패'));

        // Sync attendance score
        if (currentClub) {
          const points = getAttendancePoints(nextStatus, attendanceBasePoints);
          upsertScore({
            memberId,
            clubId: currentClub.id,
            trainingDate: selectedDate,
            category: 'attendance',
            basePoints: points,
            multiplier: 1,
            recordedBy: teacher?.id,
          }).catch(() => {});
        }

        return {
          ...prev,
          [memberId]: { ...current, status: nextStatus },
        };
      });
    },
    [selectedDate, currentClub, attendanceBasePoints, teacher]
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
      recordAttendance({
        memberId,
        trainingDate: selectedDate,
        status: 'absent',
        absenceReason: entry.absenceReason,
      }).catch(() => toast.error('사유 저장 실패'));
    }
  };

  const handleBulkPresent = async () => {
    if (!currentClub) return;
    try {
      await bulkRecordAttendance(
        members.map((m) => m.id),
        selectedDate,
        'present'
      );
      // Bulk sync attendance scores
      const points = getAttendancePoints('present', attendanceBasePoints);
      await Promise.all(
        members.map((m) =>
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
      const updated: Record<string, MemberAttendanceState> = {};
      for (const m of members) {
        updated[m.id] = { status: 'present', absenceReason: '' };
      }
      setAttendance(updated);
      navigator.vibrate?.(20);
      toast.success('전체 출석 처리됨');
    } catch {
      toast.error('일괄 출석 실패');
    }
  };

  // Counts
  const counts = { present: 0, late: 0, absent: 0 };
  for (const entry of Object.values(attendance)) {
    counts[entry.status]++;
  }

  const filteredMembers =
    filter === 'all'
      ? members
      : members.filter((m) => attendance[m.id]?.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">출석</h1>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-2 py-1"
        />
      </div>

      {/* Bulk action + filter */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={handleBulkPresent}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg active:scale-95 touch-manipulation"
        >
          전체 출석
        </button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {[
          { key: 'all' as const, label: '전체', count: members.length },
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
                  className={cn(
                    'px-4 py-2 rounded-lg border-2 text-sm font-bold transition-all active:scale-95 touch-manipulation min-w-[72px]',
                    config.bg,
                    config.color
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
