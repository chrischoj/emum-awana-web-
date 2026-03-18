import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useClub } from '../../contexts/ClubContext';
import { useMemberProfile } from '../../contexts/MemberProfileContext';
import { useRealtimeRoomStatus } from '../../hooks/useRealtimeRoomStatus';
import { getToday } from '../../lib/utils';
import type { Member } from '../../types/awana';

interface Stats {
  activeMembers: number;
  totalMembers: number;
  teachers: number;
  attendancePresent: number;
  attendanceLate: number;
  attendanceAbsent: number;
}

interface AttendanceBreakdown {
  present: number;
  late: number;
  absent: number;
  unrecorded: number;
  hasData: boolean;
}

// 원형 진행률 링 컴포넌트
function CircularProgress({
  value,
  size = 72,
  strokeWidth = 6,
  color,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-gray-100"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
}

function getGradientByColor(color: string): string {
  const map: Record<string, string> = {
    '#EF4444': 'from-red-300 to-red-500',
    '#3B82F6': 'from-blue-300 to-blue-500',
    '#22C55E': 'from-green-300 to-green-500',
    '#EAB308': 'from-yellow-300 to-yellow-500',
  };
  return map[color] || 'from-indigo-300 to-indigo-500';
}

function DashboardFaceTile({ member, teamColor, onTap }: { member: Member; teamColor?: string; onTap: () => void }) {
  const [imgError, setImgError] = useState(false);
  const initials = member.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  return (
    <button onClick={onTap} className="flex flex-col items-center gap-1 min-w-0">
      {member.avatar_url && !imgError ? (
        <img
          src={member.avatar_url}
          alt={member.name}
          className="w-full aspect-square rounded-2xl object-cover shadow-sm hover:shadow-md transition-all active:scale-95"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className={`w-full aspect-square rounded-2xl flex items-center justify-center bg-gradient-to-br ${getGradientByColor(teamColor || '')} shadow-sm hover:shadow-md transition-all active:scale-95`}>
          <span className="text-2xl font-bold text-white">{initials}</span>
        </div>
      )}
      <span className="text-xs font-medium text-gray-700 text-center truncate w-full">{member.name}</span>
    </button>
  );
}

// 미니 프로그레스 바
function MiniProgress({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1 w-full rounded-full bg-gray-100 overflow-hidden mt-2">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    activeMembers: 0,
    totalMembers: 0,
    teachers: 0,
    attendancePresent: 0,
    attendanceLate: 0,
    attendanceAbsent: 0,
  });
  const [attendance, setAttendance] = useState<AttendanceBreakdown>({
    present: 0,
    late: 0,
    absent: 0,
    unrecorded: 0,
    hasData: false,
  });
  const [loading, setLoading] = useState(true);
  const roomStatus = useRealtimeRoomStatus();
  const { clubs, members, teams, currentClub, setCurrentClub } = useClub();
  const { openMemberProfile } = useMemberProfile();

  // 팀별 멤버 그룹핑
  const teamGroups = teams.map(team => ({
    ...team,
    members: members.filter(m => m.team_id === team.id),
  })).filter(t => t.members.length > 0);
  const unassignedMembers = members.filter(m => !m.team_id);

  useEffect(() => {
    async function loadStats() {
      const today = getToday();

      const [activeMembersRes, totalMembersRes, teachersRes, attendanceRes] =
        await Promise.all([
          // 1. 진짜 활성 클럽원: active=true AND enrollment_status='active'
          supabase
            .from('members')
            .select('id', { count: 'exact', head: true })
            .eq('active', true)
            .eq('enrollment_status', 'active'),
          // 2. 전체 클럽원: active=true (pending 포함)
          supabase
            .from('members')
            .select('id', { count: 'exact', head: true })
            .eq('active', true),
          // 3. 교사
          supabase
            .from('teachers')
            .select('id', { count: 'exact', head: true })
            .eq('active', true),
          // 4. 오늘 출석 기록 전체 (status 기준)
          supabase
            .from('member_attendance')
            .select('status')
            .eq('training_date', today),
        ]);

      const activeMembers = activeMembersRes.count ?? 0;
      const totalMembers = totalMembersRes.count ?? 0;
      const teachers = teachersRes.count ?? 0;

      // 출석 상태별 집계
      const records = attendanceRes.data ?? [];
      const presentCount = records.filter((r) => r.status === 'present').length;
      const lateCount = records.filter((r) => r.status === 'late').length;
      const absentCount = records.filter((r) => r.status === 'absent').length;
      const unrecordedCount = Math.max(
        0,
        activeMembers - presentCount - lateCount - absentCount
      );

      setStats({
        activeMembers,
        totalMembers,
        teachers,
        attendancePresent: presentCount,
        attendanceLate: lateCount,
        attendanceAbsent: absentCount,
      });

      setAttendance({
        present: presentCount,
        late: lateCount,
        absent: absentCount,
        unrecorded: unrecordedCount,
        hasData: records.length > 0,
      });

      setLoading(false);
    }

    loadStats();
  }, []);

  // 출석률: 분모는 activeMembers (enrollment_status='active' AND active=true)
  const attendanceRate =
    stats.activeMembers > 0
      ? Math.round((stats.attendancePresent / stats.activeMembers) * 100)
      : 0;

  const attendanceColor =
    attendanceRate >= 70
      ? '#22c55e'
      : attendanceRate >= 40
        ? '#f59e0b'
        : '#ef4444';

  const attendanceTextColor =
    attendanceRate >= 70
      ? 'text-green-600'
      : attendanceRate >= 40
        ? 'text-amber-500'
        : 'text-red-500';

  const memberRatio =
    stats.totalMembers > 0
      ? Math.round((stats.activeMembers / stats.totalMembers) * 100)
      : 0;

  // 스켈레톤 플레이스홀더
  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-32 bg-gray-200 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-2xl" />
          ))}
        </div>
        <div className="h-28 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  // 오늘 날짜 포맷
  const todayLabel = new Date().toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
          <p className="text-sm text-gray-400 mt-0.5">{todayLabel}</p>
        </div>
        {roomStatus.sessions.length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-semibold border border-green-200">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            교실 운영중
          </span>
        )}
      </div>

      {/* 통계 카드 4개 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 카드 1: 클럽원 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                클럽원
              </p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats.activeMembers}
                <span className="text-base font-normal text-gray-400 ml-1">명</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-lg">
              👥
            </div>
          </div>
          <p className="text-xs text-gray-400">
            전체 {stats.totalMembers}명 중 활성
          </p>
          <MiniProgress value={memberRatio} color="#3b82f6" />
        </div>

        {/* 카드 2: 교사 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                교사
              </p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {stats.teachers}
                <span className="text-base font-normal text-gray-400 ml-1">명</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-lg">
              🎓
            </div>
          </div>
          <p className="text-xs text-gray-400">활성 교사 수</p>
          <div className="h-1 w-full mt-2" />
        </div>

        {/* 카드 3: 오늘 출석률 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                오늘 출석률
              </p>
              <p className={`text-3xl font-bold mt-1 ${attendanceTextColor}`}>
                {attendanceRate}
                <span className="text-base font-normal ml-0.5">%</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">
                출석 {stats.attendancePresent} / 활성 {stats.activeMembers}명
              </p>
            </div>
            <div className="relative flex-shrink-0">
              <CircularProgress
                value={attendanceRate}
                size={64}
                strokeWidth={5}
                color={attendanceColor}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: attendanceColor }}>
                {attendanceRate}%
              </span>
            </div>
          </div>
        </div>

        {/* 카드 4: 활성 교실 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                활성 교실
              </p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {roomStatus.sessions.length}
                <span className="text-base font-normal text-gray-400 ml-1">개</span>
              </p>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${roomStatus.sessions.length > 0 ? 'bg-emerald-50' : 'bg-gray-50'}`}>
              🏫
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {roomStatus.sessions.length > 0 ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-xs text-emerald-600 font-medium">실시간 운영 중</p>
              </>
            ) : (
              <p className="text-xs text-gray-400">운영 중인 교실 없음</p>
            )}
          </div>
        </div>
      </div>

      {/* 출석 현황 분석 - 오늘 데이터가 있을 때만 표시 */}
      {attendance.hasData && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">오늘 출석 현황</h2>

          {/* 스택드 바 */}
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 mb-4">
            {attendance.present > 0 && (
              <div
                className="bg-green-500 transition-all duration-700"
                style={{
                  width: `${(attendance.present / stats.activeMembers) * 100}%`,
                }}
              />
            )}
            {attendance.late > 0 && (
              <div
                className="bg-amber-400 transition-all duration-700"
                style={{
                  width: `${(attendance.late / stats.activeMembers) * 100}%`,
                }}
              />
            )}
            {attendance.absent > 0 && (
              <div
                className="bg-red-400 transition-all duration-700"
                style={{
                  width: `${(attendance.absent / stats.activeMembers) * 100}%`,
                }}
              />
            )}
            {attendance.unrecorded > 0 && (
              <div
                className="bg-gray-200 transition-all duration-700"
                style={{
                  width: `${(attendance.unrecorded / stats.activeMembers) * 100}%`,
                }}
              />
            )}
          </div>

          {/* 미니 카드 4개 */}
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-green-50 mb-1">
                <span className="text-green-600 font-bold text-sm">{attendance.present}</span>
              </div>
              <p className="text-xs text-gray-500">출석</p>
              <div className="w-2 h-2 rounded-full bg-green-500 mx-auto mt-1" />
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-50 mb-1">
                <span className="text-amber-600 font-bold text-sm">{attendance.late}</span>
              </div>
              <p className="text-xs text-gray-500">지각</p>
              <div className="w-2 h-2 rounded-full bg-amber-400 mx-auto mt-1" />
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 mb-1">
                <span className="text-red-500 font-bold text-sm">{attendance.absent}</span>
              </div>
              <p className="text-xs text-gray-500">결석</p>
              <div className="w-2 h-2 rounded-full bg-red-400 mx-auto mt-1" />
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 mb-1">
                <span className="text-gray-500 font-bold text-sm">{attendance.unrecorded}</span>
              </div>
              <p className="text-xs text-gray-500">미기록</p>
              <div className="w-2 h-2 rounded-full bg-gray-300 mx-auto mt-1" />
            </div>
          </div>
        </div>
      )}

      {/* 활성 교실 (실시간) */}
      {roomStatus.sessions.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">활성 교실</h2>
            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              실시간
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {roomStatus.sessions.map((session) => {
              const teacherCount = roomStatus.teachers.filter(
                (t) => t.room_session_id === session.id
              ).length;
              return (
                <div
                  key={session.id}
                  className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-green-50 border border-green-100"
                >
                  <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-green-600 font-bold text-sm">🏫</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">교실 세션</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      교사 체크인 {teacherCount}명
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-green-500 text-white text-[10px] font-bold tracking-wide flex-shrink-0">
                    LIVE
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 우리 아이들 한눈에 보기 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">우리 아이들 한눈에 보기</h2>
          <span className="text-xs text-gray-400">{members.length}명</span>
        </div>

        {/* 클럽 탭 */}
        {clubs.length > 1 && (
          <div className="flex gap-2 mb-4">
            {clubs.map(club => (
              <button
                key={club.id}
                onClick={() => setCurrentClub(club)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  currentClub?.id === club.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {club.type === 'sparks' ? '스팍스' : club.type === 'tnt' ? 'T&T' : club.name}
              </button>
            ))}
          </div>
        )}

        {members.length > 0 ? (
          <div className="space-y-5">
            {teamGroups.map(team => (
              <div key={team.id}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: team.color }} />
                  <span className="text-xs font-semibold text-gray-600">{team.name} 팀</span>
                  <span className="text-xs text-gray-400">({team.members.length}명)</span>
                </div>
                <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {team.members.map(member => (
                    <DashboardFaceTile
                      key={member.id}
                      member={member}
                      teamColor={team.color}
                      onTap={() => openMemberProfile(member.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
            {unassignedMembers.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                  <span className="text-xs font-semibold text-gray-600">미배정</span>
                  <span className="text-xs text-gray-400">({unassignedMembers.length}명)</span>
                </div>
                <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {unassignedMembers.map(member => (
                    <DashboardFaceTile
                      key={member.id}
                      member={member}
                      onTap={() => openMemberProfile(member.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-gray-400">등록된 클럽원이 없습니다.</p>
          </div>
        )}
      </div>

      {/* 실시간 활동 피드 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">실시간 활동 피드</h2>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
            <span className="text-2xl">📋</span>
          </div>
          <p className="text-sm text-gray-400">활동이 시작되면 여기에 표시됩니다.</p>
        </div>
      </div>
    </div>
  );
}
