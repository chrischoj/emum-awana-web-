import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtimeRoomStatus } from '../../hooks/useRealtimeRoomStatus';
import { getToday } from '../../lib/utils';

export default function DashboardPage() {
  const [stats, setStats] = useState({ members: 0, teachers: 0, todayAttendance: 0 });
  const roomStatus = useRealtimeRoomStatus();

  useEffect(() => {
    async function loadStats() {
      const today = getToday();
      const [membersRes, teachersRes, attendanceRes] = await Promise.all([
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('member_attendance').select('id', { count: 'exact', head: true }).eq('training_date', today).eq('present', true),
      ]);
      setStats({
        members: membersRes.count || 0,
        teachers: teachersRes.count || 0,
        todayAttendance: attendanceRes.count || 0,
      });
    }
    loadStats();
  }, []);

  const attendanceRate = stats.members > 0 ? Math.round((stats.todayAttendance / stats.members) * 100) : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">대시보드</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">총 클럽원</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.members}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">총 교사</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.teachers}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">오늘 출석률</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{attendanceRate}%</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">활성 교실</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{roomStatus.sessions.length}</p>
        </div>
      </div>

      {/* Active rooms */}
      {roomStatus.sessions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <h2 className="text-lg font-semibold mb-4">활성 교실 (실시간)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roomStatus.sessions.map((session) => {
              const teacherCount = roomStatus.teachers.filter(
                (t) => t.room_session_id === session.id
              ).length;
              return (
                <div key={session.id} className="border border-green-200 rounded-lg p-4 bg-green-50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="font-medium">교실 세션</span>
                    <span className="text-xs text-green-600 font-medium">LIVE</span>
                  </div>
                  <p className="text-sm text-gray-600">교사 체크인: {teacherCount}명</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">실시간 활동 피드</h2>
        <p className="text-gray-500 text-sm">활동이 시작되면 여기에 표시됩니다.</p>
      </div>
    </div>
  );
}
