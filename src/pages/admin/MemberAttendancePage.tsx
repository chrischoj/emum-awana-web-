import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';
import { getAttendanceByDate, recordAttendance, getAttendancePoints } from '../../services/attendanceService';
import { upsertScore } from '../../services/scoringService';
import { supabase } from '../../lib/supabase';
import { getToday, cn } from '../../lib/utils';
import { Avatar } from '../../components/ui/Avatar';
import { DatePickerWithToday } from '../../components/ui/DatePickerWithToday';
import { useMemberProfile } from '../../contexts/MemberProfileContext';
import type { Member, Team, AttendanceStatus } from '../../types/awana';

const STATUS_LABEL: Record<AttendanceStatus, string> = { present: '출석', late: '지각', absent: '결석' };
const STATUS_COLOR: Record<AttendanceStatus, string> = { present: 'bg-green-100 text-green-700', late: 'bg-yellow-100 text-yellow-700', absent: 'bg-red-100 text-red-700' };

const ATTENDANCE_CACHE_KEY = 'awana_member_attendance_cache';

export default function MemberAttendancePage() {
  const { teacher } = useAuth();
  const { clubs } = useClub();
  const { openMemberProfile } = useMemberProfile();
  const [filterClubId, setFilterClubId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, { status: AttendanceStatus; absenceReason: string }>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async (showLoading = true) => {
    // 캐시로 즉시 표시 (최초 로딩 시만)
    if (showLoading) {
      try {
        const cached = localStorage.getItem(ATTENDANCE_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.filterClubId === filterClubId) {
            setAllMembers(parsed.members || []);
            setAllTeams(parsed.teams || []);
            setLoading(false);
          } else {
            setLoading(true);
          }
        } else {
          setLoading(true);
        }
      } catch {
        setLoading(true);
      }
    }
    try {
      let memberQuery = supabase
        .from('members')
        .select('*')
        .eq('active', true)
        .eq('enrollment_status', 'active')
        .order('name');
      let teamQuery = supabase.from('teams').select('*').order('name');

      if (filterClubId) {
        memberQuery = memberQuery.eq('club_id', filterClubId);
        teamQuery = teamQuery.eq('club_id', filterClubId);
      }

      const [membersRes, teamsRes, attendanceRecords] = await Promise.all([
        memberQuery,
        teamQuery,
        getAttendanceByDate(selectedDate, filterClubId ?? undefined),
      ]);

      const newMembers = (membersRes.data as Member[]) || [];
      const newTeams = (teamsRes.data as Team[]) || [];
      setAllMembers(newMembers);
      setAllTeams(newTeams);

      // 캐시 업데이트
      try {
        localStorage.setItem(ATTENDANCE_CACHE_KEY, JSON.stringify({
          members: newMembers, teams: newTeams, filterClubId, timestamp: Date.now(),
        }));
      } catch { /* ignore */ }

      const map: Record<string, { status: AttendanceStatus; absenceReason: string }> = {};
      for (const rec of attendanceRecords) {
        const status = rec.status || (rec.present ? 'present' : 'absent');
        if (status !== 'none') map[rec.member_id] = { status, absenceReason: rec.absence_reason || '' };
      }
      setAttendanceMap(map);
    } catch {
      toast.error('데이터 로드 실패');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [filterClubId, selectedDate]);

  // Realtime 이벤트 시 attendance만 가볍게 reload (members/teams는 재쿼리하지 않음)
  const refreshAttendanceOnly = useCallback(async () => {
    try {
      const attendanceRecords = await getAttendanceByDate(selectedDate, filterClubId ?? undefined);
      const map: Record<string, { status: AttendanceStatus; absenceReason: string }> = {};
      for (const rec of attendanceRecords) {
        const status = rec.status || (rec.present ? 'present' : 'absent');
        if (status !== 'none') map[rec.member_id] = { status, absenceReason: rec.absence_reason || '' };
      }
      setAttendanceMap(map);
    } catch {
      // 실패 시 무시 (다음 이벤트에서 재시도)
    }
  }, [selectedDate, filterClubId]);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  // Realtime 구독
  useEffect(() => {
    const channel = supabase
      .channel(`admin-attendance-${selectedDate}-${filterClubId ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_attendance', filter: `training_date=eq.${selectedDate}` }, () => {
        // 300ms debounce: 연속 변경 시 마지막 이벤트 후 1회만 refresh
        if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = setTimeout(() => {
          refreshAttendanceOnly();
        }, 300);
      })
      .subscribe();
    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [selectedDate, filterClubId, refreshAttendanceOnly]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(false);
    setRefreshing(false);
    toast.success('갱신됨');
  };

  const counts = { present: 0, late: 0, absent: 0, unrecorded: 0 };
  for (const m of allMembers) {
    const s = attendanceMap[m.id]?.status;
    if (s) counts[s]++;
    else counts.unrecorded++;
  }

  const clubMap: Record<string, string> = {};
  for (const c of clubs) {
    clubMap[c.id] = c.name;
  }

  const handleStatusChange = useCallback(
    (memberId: string) => {
      const cycle: AttendanceStatus[] = ['present', 'late', 'absent'];
      setAttendanceMap((prev) => {
        const current = prev[memberId];
        const idx = current ? cycle.indexOf(current.status) : -1;
        const next = cycle[(idx + 1) % cycle.length];
        navigator.vibrate?.(10);

        const absenceReason = current?.absenceReason || '';

        recordAttendance({
          memberId,
          trainingDate: selectedDate,
          status: next,
          absenceReason,
        }).catch(() => toast.error('저장 실패'));

        // Sync attendance score
        const member = allMembers.find((m) => m.id === memberId);
        if (member?.club_id) {
          const points = getAttendancePoints(next);
          upsertScore({
            memberId,
            clubId: member.club_id,
            trainingDate: selectedDate,
            category: 'attendance',
            basePoints: points,
            multiplier: 1,
            recordedBy: teacher?.id,
          }).catch(() => {});
        }

        return { ...prev, [memberId]: { status: next, absenceReason } };
      });
    },
    [selectedDate, allMembers, teacher]
  );

  const handleReset = useCallback(
    (memberId: string) => {
      if (!window.confirm('초기화하시겠습니까?')) return;

      setAttendanceMap((prev) => {
        const { [memberId]: _, ...rest } = prev;
        return rest;
      });

      recordAttendance({
        memberId,
        trainingDate: selectedDate,
        status: 'none',
      }).catch(() => toast.error('초기화 실패'));

      const member = allMembers.find((m) => m.id === memberId);
      if (member?.club_id) {
        upsertScore({
          memberId,
          clubId: member.club_id,
          trainingDate: selectedDate,
          category: 'attendance',
          basePoints: 0,
          multiplier: 0,
          recordedBy: teacher?.id,
        }).catch(() => {});
      }
    },
    [selectedDate, allMembers, teacher]
  );

  const handleReasonChange = (memberId: string, reason: string) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [memberId]: { ...prev[memberId], absenceReason: reason },
    }));
  };

  const handleReasonBlur = (memberId: string) => {
    const entry = attendanceMap[memberId];
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
    if (!window.confirm(`${allMembers.length}명을 전체 출석 처리하시겠습니까?`)) return;
    const prevMap = { ...attendanceMap };
    const newMap = { ...attendanceMap };
    allMembers.forEach((m) => {
      newMap[m.id] = { status: 'present', absenceReason: '' };
    });
    setAttendanceMap(newMap);

    try {
      const rows = allMembers.map((m) => ({
        member_id: m.id,
        training_date: selectedDate,
        present: true,
        status: 'present' as AttendanceStatus,
        absence_reason: null,
      }));
      const { error } = await supabase
        .from('member_attendance')
        .upsert(rows, { onConflict: 'member_id,training_date' });
      if (error) throw error;

      // 점수 일괄 동기화
      const scoreRows = allMembers
        .filter((m) => m.club_id)
        .map((m) => ({
          member_id: m.id,
          club_id: m.club_id,
          training_date: selectedDate,
          category: 'attendance',
          base_points: getAttendancePoints('present'),
          multiplier: 1,
          recorded_by: teacher?.id ?? null,
        }));
      if (scoreRows.length > 0) {
        await supabase
          .from('scores')
          .upsert(scoreRows, { onConflict: 'member_id,training_date,category' });
      }
      toast.success('전체 출석 처리 완료');
    } catch {
      toast.error('일괄 출석 저장 실패');
      setAttendanceMap(prevMap);
    }
  };

  const handleBulkReset = async () => {
    if (!window.confirm(`${allMembers.length}명의 출석 기록을 전체 해제하시겠습니까?`)) return;
    const prevMap = { ...attendanceMap };
    setAttendanceMap({});

    try {
      const rows = allMembers.map((m) => ({
        member_id: m.id,
        training_date: selectedDate,
        present: false,
        status: 'none' as AttendanceStatus,
        absence_reason: null,
      }));
      const { error } = await supabase
        .from('member_attendance')
        .upsert(rows, { onConflict: 'member_id,training_date' });
      if (error) throw error;

      // 점수 초기화
      const scoreRows = allMembers
        .filter((m) => m.club_id)
        .map((m) => ({
          member_id: m.id,
          club_id: m.club_id,
          training_date: selectedDate,
          category: 'attendance',
          base_points: 0,
          multiplier: 0,
          recorded_by: teacher?.id ?? null,
        }));
      if (scoreRows.length > 0) {
        await supabase
          .from('scores')
          .upsert(scoreRows, { onConflict: 'member_id,training_date,category' });
      }
      toast.success('전체 해제 완료');
    } catch {
      toast.error('일괄 해제 저장 실패');
      setAttendanceMap(prevMap);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">클럽원 출석부</h1>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="새로고침"
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          </button>
        </div>
        <DatePickerWithToday value={selectedDate} onChange={setSelectedDate} />
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        <button
          onClick={() => setFilterClubId(null)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium ${filterClubId === null ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          모두
        </button>
        {clubs.map((club) => (
          <button
            key={club.id}
            onClick={() => setFilterClubId(club.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium ${filterClubId === club.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {club.name}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">출석 {counts.present}</span>
        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">지각 {counts.late}</span>
        <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">결석 {counts.absent}</span>
        <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded text-xs font-medium">미기록 {counts.unrecorded}</span>
        <span className="w-px h-4 bg-gray-200" />
        <button
          onClick={handleBulkPresent}
          className="px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 active:scale-95 transition-all"
        >
          전체 출석
        </button>
        <button
          onClick={handleBulkReset}
          className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 active:scale-95 transition-all"
        >
          전체 해제
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full divide-y divide-gray-200">
            <colgroup>
              <col style={{ minWidth: 100 }} />
              {filterClubId === null && <col style={{ minWidth: 64 }} />}
              <col style={{ minWidth: 56 }} />
              <col style={{ minWidth: 56 }} />
              <col style={{ minWidth: 120 }} />
              <col style={{ minWidth: 48 }} />
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                {filterClubId === null && (
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">클럽</th>
                )}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">팀</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">상태</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">사유</th>
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allMembers.map((member) => {
                const entry = attendanceMap[member.id];
                const status = entry?.status;
                const reason = entry?.absenceReason || '';
                const team = allTeams.find((t) => t.id === member.team_id);
                return (
                  <tr key={member.id}>
                    <td className="px-3 py-3">
                      <button onClick={() => openMemberProfile(member.id)} className="flex items-center gap-2 hover:opacity-80 min-w-0">
                        <Avatar name={member.name} src={member.avatar_url} size="sm" />
                        <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{member.name}</span>
                      </button>
                    </td>
                    {filterClubId === null && (
                      <td className="px-3 py-3">
                        <span className="text-sm text-gray-600 whitespace-nowrap">{clubMap[member.club_id] ?? '-'}</span>
                      </td>
                    )}
                    <td className="px-3 py-3">
                      {team && <span className="px-2 py-0.5 rounded text-xs font-medium text-white whitespace-nowrap inline-block" style={{ backgroundColor: team.color }}>{team.name}</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => handleStatusChange(member.id)}
                        className={cn(
                          'px-3 py-1 rounded-full text-xs font-bold cursor-pointer active:scale-95 touch-manipulation transition-all',
                          status ? STATUS_COLOR[status] : 'bg-gray-100 text-gray-400'
                        )}
                      >
                        {status ? STATUS_LABEL[status] : '미기록'}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {status === 'absent' ? (
                        <textarea
                          value={reason}
                          onChange={(e) => handleReasonChange(member.id, e.target.value)}
                          onBlur={() => handleReasonBlur(member.id)}
                          placeholder="결석 사유 입력..."
                          rows={2}
                          className="w-full text-sm border border-red-200 rounded-lg px-2 py-1.5 bg-red-50 placeholder-red-300 resize-none leading-snug"
                        />
                      ) : reason ? (
                        <p className="text-xs text-gray-400 line-clamp-2 leading-snug">{reason}</p>
                      ) : null}
                    </td>
                    <td className="px-2 py-3 text-center">
                      {status && (
                        <button
                          onClick={() => handleReset(member.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="초기화"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
