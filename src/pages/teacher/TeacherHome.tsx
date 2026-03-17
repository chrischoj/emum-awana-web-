import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';
import { useTeacherAssignment } from '../../hooks/useTeacherAssignment';
import { getSubmissionsByDate, getWeeklyScores } from '../../services/scoringService';
import { getToday } from '../../lib/utils';
import type { SubmissionStatus } from '../../types/awana';

interface TeamSubmissionInfo {
  teamId: string;
  teamName: string;
  teamColor: string;
  status: SubmissionStatus | null;
  hasScores: boolean;
}

export default function TeacherHome() {
  const { teacher } = useAuth();
  const { currentClub, teams } = useClub();
  const {
    assignedTeamIds,
    assignedMembers,
    isUnassigned,
    primaryAssignments,
    temporaryAssignments,
    loading: assignmentLoading,
  } = useTeacherAssignment();

  const [teamSubmissions, setTeamSubmissions] = useState<TeamSubmissionInfo[]>([]);

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
              {primaryAssignments.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-white"
                  style={{ backgroundColor: a.team_color }}
                >
                  <span className="w-2 h-2 rounded-full bg-white/50" />
                  {a.team_name} 팀 담임
                </span>
              ))}
              {temporaryAssignments.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border-2"
                  style={{ borderColor: a.team_color, color: a.team_color }}
                >
                  {a.team_name} 팀 지원
                  {a.end_date && <span className="text-xs opacity-70">(~{a.end_date})</span>}
                </span>
              ))}
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
    </div>
  );
}
