import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';
import { useMemberProfile } from '../../contexts/MemberProfileContext';
import { useTeacherAssignment } from '../../hooks/useTeacherAssignment';
import { getSubmissionsByDate, getWeeklyScores } from '../../services/scoringService';
import { supabase } from '../../lib/supabase';
import { getToday } from '../../lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SubmissionStatus, Member, Team, Club, Teacher, ActiveTeacherAssignment, Room } from '../../types/awana';

function getGradientClass(color?: string): string {
  const map: Record<string, string> = {
    '#EF4444': 'from-red-300 to-red-500',
    '#3B82F6': 'from-blue-300 to-blue-500',
    '#22C55E': 'from-green-300 to-green-500',
    '#EAB308': 'from-yellow-300 to-yellow-500',
  };
  return map[color || ''] || 'from-indigo-300 to-indigo-500';
}

function FaceTile({ member, teamColor, onTap }: { member: Member; teamColor?: string; onTap: () => void }) {
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
          className="w-full aspect-square rounded-2xl object-cover shadow-sm active:scale-95 transition-transform"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className={`w-full aspect-square rounded-2xl flex items-center justify-center bg-gradient-to-br ${getGradientClass(teamColor)} shadow-sm active:scale-95 transition-transform`}>
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
    if (cat.positions.some(p => position.includes(p))) return cat.key;
  }
  return 'other';
}

function TeacherFaceTile({ teacher, subtitle }: { teacher: Teacher; subtitle?: string }) {
  const [imgError, setImgError] = useState(false);
  const initials = teacher.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      {teacher.avatar_url && !imgError ? (
        <img
          src={teacher.avatar_url}
          alt={teacher.name}
          className="w-full aspect-square rounded-2xl object-cover shadow-sm ring-2 ring-indigo-200"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full aspect-square rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-400 to-purple-500 shadow-sm ring-2 ring-indigo-200">
          <span className="text-2xl font-bold text-white">{initials}</span>
        </div>
      )}
      <span className="text-xs font-medium text-gray-700 text-center truncate w-full">{teacher.name}</span>
      {subtitle && (
        <span className="text-[10px] text-gray-400 text-center truncate w-full -mt-0.5">{subtitle}</span>
      )}
    </div>
  );
}

interface TeamSubmissionInfo {
  teamId: string;
  teamName: string;
  teamColor: string;
  status: SubmissionStatus | null;
  hasScores: boolean;
}

