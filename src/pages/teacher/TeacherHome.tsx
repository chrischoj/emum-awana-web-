import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';
import { useMemberProfile } from '../../contexts/MemberProfileContext';
import { useTeacherAssignment } from '../../hooks/useTeacherAssignment';
import { getSubmissionsByDate, getWeeklyScores } from '../../services/scoringService';
import { getToday } from '../../lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SubmissionStatus, Member } from '../../types/awana';

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
    primaryAssignments,
    temporaryAssignments,
    loading: assignmentLoading,
  } = useTeacherAssignment();

  const [teamSubmissions, setTeamSubmissions] = useState<TeamSubmissionInfo[]>([]);
  const [openTeamIds, setOpenTeamIds] = useState<Set<string>>(new Set());

  // 다른 반 아이들: 전체 멤버에서 내 팀 멤버 제외
  const assignedMemberIds = new Set(assignedMembers.map(m => m.id));
  const otherMembers = isUnassigned ? [] : allMembers.filter(m => !assignedMemberIds.has(m.id));
  const otherTeams = teams
    .filter(t => !assignedTeamIds.includes(t.id))
    .map(t => ({
      ...t,
      members: otherMembers.filter(m => m.team_id === t.id),
    }))
    .filter(t => t.members.length > 0);

  const toggleTeam = (teamId: string) => {
    setOpenTeamIds(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
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

      {/* 담당 팀 정보 */}
      {!assignmentLoading && (
        <div className="mb-6">
          {isUnassigned ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700 font-medium">미배정 상태 (열람 전용)</p>
              <p className="text-xs text-amber-600 mt-0.5">관리자에게 반 배정을 요청하세요</p>
            </div>
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
                    {a.team_name} 팀 담임
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
                    {a.team_name} 팀 지원
                    {a.end_date && <span className="text-xs opacity-70">(~{a.end_date})</span>}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">{isUnassigned ? '전체 클럽원' : '내 팀원'}</p>
          <p className="text-2xl font-bold text-gray-900">{assignedMembers.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">담당 팀</p>
          <p className="text-2xl font-bold text-gray-900">{assignedTeamIds.length}</p>
        </div>
      </div>

      {/* 오늘의 할 일 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">오늘의 할 일</h2>
        <div className="space-y-2">
          {!isUnassigned && teamSubmissions.length > 0 ? (
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
                <span className="text-blue-600 font-medium text-sm">점수 입력</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 내 반 아이들 */}
      {assignedMembers.length > 0 && (
        <div className="mt-6">
          <h2 className="font-semibold text-gray-900 mb-3">
            {isUnassigned ? '전체 아이들' : '내 반 아이들'}{' '}
            <span className="text-sm font-normal text-gray-400">({assignedMembers.length}명)</span>
          </h2>
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
        </div>
      )}

      {/* 다른 반 아이들 */}
      {otherTeams.length > 0 && (
        <div className="mt-6">
          <h2 className="font-semibold text-gray-900 mb-3">
            다른 반 아이들
          </h2>
          <div className="space-y-2">
            {otherTeams.map(team => {
              const isOpen = openTeamIds.has(team.id);
              return (
                <div key={team.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => toggleTeam(team.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                      <span className="text-sm font-medium text-gray-900">{team.name} 팀</span>
                      <span className="text-xs text-gray-400">({team.members.length}명)</span>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3">
                      <div className="grid grid-cols-3 gap-3">
                        {team.members.map(member => (
                          <FaceTile
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
          </div>
        </div>
      )}
    </div>
  );
}
