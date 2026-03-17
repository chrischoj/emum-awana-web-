import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useClub } from '../../contexts/ClubContext';
import { getAttendanceByDate } from '../../services/attendanceService';
import { getToday, cn } from '../../lib/utils';
import type { AttendanceStatus } from '../../types/awana';

const STATUS_LABEL: Record<AttendanceStatus, string> = { present: '출석', late: '지각', absent: '결석' };
const STATUS_COLOR: Record<AttendanceStatus, string> = { present: 'bg-green-100 text-green-700', late: 'bg-yellow-100 text-yellow-700', absent: 'bg-red-100 text-red-700' };

export default function MemberAttendancePage() {
  const { currentClub, clubs, setCurrentClub, members, teams } = useClub();
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentClub) return;
    setLoading(true);
    getAttendanceByDate(selectedDate, currentClub.id)
      .then((records) => {
        const map: Record<string, AttendanceStatus> = {};
        for (const rec of records) {
          map[rec.member_id] = rec.status || (rec.present ? 'present' : 'absent');
        }
        setAttendanceMap(map);
      })
      .catch(() => toast.error('출석 데이터 로드 실패'))
      .finally(() => setLoading(false));
  }, [currentClub, selectedDate]);

  const counts = { present: 0, late: 0, absent: 0, unrecorded: 0 };
  for (const m of members) {
    const s = attendanceMap[m.id];
    if (s) counts[s]++;
    else counts.unrecorded++;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">클럽원 출석 총괄</h1>
        <div className="flex gap-2">
          {clubs.map((club) => (
            <button key={club.id} onClick={() => setCurrentClub(club)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${currentClub?.id === club.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{club.name}</button>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">팀</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map((member) => {
                const status = attendanceMap[member.id];
                const team = teams.find((t) => t.id === member.team_id);
                return (
                  <tr key={member.id}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{member.name}</td>
                    <td className="px-4 py-3">
                      {team && <span className="px-2 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: team.color }}>{team.name}</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {status ? (
                        <span className={cn('px-2 py-1 rounded-full text-xs font-medium', STATUS_COLOR[status])}>{STATUS_LABEL[status]}</span>
                      ) : (
                        <span className="text-xs text-gray-400">미기록</span>
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