export default function TeacherHome() {
  const { teacher } = useAuth();
  const { currentClub, clubs, teams, members: allMembers } = useClub();
  const { openMemberProfile } = useMemberProfile();
  const {
    assignedTeamIds,
    assignedMembers,
    isUnassigned,
    isReadOnly,
    primaryAssignments,
    temporaryAssignments,
    loading: assignmentLoading,
    error: assignmentError,
  } = useTeacherAssignment();

  const [teamSubmissions, setTeamSubmissions] = useState<TeamSubmissionInfo[]>([]);
  const [openSectionIds, setOpenSectionIds] = useState<Set<string>>(new Set());

  // 전체 교사 + 배정 + 교실 데이터
  const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
  const [allAssignments, setAllAssignments] = useState<ActiveTeacherAssignment[]>([]);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [dataLoadError, setDataLoadError] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('teachers').select('*').eq('active', true).order('name'),
      supabase.from('active_teacher_assignments').select('*'),
      supabase.from('rooms').select('*').eq('active', true).order('name'),
    ]).then(([teachersRes, assignmentsRes, roomsRes]) => {
      setAllTeachers((teachersRes.data as Teacher[]) || []);
      setAllAssignments((assignmentsRes.data as ActiveTeacherAssignment[]) || []);
      setAllRooms((roomsRes.data as Room[]) || []);
    }).catch(() => { setAllTeachers([]); setAllAssignments([]); setAllRooms([]); setDataLoadError(true); });
  }, []);

  // 팀별 담임 교사 맵: teamId -> Teacher[]
  const teamTeacherMap = new Map<string, Teacher[]>();
  for (const a of allAssignments) {
    const t = allTeachers.find(tc => tc.id === a.teacher_id);
    if (t) {
      const existing = teamTeacherMap.get(a.team_id) || [];
      existing.push(t);
      teamTeacherMap.set(a.team_id, existing);
    }
  }

  // 배정된 교사 ID 세트
  const assignedTeacherIds = new Set(allAssignments.map(a => a.teacher_id));

  // 모든 교사를 카테고리별로 그룹핑 (본인 포함)
  const allTeachersList = allTeachers;
  const assignedRegularTeachers = allTeachersList.filter(
    t => assignedTeacherIds.has(t.id) && getTeacherCategory(t.position) === 'other'
  );
  const teachersByCategory: { key: string; label: string; teachers: Teacher[] }[] = [];
  for (const cat of TEACHER_CATEGORIES) {
    const matched = allTeachersList.filter(t => getTeacherCategory(t.position) === cat.key);
    if (matched.length > 0) teachersByCategory.push({ key: cat.key, label: cat.label, teachers: matched });
  }
  if (assignedRegularTeachers.length > 0) {
    teachersByCategory.push({ key: 'assigned', label: '담임 교사', teachers: assignedRegularTeachers });
  }
  const unassignedRegular = allTeachersList.filter(
    t => !assignedTeacherIds.has(t.id) && getTeacherCategory(t.position) === 'other'
  );
  if (unassignedRegular.length > 0) {
    teachersByCategory.push({ key: 'unassigned', label: '미배정 교사', teachers: unassignedRegular });
  }

  // 다른 클럽 멤버/팀 로드 (currentClub 외의 클럽들)
  const [otherClubData, setOtherClubData] = useState<
    { club: Club; teams: (Team & { members: Member[] })[] }[]
  >([]);

  useEffect(() => {
    if (!currentClub || clubs.length <= 1) {
      setOtherClubData([]);
      return;
    }
    const otherClubIds = clubs.filter(c => c.id !== currentClub.id).map(c => c.id);
    if (otherClubIds.length === 0) { setOtherClubData([]); return; }

    Promise.all([
      supabase.from('teams').select('*').in('club_id', otherClubIds).order('name'),
      supabase.from('members').select('*').in('club_id', otherClubIds)
        .eq('active', true).eq('enrollment_status', 'active').order('name'),
    ]).then(([teamsRes, membersRes]) => {
      const otherTeamsList = (teamsRes.data as Team[]) || [];
      const otherMembersList = (membersRes.data as Member[]) || [];

      const grouped = clubs
        .filter(c => c.id !== currentClub.id)
        .map(club => ({
          club,
          teams: otherTeamsList
            .filter(t => t.club_id === club.id)
            .map(t => ({
              ...t,
              members: otherMembersList.filter(m => m.team_id === t.id),
            }))
            .filter(t => t.members.length > 0),
        }))
        .filter(g => g.teams.length > 0);

      setOtherClubData(grouped);
    }).catch(() => setOtherClubData([]));
  }, [currentClub, clubs]);

  // 같은 클럽 내 다른 학급 아이들
  const assignedMemberIds = new Set(assignedMembers.map(m => m.id));
  const sameClubOtherMembers = isUnassigned ? allMembers : allMembers.filter(m => !assignedMemberIds.has(m.id));
  const sameClubOtherRooms = allRooms
    .filter(r => currentClub && r.club_id === currentClub.id)
    .filter(r => {
      // 배정된 교사: 자기 학급 제외
      const assignedRoomIds = primaryAssignments.map(a => a.room_id).concat(temporaryAssignments.map(a => a.room_id));
      return isUnassigned || !assignedRoomIds.includes(r.id);
    })
    .map(r => {
      const team = teams.find(t => t.id === r.team_id);
      return {
        ...r,
        team,
        members: sameClubOtherMembers.filter(m =>
          m.room_id === r.id || (!m.room_id && m.team_id === r.team_id)
        ),
      };
    })
    .filter(r => r.members.length > 0);
  // 어떤 학급에도 매핑되지 않은 멤버만 미배정 처리
  const sameClubMatchedIds = new Set(sameClubOtherRooms.flatMap(r => r.members.map(m => m.id)));
  const sameClubNoRoomMembers = sameClubOtherMembers.filter(m => !sameClubMatchedIds.has(m.id));

  const hasOtherKids = sameClubOtherRooms.length > 0 || sameClubNoRoomMembers.length > 0 || otherClubData.length > 0;
  const hasTeacherSection = teachersByCategory.length > 0 || allTeachersList.length > 0;

  // T&T 학급별 그룹핑 헬퍼
  const isCurrentClubTnT = currentClub?.type === 'tnt';
  const groupMembersByRoom = (memberList: Member[], clubType?: string) => {
    if (clubType !== 'tnt') return null;
    const roomGroups: { room: Room | null; members: Member[] }[] = [];
    const roomMap = new Map<string | null, Member[]>();
    for (const m of memberList) {
      const key = m.room_id;
      const arr = roomMap.get(key) || [];
      arr.push(m);
      roomMap.set(key, arr);
    }
    for (const [roomId, members] of roomMap) {
      const room = roomId ? allRooms.find(r => r.id === roomId) || null : null;
      roomGroups.push({ room, members });
    }
    // 학급 이름순 정렬, 미배정은 마지막
    roomGroups.sort((a, b) => {
      if (!a.room) return 1;
      if (!b.room) return -1;
      return a.room.name.localeCompare(b.room.name);
    });
    return roomGroups;
  };

  const toggleSection = (id: string) => {
    setOpenSectionIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 오늘 제출 상태 + 점수 존재 여부 로드
  useEffect(() => {
    if (!currentClub || assignedTeamIds.length === 0) {
      setTeamSubmissions([]);
      return;
    }
    const today = getToday();
    Promise.all([
      getSubmissionsByDate(currentClub.id, today),
      getWeeklyScores(currentClub.id, today),
    ])
      .then(([submissions, scores]) => {
        const subMap = new Map(submissions.map(s => [s.team_id, s.status]));
        // 팀별 점수 존재 여부: member의 team_id로 매핑
        const teamHasScores = new Set<string>();
        for (const score of scores) {
          const member = assignedMembers.find(m => m.id === score.member_id);
          if (member?.team_id) {
            teamHasScores.add(member.team_id);
          }
        }

        const infos: TeamSubmissionInfo[] = assignedTeamIds.map(teamId => {
          const team = teams.find(t => t.id === teamId);
          return {
            teamId,
            teamName: team?.name || '알 수 없음',
            teamColor: team?.color || '#6B7280',
            status: subMap.get(teamId) || null,
            hasScores: teamHasScores.has(teamId),
          };
        });
        setTeamSubmissions(infos);
      })
      .catch(() => setTeamSubmissions([]));
  }, [currentClub, assignedTeamIds, assignedMembers, teams]);

  const getStatusLabel = (status: SubmissionStatus | null, hasScores: boolean) => {
    if (!status) {
      if (hasScores) return { text: '입력중', color: 'text-yellow-700', bg: 'bg-yellow-100' };
      return { text: '미입력', color: 'text-gray-500', bg: 'bg-gray-100' };
    }
    switch (status) {
      case 'draft': return { text: '입력중', color: 'text-yellow-700', bg: 'bg-yellow-100' };
      case 'submitted': return { text: '승인대기', color: 'text-blue-700', bg: 'bg-blue-100' };
      case 'approved': return { text: '승인됨', color: 'text-green-700', bg: 'bg-green-100' };
      case 'rejected': return { text: '반려됨', color: 'text-red-700', bg: 'bg-red-100' };
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">
        안녕하세요, {teacher?.name}님
      </h1>
      <p className="text-sm text-gray-500 mb-4">
        {currentClub?.name ?? '클럽 미선택'} · {new Date().toLocaleDateString('ko-KR')}
      </p>

      {/* 네트워크 에러 */}
      {(assignmentError || dataLoadError) && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex flex-col items-start gap-2">
          <p className="text-sm font-medium text-red-700">데이터를 불러올 수 없습니다</p>
          <p className="text-xs text-red-500">인터넷 연결을 확인한 후 다시 시도해주세요</p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs font-medium text-red-600 bg-red-100 px-3 py-1.5 rounded-lg active:bg-red-200 transition-colors"
          >
            새로고침
          </button>
        </div>
      )}

      {/* 담당 팀 정보 */}
      {!assignmentLoading && !(assignmentError || dataLoadError) && (
        <div className="mb-6">
          {isUnassigned ? (
            isReadOnly ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-700 font-medium">미배정 상태 (열람 전용)</p>
                <p className="text-xs text-amber-600 mt-0.5">관리자에게 반 배정을 요청하세요</p>
              </div>
            ) : (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700 font-medium">내 학급 없음</p>
                <p className="text-xs text-blue-600 mt-0.5">현재 배정된 학급이 없습니다. 관리 메뉴에서 배정할 수 있습니다.</p>
              </div>
            )
          ) : (
            <div className="flex flex-wrap gap-2">
              {primaryAssignments.map((a) => {
                const clubType = clubs.find(c => c.id === a.club_id)?.type;
                const typeTag = clubType === 'sparks' ? '스팍스' : clubType === 'tnt' ? 'T&T' : '';
                return (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-white"
                    style={{ backgroundColor: a.team_color }}
                  >
                    <span className="w-2 h-2 rounded-full bg-white/50" />
                    {typeTag && <span className="opacity-70">[{typeTag}]</span>}
                    {a.room_name} 담임
                  </span>
                );
              })}
              {temporaryAssignments.map((a) => {
                const clubType = clubs.find(c => c.id === a.club_id)?.type;
                const typeTag = clubType === 'sparks' ? '스팍스' : clubType === 'tnt' ? 'T&T' : '';
                return (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border-2"
                    style={{ borderColor: a.team_color, color: a.team_color }}
                  >
                    {typeTag && <span className="opacity-70">[{typeTag}]</span>}
                    {a.room_name} 지원
                    {a.end_date && <span className="text-xs opacity-70">(~{a.end_date})</span>}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 통계 카드 - admin 미배정이면 숨김 */}
      {!(teacher?.role === 'admin' && isUnassigned) && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{isUnassigned ? '전체 클럽원' : '내 팀원'}</p>
            <p className="text-2xl font-bold text-gray-900">{isUnassigned ? allMembers.length : assignedMembers.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">담당 팀</p>
            <p className="text-2xl font-bold text-gray-900">{assignedTeamIds.length}</p>
          </div>
        </div>
      )}

      {/* 오늘의 할 일 - admin 미배정이면 숨김 */}
      {!(teacher?.role === 'admin' && isUnassigned) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-3">오늘의 할 일</h2>
          <div className="space-y-2">
            {teamSubmissions.length > 0 ? (
              teamSubmissions.map((ts) => {
                const statusInfo = getStatusLabel(ts.status, ts.hasScores);
                return (
                  <div key={ts.teamId} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ts.teamColor }} />
                      <span className="text-sm font-medium text-gray-900">{ts.teamName} 팀</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.bg} ${statusInfo.color}`}>
                      {statusInfo.text}
                    </span>
                  </div>
                );
              })
            ) : (
              <>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <span className="text-amber-600 font-medium text-sm">출석 입력</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <span className="text-blue-600 font-medium text-sm">반별 점수</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 내 학급 */}
      {!isUnassigned && assignedMembers.length > 0 && (
        <div className="mt-6">
          <h2 className="font-semibold text-gray-900 mb-1">
            내 학급{' '}
            <span className="text-sm font-normal text-gray-400">({assignedMembers.length}명)</span>
          </h2>
          {/* 배정된 학급 정보 태그 */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {[...primaryAssignments, ...temporaryAssignments].map(a => {
              const clubType = clubs.find(c => c.id === a.club_id)?.type;
              const typeTag = clubType === 'sparks' ? '스팍스' : clubType === 'tnt' ? 'T&T' : '';
              return (
                <span key={a.id} className="text-xs text-gray-500">
                  {typeTag && `[${typeTag}] `}{a.room_name}
                </span>
              );
            })}
          </div>

          {/* 내 학급 선생님들 (본인 포함) */}
          {(() => {
            const myRoomIds = [
              ...primaryAssignments.map(a => a.room_id),
              ...temporaryAssignments.map(a => a.room_id),
            ];
            const roomTeachers = allAssignments
              .filter(a => myRoomIds.includes(a.room_id))
              .map(a => {
                const t = allTeachers.find(tc => tc.id === a.teacher_id);
                return t ? { teacher: t, assignmentType: a.assignment_type } : null;
              })
              .filter((x): x is { teacher: Teacher; assignmentType: string } => !!x);
            if (roomTeachers.length === 0) return null;
            return (
              <div className="mb-3">
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {roomTeachers.map(({ teacher: t, assignmentType }) => (
                    <TeacherFaceTile
                      key={t.id}
                      teacher={t}
                      subtitle={assignmentType === 'primary' ? '담임' : '임시 담임(지원)'}
                    />
                  ))}
                </div>
              </div>
            );
          })()}

          {/* T&T: 학급별 그룹 / 스팍스: 플랫 */}
          {isCurrentClubTnT && !isUnassigned ? (
            <>
              {(groupMembersByRoom(assignedMembers, 'tnt') || []).map(({ room, members: roomMembers }, idx) => {
                const myRoomIds = [...primaryAssignments.map(a => a.room_id), ...temporaryAssignments.map(a => a.room_id)];
                const isMyRoom = room && myRoomIds.includes(room.id);
                return (
                <div key={room?.id || `unassigned-room-${idx}`} className="mb-4">
                  <p className="text-xs font-medium text-indigo-500 mb-2">
                    {isMyRoom ? '내 학급 아이들' : room ? room.name : '학급 미배정'}
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {roomMembers.map(member => {
                      const team = teams.find(t => t.id === member.team_id);
                      return (
                        <FaceTile
                          key={member.id}
                          member={member}
                          teamColor={team?.color}
                          onTap={() => openMemberProfile(member.id)}
                        />
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {assignedMembers.map(member => {
                const team = teams.find(t => t.id === member.team_id);
                return (
                  <FaceTile
                    key={member.id}
                    member={member}
                    teamColor={team?.color}
                    onTap={() => openMemberProfile(member.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 다른 반 아이들 (같은 클럽 + 다른 클럽 모두) */}
      {hasOtherKids && (
        <div className="mt-6">
          <h2 className="font-semibold text-gray-900 mb-3">
            다른 학급
          </h2>
          <div className="space-y-2">
            {/* 같은 클럽 내 다른 학급 */}
            {sameClubOtherRooms.length > 0 && currentClub && clubs.length > 1 && (
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-1">
                {currentClub.type === 'sparks' ? '스팍스' : currentClub.type === 'tnt' ? 'T&T' : currentClub.name}
              </p>
            )}
            {sameClubOtherRooms.map(roomData => {
              const isOpen = openSectionIds.has(roomData.id);
              // 해당 학급의 담임 교사 찾기
              const roomTeacherInfos = allAssignments
                .filter(a => a.room_id === roomData.id)
                .map(a => {
                  const t = allTeachers.find(tc => tc.id === a.teacher_id);
                  return t ? { teacher: t, assignmentType: a.assignment_type } : null;
                })
                .filter((x): x is { teacher: Teacher; assignmentType: string } => !!x);
              return (
                <div key={roomData.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => toggleSection(roomData.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: roomData.team?.color }} />
                      <span className="text-sm font-medium text-gray-900">{roomData.name}</span>
                      <span className="text-xs text-gray-400">({roomData.members.length}명)</span>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3">
                      {roomTeacherInfos.length > 0 && (
                        <div className="grid grid-cols-4 gap-2 mb-3">
                          {roomTeacherInfos.map(({ teacher: t, assignmentType }) => (
                            <TeacherFaceTile key={t.id} teacher={t} subtitle={assignmentType === 'primary' ? '담임' : '임시 담임(지원)'} />
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-3">
                        {roomData.members.map(member => (
                          <FaceTile key={member.id} member={member} teamColor={roomData.team?.color} onTap={() => openMemberProfile(member.id)} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {/* 학급 미배정 멤버 */}
            {sameClubNoRoomMembers.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleSection('no-room-same')}
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gray-300" />
                    <span className="text-sm font-medium text-gray-900">학급 미배정</span>
                    <span className="text-xs text-gray-400">({sameClubNoRoomMembers.length}명)</span>
                  </div>
                  {openSectionIds.has('no-room-same') ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </button>
                {openSectionIds.has('no-room-same') && (
                  <div className="px-3 pb-3">
                    <div className="grid grid-cols-3 gap-3">
                      {sameClubNoRoomMembers.map(member => {
                        const team = teams.find(t => t.id === member.team_id);
                        return (
                          <FaceTile key={member.id} member={member} teamColor={team?.color} onTap={() => openMemberProfile(member.id)} />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 다른 클럽 */}
            {otherClubData.map(({ club, teams: clubTeams }) => {
              const allClubMembers = clubTeams.flatMap(t => t.members);
              const clubRoomsList = allRooms.filter(r => r.club_id === club.id);
              const hasRooms = clubRoomsList.length > 0;

              // 학급이 있는 클럽: 학급 기준 그룹핑
              // 멤버의 room_id가 직접 설정된 경우 우선, 없으면 team_id → room.team_id로 간접 매핑
              const clubRooms = hasRooms
                ? clubRoomsList
                    .map(r => {
                      const team = clubTeams.find(t => t.id === r.team_id);
                      return {
                        ...r,
                        team,
                        members: allClubMembers.filter(m =>
                          m.room_id === r.id || (!m.room_id && m.team_id === r.team_id)
                        ),
                      };
                    })
                    .filter(r => r.members.length > 0)
                : [];
              // 어떤 학급에도 매핑되지 않은 멤버만 미배정 처리
              const matchedMemberIds = new Set(clubRooms.flatMap(r => r.members.map(m => m.id)));
              const noRoomMembers = hasRooms ? allClubMembers.filter(m => !matchedMemberIds.has(m.id)) : [];

              return (
                <div key={club.id}>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider px-1 mt-3 mb-1">
                    {club.type === 'sparks' ? '스팍스' : club.type === 'tnt' ? 'T&T' : club.name}
                  </p>
                  {/* 학급이 없는 클럽 (스팍스 등): 팀 기준 그룹핑 */}
                  {!hasRooms && clubTeams.map(team => {
                    const isOpen = openSectionIds.has(team.id);
                    const tTeachers = teamTeacherMap.get(team.id) || [];
                    return (
                      <div key={team.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-2">
                        <button
                          onClick={() => toggleSection(team.id)}
                          className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                            <span className="text-sm font-medium text-gray-900">{team.name} 팀</span>
                            <span className="text-xs text-gray-400">({team.members.length}명)</span>
                          </div>
                          {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        </button>
                        {isOpen && (
                          <div className="px-3 pb-3">
                            {tTeachers.length > 0 && (
                              <div className="grid grid-cols-4 gap-2 mb-3">
                                {tTeachers.map(t => (
                                  <TeacherFaceTile key={t.id} teacher={t} subtitle={t.position || '교사'} />
                                ))}
                              </div>
                            )}
                            <div className="grid grid-cols-3 gap-3">
                              {team.members.map(member => (
                                <FaceTile key={member.id} member={member} teamColor={team.color} onTap={() => openMemberProfile(member.id)} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* 학급이 있는 클럽 (T&T 등): 학급 기준 그룹핑 */}
                  {hasRooms && clubRooms.map(roomData => {
                    const isOpen = openSectionIds.has(roomData.id);
                    const roomTeacherInfos2 = allAssignments
                      .filter(a => a.room_id === roomData.id)
                      .map(a => {
                        const t = allTeachers.find(tc => tc.id === a.teacher_id);
                        return t ? { teacher: t, assignmentType: a.assignment_type } : null;
                      })
                      .filter((x): x is { teacher: Teacher; assignmentType: string } => !!x);
                    return (
                      <div key={roomData.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-2">
                        <button
                          onClick={() => toggleSection(roomData.id)}
                          className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: roomData.team?.color }} />
                            <span className="text-sm font-medium text-gray-900">{roomData.name}</span>
                            <span className="text-xs text-gray-400">({roomData.members.length}명)</span>
                          </div>
                          {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        </button>
                        {isOpen && (
                          <div className="px-3 pb-3">
                            {roomTeacherInfos2.length > 0 && (
                              <div className="grid grid-cols-4 gap-2 mb-3">
                                {roomTeacherInfos2.map(({ teacher: t, assignmentType }) => (
                                  <TeacherFaceTile key={t.id} teacher={t} subtitle={assignmentType === 'primary' ? '담임' : '임시 담임(지원)'} />
                                ))}
                              </div>
                            )}
                            <div className="grid grid-cols-3 gap-3">
                              {roomData.members.map(member => (
                                <FaceTile key={member.id} member={member} teamColor={roomData.team?.color} onTap={() => openMemberProfile(member.id)} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {noRoomMembers.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-2">
                      <button
                        onClick={() => toggleSection(`no-room-${club.id}`)}
                        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-gray-300" />
                          <span className="text-sm font-medium text-gray-900">학급 미배정</span>
                          <span className="text-xs text-gray-400">({noRoomMembers.length}명)</span>
                        </div>
                        {openSectionIds.has(`no-room-${club.id}`) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      </button>
                      {openSectionIds.has(`no-room-${club.id}`) && (
                        <div className="px-3 pb-3">
                          <div className="grid grid-cols-3 gap-3">
                            {noRoomMembers.map(member => {
                              const team = clubTeams.find(t => t.id === member.team_id);
                              return (
                                <FaceTile key={member.id} member={member} teamColor={team?.color} onTap={() => openMemberProfile(member.id)} />
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 우리 선생님들 */}
      {hasTeacherSection && (
        <div className="mt-6">
          <h2 className="font-semibold text-gray-900 mb-3">
            우리 선생님들
          </h2>
          <div className="space-y-4">
            {teachersByCategory.map(cat => (
              <div key={cat.key}>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 px-1">
                  {cat.label}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {cat.teachers.map(t => (
                    <TeacherFaceTile key={t.id} teacher={t} subtitle={t.position || undefined} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
