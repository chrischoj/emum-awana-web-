import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useClub } from '../../contexts/ClubContext';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import { Avatar } from '../../components/ui/Avatar';
import type { Club, Member, Team } from '../../types/awana';

// ---- 유틸 ----

function formatBirthday(birthday: string | null): string {
  if (!birthday) return '';
  const d = new Date(birthday);
  if (isNaN(d.getTime())) return birthday;
  return `${d.getFullYear().toString().slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// ---- 미배정 멤버 행 ----

interface UnassignedRowProps {
  member: Member;
  teams: Team[];
  onAssigned: () => void;
}

function UnassignedRow({ member, teams, onAssigned }: UnassignedRowProps) {
  const [loading, setLoading] = useState(false);

  async function assignToTeam(teamId: string) {
    setLoading(true);
    const { error } = await supabase
      .from('members')
      .update({ team_id: teamId })
      .eq('id', member.id);

    if (error) {
      toast.error('배정 실패: ' + error.message);
    } else {
      const team = teams.find((t) => t.id === teamId);
      toast.success(`${member.name}을(를) ${team?.name ?? ''} 팀에 배정했습니다.`);
      onAssigned();
    }
    setLoading(false);
  }

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
      <div className="flex items-center gap-3">
        <Avatar name={member.name} src={member.avatar_url} size="sm" />
        <div>
          <p className="text-sm font-medium text-gray-900">{member.name}</p>
          {member.birthday && (
            <p className="text-xs text-gray-400">{formatBirthday(member.birthday)}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {loading ? (
          <div className="w-5 h-5 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
        ) : (
          teams.map((team) => (
            <button
              key={team.id}
              onClick={() => assignToTeam(team.id)}
              title={`${team.name} 팀으로 배정`}
              className="w-7 h-7 rounded-full border-2 border-white shadow hover:scale-110 transition-transform"
              style={{ backgroundColor: team.color }}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---- 팀 멤버 행 ----

interface TeamMemberRowProps {
  member: Member;
  currentTeamId: string;
  teams: Team[];
  onChanged: () => void;
}

function TeamMemberRow({ member, currentTeamId, teams, onChanged }: TeamMemberRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const otherTeams = teams.filter((t) => t.id !== currentTeamId);

  async function moveToTeam(teamId: string | null) {
    setMenuOpen(false);
    setLoading(true);
    const { error } = await supabase
      .from('members')
      .update({ team_id: teamId })
      .eq('id', member.id);

    if (error) {
      toast.error('이동 실패: ' + error.message);
    } else {
      if (teamId === null) {
        toast.success(`${member.name}을(를) 미배정으로 변경했습니다.`);
      } else {
        const team = teams.find((t) => t.id === teamId);
        toast.success(`${member.name}을(를) ${team?.name ?? ''} 팀으로 이동했습니다.`);
      }
      onChanged();
    }
    setLoading(false);
  }

  return (
    <div className="flex items-center justify-between py-2 px-1 rounded-lg hover:bg-gray-50 group relative">
      <div className="flex items-center gap-2">
        <Avatar name={member.name} src={member.avatar_url} size="sm" />
        <div>
          <p className="text-sm font-medium text-gray-900">{member.name}</p>
          {member.birthday && (
            <p className="text-xs text-gray-400">{formatBirthday(member.birthday)}</p>
          )}
        </div>
      </div>

      <div className="relative">
        {loading ? (
          <div className="w-4 h-4 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
        ) : (
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </button>
        )}

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-7 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
              {otherTeams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => moveToTeam(team.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: team.color }}
                  />
                  {team.name} 팀으로 이동
                </button>
              ))}
              <div className="border-t border-gray-100 mt-1 pt-1">
                <button
                  onClick={() => moveToTeam(null)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  팀에서 제거
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- 팀 카드 ----

interface TeamCardProps {
  team: Team;
  teamMembers: Member[];
  allTeams: Team[];
  clubName?: string;
  showClubLabel?: boolean;
  onChanged: () => void;
}

function TeamCard({ team, teamMembers, allTeams, clubName, showClubLabel, onChanged }: TeamCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col">
      {/* 헤더 */}
      <div
        className="rounded-t-xl px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: team.color + '20' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: team.color }} />
          <h3 className="font-bold text-gray-900">{team.name}</h3>
          {showClubLabel && clubName && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
              {clubName}
            </span>
          )}
        </div>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: team.color }}
        >
          {teamMembers.length}명
        </span>
      </div>

      {/* 멤버 목록 */}
      <div className="flex-1 px-3 py-2 space-y-0.5 min-h-[80px]">
        {teamMembers.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">멤버 없음</p>
        ) : (
          teamMembers.map((member) => (
            <TeamMemberRow
              key={member.id}
              member={member}
              currentTeamId={team.id}
              teams={allTeams}
              onChanged={onChanged}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---- 클럽 섹션 (모두보기 시 사용) ----

interface ClubSectionProps {
  club: Club;
  clubTeams: Team[];
  clubMembers: Member[];
  allTeams: Team[];
  onChanged: () => void;
}

function ClubSection({ club, clubTeams, clubMembers, allTeams, onChanged }: ClubSectionProps) {
  const unassigned = clubMembers.filter((m) => !m.team_id);

  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
        {club.name}
        <span className="text-sm font-normal text-gray-400">{clubMembers.length}명</span>
      </h2>

      {/* 미배정 멤버 */}
      {unassigned.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-dashed border-amber-300 p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <svg
              className="w-4 h-4 text-amber-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-sm font-semibold text-amber-700">
              미배정 멤버 ({unassigned.length}명)
            </h3>
            <span className="text-xs text-amber-500 ml-auto">팀 색상을 눌러 배정하세요</span>
          </div>
          <div className="space-y-1">
            {unassigned.map((member) => (
              <UnassignedRow
                key={member.id}
                member={member}
                teams={clubTeams}
                onAssigned={onChanged}
              />
            ))}
          </div>
        </div>
      )}

      {/* 팀 없을 때 */}
      {clubTeams.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">등록된 팀이 없습니다.</p>
        </div>
      )}

      {/* 팀 카드 그리드 */}
      {clubTeams.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {clubTeams.map((team) => {
            const teamMembers = clubMembers.filter((m) => m.team_id === team.id);
            return (
              <TeamCard
                key={team.id}
                team={team}
                teamMembers={teamMembers}
                allTeams={allTeams}
                onChanged={onChanged}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---- 메인 페이지 ----

export default function TeamManagement() {
  const { clubs } = useClub();
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [filterClubId, setFilterClubId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [teamsRes, membersRes] = await Promise.all([
      supabase.from('teams').select('*').order('name'),
      supabase.from('members').select('*').eq('active', true).eq('enrollment_status', 'active').order('name'),
    ]);
    setAllTeams((teamsRes.data as Team[]) || []);
    setAllMembers((membersRes.data as Member[]) || []);
    setLoading(false);
  }

  // 필터 적용
  const filteredTeams = filterClubId
    ? allTeams.filter((t) => t.club_id === filterClubId)
    : allTeams;
  const filteredMembers = filterClubId
    ? allMembers.filter((m) => m.club_id === filterClubId)
    : allMembers;
  const unassignedMembers = filteredMembers.filter((m) => !m.team_id);
  const assignedCount = filteredMembers.length - unassignedMembers.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">팀 관리</h1>

        {/* 클럽 필터 탭 */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilterClubId(null)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              !filterClubId
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            모두
          </button>
          {clubs.map((club) => (
            <button
              key={club.id}
              onClick={() => setFilterClubId(club.id)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                filterClubId === club.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              {club.name}
            </button>
          ))}
        </div>
      </div>

      {/* 통계 바 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">총 멤버</p>
          <p className="text-2xl font-bold text-gray-900">{filteredMembers.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">배정 완료</p>
          <p className="text-2xl font-bold text-green-600">{assignedCount}</p>
        </div>
        <div
          className={cn(
            'rounded-xl border p-4',
            unassignedMembers.length > 0
              ? 'bg-amber-50 border-amber-200'
              : 'bg-white border-gray-200'
          )}
        >
          <p className="text-xs text-gray-500 mb-1">미배정</p>
          <p
            className={cn(
              'text-2xl font-bold',
              unassignedMembers.length > 0 ? 'text-amber-600' : 'text-gray-900'
            )}
          >
            {unassignedMembers.length}
          </p>
        </div>
      </div>

      {/* 모두보기: 클럽별 섹션 */}
      {!filterClubId && (
        <>
          {clubs.map((club) => {
            const clubTeams = allTeams.filter((t) => t.club_id === club.id);
            const clubMembers = allMembers.filter((m) => m.club_id === club.id);
            return (
              <ClubSection
                key={club.id}
                club={club}
                clubTeams={clubTeams}
                clubMembers={clubMembers}
                allTeams={clubTeams}
                onChanged={loadData}
              />
            );
          })}
          {clubs.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-sm">등록된 클럽이 없습니다.</p>
            </div>
          )}
        </>
      )}

      {/* 단일 클럽 뷰 */}
      {filterClubId && (
        <>
          {/* 미배정 멤버 영역 */}
          {unassignedMembers.length > 0 && (
            <div className="bg-white rounded-xl border-2 border-dashed border-amber-300 p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <svg
                  className="w-4 h-4 text-amber-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <h2 className="text-sm font-semibold text-amber-700">
                  미배정 멤버 ({unassignedMembers.length}명)
                </h2>
                <span className="text-xs text-amber-500 ml-auto">팀 색상을 눌러 배정하세요</span>
              </div>

              <div className="space-y-1">
                {unassignedMembers.map((member) => (
                  <UnassignedRow
                    key={member.id}
                    member={member}
                    teams={filteredTeams}
                    onAssigned={loadData}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 팀 없을 때 */}
          {filteredTeams.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-sm">등록된 팀이 없습니다.</p>
            </div>
          )}

          {/* 팀 카드 그리드 */}
          {filteredTeams.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredTeams.map((team) => {
                const teamMembers = filteredMembers.filter((m) => m.team_id === team.id);
                return (
                  <TeamCard
                    key={team.id}
                    team={team}
                    teamMembers={teamMembers}
                    allTeams={filteredTeams}
                    onChanged={loadData}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
