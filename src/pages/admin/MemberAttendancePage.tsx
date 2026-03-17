import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';
import { getAttendanceByDate, recordAttendance, getAttendancePoints } from '../../services/attendanceService';
import { upsertScore } from '../../services/scoringService';
import { supabase } from '../../lib/supabase';
import { getToday, cn } from '../../lib/utils';
import { Avatar } from '../../components/ui/Avatar';
import { useMemberProfile } from '../../contexts/MemberProfileContext';
import type { Member, Team, AttendanceStatus } from '../../types/awana';

const STATUS_LABEL: Record<AttendanceStatus, string> = { present: '출석', late: '지각', absent: '결석' };
const STATUS_COLOR: Record<AttendanceStatus, string> = { present: 'bg-green-100 text-green-700', late: 'bg-yellow-100 text-yellow-700', absent: 'bg-red-100 text-red-700' };

export default function MemberAttendancePage() {
  const { teacher } = useAuth();
  const { clubs } = useClub();
  const { openMemberProfile } = useMemberProfile();
  const [filterClubId, setFilterClubId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
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

        setAllMembers((membersRes.data as Member[]) || []);
        setAllTeams((teamsRes.data as Team[]) || []);

        const map: Record<string, AttendanceStatus> = {};
        for (const rec of attendanceRecords) {
          const status = rec.status || (rec.present ? 'present' : 'absent');
          if (status !== 'none') map[rec.member_id] = status;
        }
        setAttendanceMap(map);
      } catch {
        toast.error('데이터 로드 실패');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [filterClubId, selectedDate]);

  const counts = { present: 0, late: 0, absent: 0, unrecorded: 0 };
  for (const m of allMembers) {
    const s = attendanceMap[m.id];
    if (s) counts[s]++;
    else counts.unrecorded++;
  }

  const clubMap: Record<string, string> = {};
  for (const c of clubs) {
    clubMap[c.id] = c.name;
  }

  const handleStatusChange = useCallback(
    (memberId: string) => {
      const cycle: AttendanceStatus[] = ['present', 'late', 'absent', 'none'];
      setAttendanceMap((prev) => {
        const current = prev[memberId];
        const idx = current ? cycle.indexOf(current) : -1;
        const next = cycle[(idx + 1) % cycle.length];
        navigator.vibrate?.(10);

        recordAttendance({
          memberId,
          trainingDate: selectedDate,
          status: next,
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
            multiplier: next === 'none' ? 0 : 1,
            recordedBy: teacher?.id,
          }).catch(() => {});
        }

        if (next === 'none') {
          const { [memberId]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [memberId]: next };
      });
    },
    [selectedDate, allMembers, teacher]
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">클럽원 출석 총괄</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setFilterClubId(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filterClubId === null ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            모두
          </button>
          {clubs.map((club) => (
            <button
              key={club.id}
              onClick={() => setFilterClubId(club.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filterClubId === club.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              {club.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <div className="flex gap-2 text-sm">
          <span className="px-2 py-1 bg-green-100 text-green-700 rounded">출석 {counts.present}</span>
          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">지각 {counts.late}</span>
          <span className="px-2 py-1 bg-red-100 text-red-700 rounded">결석 {counts.absent}</span>
          <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded">미기록 {counts.unrecorded}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                {filterClubId === null && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">클럽</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">팀</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allMembers.map((member) => {
                const status = attendanceMap[member.id];
                const team = allTeams.find((t) => t.id === member.team_id);
                return (
                  <tr key={member.id}>
                    <td className="px-4 py-3">
                      <button onClick={() => openMemberProfile(member.id)} className="flex items-center gap-2 hover:opacity-80">
                        <Avatar name={member.name} src={member.avatar_url} size="sm" />
                        <span className="text-sm font-medium text-gray-900">{member.name}</span>
                      </button>
                    </td>
                    {filterClubId === null && (
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">{clubMap[member.club_id] ?? '-'}</span>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {team && <span className="px-2 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: team.color }}>{team.name}</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
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
