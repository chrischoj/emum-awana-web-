import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useClub } from '../../contexts/ClubContext';
import { useMemberProfile } from '../../contexts/MemberProfileContext';
import { useRealtimeRoomStatus } from '../../hooks/useRealtimeRoomStatus';
import { getToday } from '../../lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Member, Teacher, ActiveTeacherAssignment, Room } from '../../types/awana';

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

function formatElapsed(startedAt: string): string {
  const diff = Date.now() - new Date(startedAt).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hrs > 0) return `${hrs}:${String(remainMins).padStart(2, '0')}`;
  return `${mins}분`;
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

const TEACHER_CATEGORIES: { key: string; label: string; positions: string[] }[] = [
  { key: 'admin', label: '행정', positions: ['조정관', '감독관', '서기', '회계'] },
  { key: 'game', label: '게임디렉터', positions: ['게임디렉터'] },
  { key: 'support', label: '보조 교사', positions: ['보조 교사'] },
];

function getTeacherCategory(position: string | null): string {
  if (!position) return 'other';
  for (const cat of TEACHER_CATEGORIES) {
    if (cat.positions.includes(position)) return cat.key;
  }
  return 'other';
}

function DashboardTeacherTile({ teacher, badges }: { teacher: Teacher; badges?: { label: string; color: string }[] }) {
  const [imgError, setImgError] = useState(false);
  const initials = teacher.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      {teacher.avatar_url && !imgError ? (
        <img src={teacher.avatar_url} alt={teacher.name} className="w-full aspect-square rounded-2xl object-cover shadow-sm ring-2 ring-indigo-200" onError={() => setImgError(true)} />
      ) : (
        <div className="w-full aspect-square rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-400 to-purple-500 shadow-sm ring-2 ring-indigo-200">
          <span className="text-2xl font-bold text-white">{initials}</span>
        </div>
      )}
      <span className="text-xs font-medium text-gray-700 text-center truncate w-full">{teacher.name}</span>
      {teacher.position && (
        <span className="text-[10px] text-gray-400 text-center truncate w-full -mt-0.5">{teacher.position}</span>
      )}
      {/* 담임 뱃지 - 이름 아래 표시 */}
      {badges && badges.length > 0 && (
        <div className="flex flex-wrap justify-center gap-0.5 w-full">
          {badges.map((b, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white leading-tight" style={{ backgroundColor: b.color }}>
              {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
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

// --- localStorage 캐시 (stale-while-revalidate) ---
const DASHBOARD_CACHE_KEY = 'awana_dashboard_cache';

interface DashboardCache {
  teachers: Teacher[];
  assignments: ActiveTeacherAssignment[];
  rooms: Room[];
  stats: Stats;
  attendance: AttendanceBreakdown;
  timestamp: number;
}

function loadDashboardCache(): DashboardCache | null {
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DashboardCache;
  } catch {
    return null;
  }
}

function saveDashboardCache(data: DashboardCache) {
  try {
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data));
  } catch {}
}

export default function DashboardPage() {
  // 캐시 복원
  const cachedRef = useRef(loadDashboardCache());
  const cache = cachedRef.current;

  const [stats, setStats] = useState<Stats>(cache?.stats || {
    activeMembers: 0,
    totalMembers: 0,
    teachers: 0,
    attendancePresent: 0,
    attendanceLate: 0,
    attendanceAbsent: 0,
  });
  const [attendance, setAttendance] = useState<AttendanceBreakdown>(cache?.attendance || {
    present: 0,
    late: 0,
    absent: 0,
    unrecorded: 0,
    hasData: false,
  });
  const [loading, setLoading] = useState(!cache);
  const roomStatus = useRealtimeRoomStatus();
  const { clubs, members, teams, currentClub, setCurrentClub } = useClub();
  const { openMemberProfile } = useMemberProfile();

  // 교사/배정/교실 데이터
  const [allTeachers, setAllTeachers] = useState<Teacher[]>(cache?.teachers || []);
  const [allAssignments, setAllAssignments] = useState<ActiveTeacherAssignment[]>(cache?.assignments || []);
  const [allRooms, setAllRooms] = useState<Room[]>(cache?.rooms || []);
  const [openSectionIds, setOpenSectionIds] = useState<Set<string>>(new Set());
  const [allRoomsExpanded, setAllRoomsExpanded] = useState(true);
  const [allTeachersExpanded, setAllTeachersExpanded] = useState(true);
  const [classroomExpanded, setClassroomExpanded] = useState(false);

  // --- 최적화 1: 단일 useEffect + Promise.all (7→6 쿼리, teachers COUNT 제거) ---
  useEffect(() => {
    async function loadDashboard() {
      const today = getToday();
      const [teachersRes, assignmentsRes, roomsRes, activeMembersRes, totalMembersRes, attendanceRes] = await Promise.all([
        supabase.from('teachers').select('*').eq('active', true).order('name'),
        supabase.from('active_teacher_assignments').select('*'),
        supabase.from('rooms').select('*').eq('active', true).order('name'),
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('active', true).eq('enrollment_status', 'active'),
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('member_attendance').select('status').eq('training_date', today),
      ]);

      const teachersList = (teachersRes.data as Teacher[]) || [];
      const assignmentsList = (assignmentsRes.data as ActiveTeacherAssignment[]) || [];
      const roomsList = (roomsRes.data as Room[]) || [];

      setAllTeachers(teachersList);
      setAllAssignments(assignmentsList);
      setAllRooms(roomsList);

      const activeMembers = activeMembersRes.count ?? 0;
      const totalMembers = totalMembersRes.count ?? 0;

      const records = attendanceRes.data ?? [];
      const presentCount = records.filter((r) => r.status === 'present').length;
      const lateCount = records.filter((r) => r.status === 'late').length;
      const absentCount = records.filter((r) => r.status === 'absent').length;
      const unrecordedCount = Math.max(0, activeMembers - presentCount - lateCount - absentCount);

      setStats({
        activeMembers,
        totalMembers,
        teachers: teachersList.length,
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

      saveDashboardCache({
        teachers: teachersList,
        assignments: assignmentsList,
        rooms: roomsList,
        stats: { activeMembers, totalMembers, teachers: teachersList.length, attendancePresent: presentCount, attendanceLate: lateCount, attendanceAbsent: absentCount },
        attendance: { present: presentCount, late: lateCount, absent: absentCount, unrecorded: unrecordedCount, hasData: records.length > 0 },
        timestamp: Date.now(),
      });

      setLoading(false);
    }
    loadDashboard();
  }, []);

  const toggleSection = (id: string) => {
    setOpenSectionIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // --- 최적화 2: useMemo 적용 ---

  const clubRooms = useMemo(() => allRooms
    .filter(r => currentClub && r.club_id === currentClub.id)
    .map(r => {
      const team = teams.find(t => t.id === r.team_id);
      const roomMembers = members.filter(m =>
        m.room_id === r.id || (!m.room_id && m.team_id === r.team_id)
      );
      const roomTeachers = allAssignments
        .filter(a => a.room_id === r.id)
        .map(a => {
          const t = allTeachers.find(tc => tc.id === a.teacher_id);
          return t ? { teacher: t, assignmentType: a.assignment_type } : null;
        })
        .filter((x): x is { teacher: Teacher; assignmentType: string } => !!x);
      return { ...r, team, members: roomMembers, teachers: roomTeachers };
    })
    .filter(r => r.members.length > 0), [allRooms, currentClub, teams, members, allAssignments, allTeachers]);

  const hasRooms = clubRooms.length > 0;

  const { roomMatchedIds, noRoomMembers } = useMemo(() => {
    const ids = new Set(clubRooms.flatMap(r => r.members.map(m => m.id)));
    return { roomMatchedIds: ids, noRoomMembers: members.filter(m => !ids.has(m.id)) };
  }, [clubRooms, members]);

  const teamGroups = useMemo(() => teams.map(team => ({
    ...team,
    members: members.filter(m => m.team_id === team.id),
  })).filter(t => t.members.length > 0), [teams, members]);

  const unassignedMembers = useMemo(() => members.filter(m => !m.team_id), [members]);

  const teamTeacherMap = useMemo(() => {
    const map = new Map<string, { teacher: Teacher; assignmentType: string }[]>();
    for (const a of allAssignments) {
      const t = allTeachers.find(tc => tc.id === a.teacher_id);
      if (t) {
        const existing = map.get(a.team_id) || [];
        existing.push({ teacher: t, assignmentType: a.assignment_type });
        map.set(a.team_id, existing);
      }
    }
    return map;
  }, [allAssignments, allTeachers]);

  const teachersByCategory = useMemo(() => {
    const assignedTeacherIds = new Set(allAssignments.map(a => a.teacher_id));
    const result: { key: string; label: string; teachers: Teacher[] }[] = [];
    for (const cat of TEACHER_CATEGORIES) {
      const matched = allTeachers.filter(t => getTeacherCategory(t.position) === cat.key);
      if (matched.length > 0) result.push({ key: cat.key, label: cat.label, teachers: matched });
    }
    const assignedRegular = allTeachers.filter(t => assignedTeacherIds.has(t.id) && getTeacherCategory(t.position) === 'other');
    if (assignedRegular.length > 0) result.push({ key: 'assigned', label: '담임 교사', teachers: assignedRegular });
    const unassignedRegular = allTeachers.filter(t => !assignedTeacherIds.has(t.id) && getTeacherCategory(t.position) === 'other');
    if (unassignedRegular.length > 0) result.push({ key: 'unassigned', label: '미배정 교사', teachers: unassignedRegular });
    return result;
  }, [allAssignments, allTeachers]);

  const { attendanceRate, attendanceColor, attendanceTextColor, memberRatio } = useMemo(() => {
    const rate = stats.activeMembers > 0 ? Math.round((stats.attendancePresent / stats.activeMembers) * 100) : 0;
    const color = rate >= 70 ? '#22c55e' : rate >= 40 ? '#f59e0b' : '#ef4444';
    const textColor = rate >= 70 ? 'text-green-600' : rate >= 40 ? 'text-amber-500' : 'text-red-500';
    const ratio = stats.totalMembers > 0 ? Math.round((stats.activeMembers / stats.totalMembers) * 100) : 0;
    return { attendanceRate: rate, attendanceColor: color, attendanceTextColor: textColor, memberRatio: ratio };
  }, [stats]);

  // --- 활성 교실 enriched 데이터 (현재 클럽만) ---
  const enrichedSessions = useMemo(() => {
    return roomStatus.sessions
      .filter(session => {
        const room = allRooms.find(r => r.id === session.room_id);
        return room && currentClub && room.club_id === currentClub.id;
      })
      .map(session => {
        const room = allRooms.find(r => r.id === session.room_id)!;
        const team = teams.find(t => t.id === room.team_id);
        const checkedInTeacherIds = roomStatus.teachers
          .filter(t => t.room_session_id === session.id)
          .map(t => t.teacher_id);
        const checkedInTeachers = checkedInTeacherIds
          .map(tid => {
            const t = allTeachers.find(tc => tc.id === tid);
            const assignment = allAssignments.find(a => a.teacher_id === tid && a.room_id === session.room_id);
            return t ? { teacher: t, assignmentType: assignment?.assignment_type ?? null } : null;
          })
          .filter((x): x is { teacher: Teacher; assignmentType: string | null } => !!x);
        const assignedCount = allAssignments.filter(a => a.room_id === session.room_id).length;
        const roomMembers = members.filter(m =>
          m.room_id === session.room_id || (!m.room_id && m.team_id === room.team_id)
        );
        return {
          ...session,
          room,
          team,
          checkedInTeachers,
          assignedTeacherCount: assignedCount,
          memberCount: roomMembers.length,
        };
      });
  }, [roomStatus.sessions, roomStatus.teachers, allRooms, teams, allTeachers, allAssignments, members, currentClub]);

  const inactiveRooms = useMemo(() => {
    const activeRoomIds = new Set(roomStatus.sessions.map(s => s.room_id));
    return allRooms
      .filter(r => currentClub && r.club_id === currentClub.id && !activeRoomIds.has(r.id) && allAssignments.some(a => a.room_id === r.id))
      .map(r => {
        const team = teams.find(t => t.id === r.team_id);
        const assignedTeachers = allAssignments
          .filter(a => a.room_id === r.id)
          .map(a => allTeachers.find(t => t.id === a.teacher_id))
          .filter((t): t is Teacher => !!t);
        return { ...r, team, assignedTeachers };
      });
  }, [allRooms, roomStatus.sessions, allAssignments, teams, allTeachers, currentClub]);

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

      {/* 교실 현황 (실시간) */}
      {(enrichedSessions.length > 0 || inactiveRooms.length > 0) && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          {/* 헤더 + 요약 + 토글 */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-700">교실 현황</h2>
              <span className="text-xs text-gray-400">
                {enrichedSessions.length}개 운영 · {inactiveRooms.length}개 대기
              </span>
            </div>
            <div className="flex items-center gap-2">
              {enrichedSessions.length > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  실시간
                </span>
              )}
              <button
                onClick={() => setClassroomExpanded(prev => !prev)}
                className="text-xs text-indigo-500 font-medium hover:text-indigo-700 transition-colors"
              >
                {classroomExpanded ? '간소화' : '상세보기'}
              </button>
            </div>
          </div>

          {/* 간소화 모드: 한 줄 요약 리스트 */}
          {!classroomExpanded && (
            <div className="space-y-1.5">
              {enrichedSessions.map((es) => {
                const teamColor = es.team?.color || '#6366f1';
                return (
                  <div key={es.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-green-50/60 border border-green-100">
                    <div className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: teamColor }} />
                    <span className="text-sm font-semibold text-gray-800 truncate">{es.room?.name || '교실'}</span>
                    {es.team && <span className="text-xs text-gray-400">{es.team.name}</span>}
                    <div className="flex-1" />
                    {es.checkedInTeachers.length > 0 && (
                      <div className="flex -space-x-1 flex-shrink-0">
                        {es.checkedInTeachers.slice(0, 2).map(({ teacher: t }) => (
                          t.avatar_url ? (
                            <img key={t.id} src={t.avatar_url} alt={t.name} className="w-5 h-5 rounded-full object-cover ring-1 ring-white" />
                          ) : (
                            <div key={t.id} className="w-5 h-5 rounded-full ring-1 ring-white flex items-center justify-center text-[9px] font-bold" style={{ backgroundColor: teamColor + '25', color: teamColor }}>
                              {t.name.slice(0, 1)}
                            </div>
                          )
                        ))}
                      </div>
                    )}
                    {es.assignedTeacherCount > 0 && (
                      <span className="text-[11px] text-emerald-600 font-medium flex-shrink-0">
                        {es.checkedInTeachers.length}/{es.assignedTeacherCount}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{formatElapsed(es.started_at)}</span>
                    <span className="px-1.5 py-0.5 rounded bg-green-500 text-white text-[9px] font-bold flex-shrink-0">LIVE</span>
                  </div>
                );
              })}
              {inactiveRooms.map((ir) => (
                <div key={ir.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 opacity-60">
                  <div className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-500 truncate">{ir.name}</span>
                  {ir.team && <span className="text-xs text-gray-400">{ir.team.name}</span>}
                  <div className="flex-1" />
                  <span className="text-xs text-gray-400 truncate max-w-[120px]">{ir.assignedTeachers.map(t => t.name).join(', ')}</span>
                  <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 text-[9px] font-bold flex-shrink-0">대기</span>
                </div>
              ))}
            </div>
          )}

          {/* 상세 모드: 풀 카드 */}
          {classroomExpanded && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {enrichedSessions.map((es) => {
                const teamColor = es.team?.color || '#6366f1';
                const gradient = getGradientByColor(teamColor);
                return (
                  <div key={es.id} className="rounded-xl border border-green-200 overflow-hidden">
                    <div className={`h-1.5 bg-gradient-to-r ${gradient}`} />
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse" style={{ backgroundColor: teamColor }} />
                          <span className="text-sm font-bold text-gray-900 truncate">{es.room?.name || '교실'}</span>
                          {es.team && <span className="text-xs text-gray-400 truncate">{es.team.name}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="px-2 py-0.5 rounded-full bg-green-500 text-white text-[10px] font-bold tracking-wide">LIVE</span>
                          <span className="text-[11px] text-gray-400 font-medium">{formatElapsed(es.started_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          {es.checkedInTeachers.length > 0 && (
                            <div className="flex -space-x-1.5 flex-shrink-0">
                              {es.checkedInTeachers.slice(0, 3).map(({ teacher: t }) => (
                                t.avatar_url ? (
                                  <img key={t.id} src={t.avatar_url} alt={t.name} className="w-6 h-6 rounded-full object-cover ring-2 ring-white" />
                                ) : (
                                  <div key={t.id} className="w-6 h-6 rounded-full ring-2 ring-white flex items-center justify-center" style={{ backgroundColor: teamColor + '30' }}>
                                    <span className="text-[10px] font-bold" style={{ color: teamColor }}>{t.name.slice(0, 1)}</span>
                                  </div>
                                )
                              ))}
                            </div>
                          )}
                          <p className="text-xs text-gray-600 truncate">
                            {es.checkedInTeachers.map(({ teacher: t, assignmentType }) =>
                              `${t.name}${assignmentType === 'primary' ? '(담임)' : assignmentType === 'temporary' ? '(지원)' : ''}`
                            ).join(' · ') || '교사 없음'}
                          </p>
                        </div>
                        {es.assignedTeacherCount > 0 && (
                          <span className="text-[11px] font-medium text-emerald-600 flex-shrink-0 ml-2">
                            체크인 {es.checkedInTeachers.length}/{es.assignedTeacherCount}
                          </span>
                        )}
                      </div>
                      {es.memberCount > 0 && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: '100%', backgroundColor: teamColor + '80' }} />
                          </div>
                          <span className="text-[11px] text-gray-400 flex-shrink-0">{es.memberCount}명</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {inactiveRooms.map((ir) => (
                <div key={ir.id} className="rounded-xl border border-gray-200 overflow-hidden opacity-60">
                  <div className="h-1.5 bg-gray-200" />
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0" />
                        <span className="text-sm font-bold text-gray-500 truncate">{ir.name}</span>
                        {ir.team && <span className="text-xs text-gray-400 truncate">{ir.team.name}</span>}
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold tracking-wide flex-shrink-0">대기</span>
                    </div>
                    {ir.assignedTeachers.length > 0 && (
                      <p className="text-xs text-gray-400">배정: {ir.assignedTeachers.map(t => t.name).join(', ')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 우리 아이들 한눈에 보기 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">우리 아이들 한눈에 보기</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{members.length}명</span>
            {(hasRooms || teamGroups.length > 1) && (
              <button
                onClick={() => setAllRoomsExpanded(prev => !prev)}
                className="text-xs text-indigo-500 font-medium hover:text-indigo-700 transition-colors"
              >
                {allRoomsExpanded ? '전체 접기' : '전체 펼치기'}
              </button>
            )}
          </div>
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
          <div className="space-y-3">
            {/* 학급이 있는 클럽: 학급별 그룹핑 */}
            {hasRooms ? (
              <>
                {clubRooms.map(roomData => {
                  const isOpen = allRoomsExpanded || openSectionIds.has(roomData.id);
                  return (
                    <div key={roomData.id} className="rounded-xl border border-gray-100 overflow-hidden">
                      <button
                        onClick={() => {
                          if (allRoomsExpanded) {
                            // 전체 펼침 모드에서 개별 클릭 → 개별 모드로 전환
                            setAllRoomsExpanded(false);
                            // 이 항목만 빼고 나머지 전부 열기
                            const allIds = new Set(clubRooms.map(r => r.id));
                            allIds.delete(roomData.id);
                            if (noRoomMembers.length > 0) allIds.add('no-room-dashboard');
                            setOpenSectionIds(allIds);
                          } else {
                            toggleSection(roomData.id);
                          }
                        }}
                        className="w-full flex items-center justify-between p-3 bg-gray-50/80 hover:bg-gray-100/80 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: roomData.team?.color }} />
                          <span className="text-sm font-semibold text-gray-800">{roomData.name}</span>
                          <span className="text-xs text-gray-400">({roomData.members.length}명)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* 담임 교사 미니 아바타 */}
                          {roomData.teachers.length > 0 && (
                            <div className="flex -space-x-1.5">
                              {roomData.teachers.slice(0, 3).map(({ teacher: t }) => {
                                const ini = t.name.slice(0, 1);
                                return t.avatar_url ? (
                                  <img key={t.id} src={t.avatar_url} alt={t.name} className="w-6 h-6 rounded-full object-cover ring-2 ring-white" />
                                ) : (
                                  <div key={t.id} className="w-6 h-6 rounded-full bg-indigo-100 ring-2 ring-white flex items-center justify-center">
                                    <span className="text-[10px] font-bold text-indigo-600">{ini}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="p-3">
                          {/* 담임 교사 정보 */}
                          {roomData.teachers.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                              {roomData.teachers.map(({ teacher: t, assignmentType }) => (
                                <div key={t.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-50 text-xs">
                                  <span className="font-medium text-indigo-700">{t.name}</span>
                                  <span className="text-indigo-400">{assignmentType === 'primary' ? '담임' : '지원'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                            {roomData.members.map(member => (
                              <DashboardFaceTile
                                key={member.id}
                                member={member}
                                teamColor={roomData.team?.color}
                                onTap={() => openMemberProfile(member.id)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* 학급 미배정 멤버 */}
                {noRoomMembers.length > 0 && (
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <button
                      onClick={() => {
                        if (allRoomsExpanded) {
                          setAllRoomsExpanded(false);
                          const allIds = new Set(clubRooms.map(r => r.id));
                          setOpenSectionIds(allIds);
                        } else {
                          toggleSection('no-room-dashboard');
                        }
                      }}
                      className="w-full flex items-center justify-between p-3 bg-gray-50/80 hover:bg-gray-100/80 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-gray-300 flex-shrink-0" />
                        <span className="text-sm font-semibold text-gray-600">학급 미배정</span>
                        <span className="text-xs text-gray-400">({noRoomMembers.length}명)</span>
                      </div>
                      {(allRoomsExpanded || openSectionIds.has('no-room-dashboard'))
                        ? <ChevronDown className="w-4 h-4 text-gray-400" />
                        : <ChevronRight className="w-4 h-4 text-gray-400" />
                      }
                    </button>
                    {(allRoomsExpanded || openSectionIds.has('no-room-dashboard')) && (
                      <div className="p-3">
                        <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                          {noRoomMembers.map(member => {
                            const team = teams.find(t => t.id === member.team_id);
                            return (
                              <DashboardFaceTile
                                key={member.id}
                                member={member}
                                teamColor={team?.color}
                                onTap={() => openMemberProfile(member.id)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* 학급 없는 클럽 (스팍스 등): 팀별 그룹핑 */
              <>
                {teamGroups.map(team => {
                  const isOpen = allRoomsExpanded || openSectionIds.has(team.id);
                  const tTeachers = teamTeacherMap.get(team.id) || [];
                  return (
                    <div key={team.id} className="rounded-xl border border-gray-100 overflow-hidden">
                      <button
                        onClick={() => {
                          if (allRoomsExpanded) {
                            setAllRoomsExpanded(false);
                            const allIds = new Set(teamGroups.map(t => t.id));
                            allIds.delete(team.id);
                            setOpenSectionIds(allIds);
                          } else {
                            toggleSection(team.id);
                          }
                        }}
                        className="w-full flex items-center justify-between p-3 bg-gray-50/80 hover:bg-gray-100/80 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                          <span className="text-sm font-semibold text-gray-800">{team.name} 팀</span>
                          <span className="text-xs text-gray-400">({team.members.length}명)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {tTeachers.length > 0 && (
                            <div className="flex -space-x-1.5">
                              {tTeachers.slice(0, 3).map(({ teacher: t }) => {
                                const ini = t.name.slice(0, 1);
                                return t.avatar_url ? (
                                  <img key={t.id} src={t.avatar_url} alt={t.name} className="w-6 h-6 rounded-full object-cover ring-2 ring-white" />
                                ) : (
                                  <div key={t.id} className="w-6 h-6 rounded-full bg-indigo-100 ring-2 ring-white flex items-center justify-center">
                                    <span className="text-[10px] font-bold text-indigo-600">{ini}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="p-3">
                          {tTeachers.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                              {tTeachers.map(({ teacher: t, assignmentType }) => (
                                <div key={t.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-50 text-xs">
                                  <span className="font-medium text-indigo-700">{t.name}</span>
                                  <span className="text-indigo-400">{assignmentType === 'primary' ? '담임' : '지원'}</span>
                                </div>
                              ))}
                            </div>
                          )}
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
                      )}
                    </div>
                  );
                })}
                {unassignedMembers.length > 0 && (
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <button
                      onClick={() => toggleSection('unassigned-team')}
                      className="w-full flex items-center justify-between p-3 bg-gray-50/80 hover:bg-gray-100/80 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-gray-300 flex-shrink-0" />
                        <span className="text-sm font-semibold text-gray-600">팀 미배정</span>
                        <span className="text-xs text-gray-400">({unassignedMembers.length}명)</span>
                      </div>
                      {openSectionIds.has('unassigned-team')
                        ? <ChevronDown className="w-4 h-4 text-gray-400" />
                        : <ChevronRight className="w-4 h-4 text-gray-400" />
                      }
                    </button>
                    {openSectionIds.has('unassigned-team') && (
                      <div className="p-3">
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
                )}
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-gray-400">등록된 클럽원이 없습니다.</p>
          </div>
        )}
      </div>

      {/* 우리 선생님들 */}
      {allTeachers.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">우리 선생님들</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{allTeachers.length}명</span>
              {teachersByCategory.length > 1 && (
                <button
                  onClick={() => setAllTeachersExpanded(prev => !prev)}
                  className="text-xs text-indigo-500 font-medium hover:text-indigo-700 transition-colors"
                >
                  {allTeachersExpanded ? '전체 접기' : '전체 펼치기'}
                </button>
              )}
            </div>
          </div>
          <div className="space-y-3">
            {teachersByCategory.map(cat => {
              const catSectionId = `teacher-cat-${cat.key}`;
              const isCatOpen = allTeachersExpanded || openSectionIds.has(catSectionId);
              return (
                <div key={cat.key} className="rounded-xl border border-gray-100 overflow-hidden">
                  <button
                    onClick={() => {
                      if (allTeachersExpanded) {
                        setAllTeachersExpanded(false);
                        const allIds = new Set(teachersByCategory.map(c => `teacher-cat-${c.key}`));
                        allIds.delete(catSectionId);
                        setOpenSectionIds(prev => {
                          const next = new Set(prev);
                          for (const id of allIds) next.add(id);
                          return next;
                        });
                      } else {
                        toggleSection(catSectionId);
                      }
                    }}
                    className="w-full flex items-center justify-between p-3 bg-gray-50/80 hover:bg-gray-100/80 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-700">{cat.label}</span>
                      <span className="text-xs text-gray-400">({cat.teachers.length}명)</span>
                    </div>
                    {isCatOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </button>
                  {isCatOpen && (
                    <div className="p-3">
                      <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {cat.teachers.map(t => {
                          const teacherAssigns = allAssignments.filter(a => a.teacher_id === t.id);
                          const badges: { label: string; color: string }[] = [];
                          for (const a of teacherAssigns) {
                            const roomName = allRooms.find(r => r.id === a.room_id)?.name;
                            if (roomName) {
                              badges.push({
                                label: a.assignment_type === 'primary' ? `${roomName} 담임` : `${roomName} 지원`,
                                color: a.team_color || '#6366f1',
                              });
                            }
                          }
                          return (
                            <DashboardTeacherTile key={t.id} teacher={t} badges={badges} />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
