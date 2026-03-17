import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useClub } from '../../contexts/ClubContext';
import { getWeeklyScores } from '../../services/scoringService';
import { getTeamGameTotals } from '../../services/gameScoreService';
import { getToday } from '../../lib/utils';
import type { WeeklyScore, ScoringCategory, Team, Member } from '../../types/awana';

type SubmissionStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

interface WeeklyScoreSubmission {
  id: string;
  club_id: string;
  team_id: string;
  training_date: string;
  status: SubmissionStatus;
  submitted_by: string | null;
  approved_by: string | null;
  rejection_note: string | null;
  created_at: string;
  updated_at: string;
}

interface TeamScoreData {
  teamId: string;
  teamName: string;
  teamColor: string;
  handbookTotal: number;
  gameTotal: number;
  grandTotal: number;
  submission: WeeklyScoreSubmission | null;
  memberScores: MemberScoreRow[];
}

interface MemberScoreRow {
  memberId: string;
  memberName: string;
  clubName?: string;
  scores: Partial<Record<ScoringCategory, number>>;
  total: number;
}

const CATEGORY_LABELS: Record<ScoringCategory, string> = {
  attendance: '출석',
  handbook: '핸드북',
  uniform: '단복',
  recitation: '암송',
};

const CATEGORIES: ScoringCategory[] = ['attendance', 'handbook', 'uniform', 'recitation'];

const STATUS_CONFIG: Record<SubmissionStatus, { label: string; className: string }> = {
  draft:     { label: '작성중',  className: 'bg-gray-100 text-gray-600' },
  submitted: { label: '제출됨',  className: 'bg-blue-100 text-blue-700' },
  approved:  { label: '승인됨',  className: 'bg-green-100 text-green-700' },
  rejected:  { label: '반려됨',  className: 'bg-red-100 text-red-700' },
};

async function getSubmissions(clubId: string, trainingDate: string): Promise<WeeklyScoreSubmission[]> {
  const { data, error } = await supabase
    .from('weekly_score_submissions')
    .select('*')
    .eq('club_id', clubId)
    .eq('training_date', trainingDate);
  if (error) throw error;
  return (data as WeeklyScoreSubmission[]) || [];
}

async function updateSubmissionStatus(
  clubId: string,
  teamId: string,
  trainingDate: string,
  status: SubmissionStatus,
  rejectionNote?: string
): Promise<void> {
  const { error } = await supabase
    .from('weekly_score_submissions')
    .update({ status, rejection_note: rejectionNote ?? null, updated_at: new Date().toISOString() })
    .eq('club_id', clubId)
    .eq('team_id', teamId)
    .eq('training_date', trainingDate);
  if (error) throw error;
}

export default function ScoringOverview() {
  const { clubs, currentClub, setCurrentClub, teams, members } = useClub();
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [viewMode, setViewMode] = useState<'all' | string>('all');
  const [teamScores, setTeamScores] = useState<TeamScoreData[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [rejectionNotes, setRejectionNotes] = useState<Record<string, string>>({});
  const [rejectingTeam, setRejectingTeam] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // When viewMode changes to a specific club, update context
  useEffect(() => {
    if (viewMode !== 'all') {
      const club = clubs.find((c) => c.id === viewMode);
      if (club) setCurrentClub(club);
    }
  }, [viewMode, clubs]);

  // Load data based on viewMode
  useEffect(() => {
    if (viewMode === 'all') {
      if (clubs.length > 0) loadAllData();
    } else if (currentClub && currentClub.id === viewMode) {
      loadData();
    }
  }, [viewMode, currentClub, selectedDate, members, clubs]);

  async function loadData() {
    if (!currentClub) return;
    setLoading(true);
    try {
      const [weeklyScores, gameTotals, submissions] = await Promise.all([
        getWeeklyScores(currentClub.id, selectedDate),
        getTeamGameTotals(currentClub.id, selectedDate),
        getSubmissions(currentClub.id, selectedDate),
      ]);

      // member_id -> team_id 맵
      const memberTeamMap = new Map<string, string>();
      for (const m of members) {
        if (m.team_id) memberTeamMap.set(m.id, m.team_id);
      }

      // member_id -> name 맵
      const memberNameMap = new Map<string, string>();
      for (const m of members) {
        memberNameMap.set(m.id, m.name);
      }

      // submission 맵
      const submissionMap = new Map<string, WeeklyScoreSubmission>();
      for (const s of submissions) {
        submissionMap.set(s.team_id, s);
      }

      // 팀별 핸드북 점수 집계
      const teamHandbookMap = new Map<string, number>();
      // 멤버별 카테고리 점수 집계
      const memberScoreMap = new Map<string, Partial<Record<ScoringCategory, number>>>();

      for (const score of weeklyScores as WeeklyScore[]) {
        const teamId = memberTeamMap.get(score.member_id);
        if (teamId) {
          teamHandbookMap.set(teamId, (teamHandbookMap.get(teamId) || 0) + score.total_points);
        }
        if (!memberScoreMap.has(score.member_id)) {
          memberScoreMap.set(score.member_id, {});
        }
        memberScoreMap.get(score.member_id)![score.category] = score.total_points;
      }

      // 팀별 데이터 빌드
      const result: TeamScoreData[] = teams.map((team) => {
        const teamMembers = members.filter((m) => m.team_id === team.id);

        const memberRows: MemberScoreRow[] = teamMembers.map((m) => {
          const scores = memberScoreMap.get(m.id) || {};
          const total = Object.values(scores).reduce((a, b) => a + (b || 0), 0);
          return {
            memberId: m.id,
            memberName: m.name,
            scores,
            total,
          };
        });

        const handbookTotal = teamHandbookMap.get(team.id) || 0;
        const gameTotal = gameTotals[team.id] || 0;

        return {
          teamId: team.id,
          teamName: team.name,
          teamColor: team.color,
          handbookTotal,
          gameTotal,
          grandTotal: handbookTotal + gameTotal,
          submission: submissionMap.get(team.id) || null,
          memberScores: memberRows,
        };
      });

      setTeamScores(result);
    } catch {
      toast.error('데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }

  async function loadAllData() {
    if (clubs.length === 0) return;
    setLoading(true);
    try {
      const [teamsRes, membersRes, scoresRes, gameRes] = await Promise.all([
        supabase.from('teams').select('*').order('name'),
        supabase.from('members').select('*').eq('active', true).eq('enrollment_status', 'active').order('name'),
        supabase.from('weekly_scores').select('*').eq('training_date', selectedDate),
        supabase.from('game_score_entries').select('*').eq('training_date', selectedDate),
      ]);

      const allTeams = (teamsRes.data as Team[]) || [];
      const allMembers = (membersRes.data as Member[]) || [];
      const allScores = (scoresRes.data as WeeklyScore[]) || [];
      const allGameEntries = (gameRes.data as { team_id: string; points: number }[]) || [];

      const memberTeamMap = new Map<string, string>();
      for (const m of allMembers) {
        if (m.team_id) memberTeamMap.set(m.id, m.team_id);
      }

      // Group teams by color name
      const colorGroups = new Map<string, { color: string; teamIds: string[] }>();
      for (const team of allTeams) {
        const existing = colorGroups.get(team.name);
        if (existing) {
          existing.teamIds.push(team.id);
        } else {
          colorGroups.set(team.name, { color: team.color, teamIds: [team.id] });
        }
      }

      // Handbook scores per team
      const teamHandbookMap = new Map<string, number>();
      const memberScoreMap = new Map<string, Partial<Record<ScoringCategory, number>>>();
      for (const score of allScores) {
        const teamId = memberTeamMap.get(score.member_id);
        if (teamId) {
          teamHandbookMap.set(teamId, (teamHandbookMap.get(teamId) || 0) + score.total_points);
        }
        if (!memberScoreMap.has(score.member_id)) {
          memberScoreMap.set(score.member_id, {});
        }
        memberScoreMap.get(score.member_id)![score.category] = score.total_points;
      }

      // Game totals per team
      const teamGameMap = new Map<string, number>();
      for (const entry of allGameEntries) {
        teamGameMap.set(entry.team_id, (teamGameMap.get(entry.team_id) || 0) + entry.points);
      }

      // Build color-aggregated TeamScoreData
      const clubNameMap = new Map(clubs.map((c) => [c.id, c.name]));
      const result: TeamScoreData[] = [];
      for (const [colorName, { color, teamIds }] of colorGroups) {
        const colorMembers = allMembers.filter((m) => m.team_id && teamIds.includes(m.team_id));

        const memberRows: MemberScoreRow[] = colorMembers.map((m) => {
          const scores = memberScoreMap.get(m.id) || {};
          const total = Object.values(scores).reduce((a, b) => a + (b || 0), 0);
          return {
            memberId: m.id,
            memberName: m.name,
            clubName: m.club_id ? clubNameMap.get(m.club_id) : undefined,
            scores,
            total,
          };
        });

        const handbookTotal = teamIds.reduce((sum, tid) => sum + (teamHandbookMap.get(tid) || 0), 0);
        const gameTotal = teamIds.reduce((sum, tid) => sum + (teamGameMap.get(tid) || 0), 0);

        result.push({
          teamId: colorName,
          teamName: colorName,
          teamColor: color,
          handbookTotal,
          gameTotal,
          grandTotal: handbookTotal + gameTotal,
          submission: null,
          memberScores: memberRows,
        });
      }

      setTeamScores(result);
    } catch {
      toast.error('데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(teamId: string) {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  async function handleApprove(teamScore: TeamScoreData) {
    if (!currentClub) return;
    setActionLoading(teamScore.teamId);
    try {
      await updateSubmissionStatus(currentClub.id, teamScore.teamId, selectedDate, 'approved');
      toast.success(`${teamScore.teamName} 팀 승인됨`);
      await loadData();
    } catch {
      toast.error('승인 처리 실패');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(teamScore: TeamScoreData) {
    if (!currentClub) return;
    setActionLoading(teamScore.teamId);
    try {
      const note = rejectionNotes[teamScore.teamId] || '';
      await updateSubmissionStatus(currentClub.id, teamScore.teamId, selectedDate, 'rejected', note);
      toast.success(`${teamScore.teamName} 팀 반려됨`);
      setRejectingTeam(null);
      setRejectionNotes((prev) => { const n = { ...prev }; delete n[teamScore.teamId]; return n; });
      await loadData();
    } catch {
      toast.error('반려 처리 실패');
    } finally {
      setActionLoading(null);
    }
  }

  const submittedCount = teamScores.filter((t) => t.submission?.status === 'submitted').length;

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">점수 총괄</h1>
          {submittedCount > 0 && (
            <p className="text-sm text-blue-600 mt-0.5">{submittedCount}개 팀이 승인 대기 중입니다</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            모두(총합)
          </button>
          {clubs.map((club) => (
            <button
              key={club.id}
              onClick={() => setViewMode(club.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                viewMode === club.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {club.name}
            </button>
          ))}
        </div>
      </div>

      {/* 날짜 선택 */}
      <div className="mb-5">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : (
        <>
          {/* 팀별 점수 카드 */}
          <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
            {teamScores.map((t) => {
              const status = t.submission?.status ?? 'draft';
              const statusCfg = STATUS_CONFIG[status];
              return (
                <div
                  key={t.teamId}
                  className="bg-white rounded-xl border border-gray-200 p-5"
                  style={{ borderTopColor: t.teamColor, borderTopWidth: 3 }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-bold text-sm" style={{ color: t.teamColor }}>{t.teamName}</p>
                    {viewMode !== 'all' && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.className}`}>
                        {statusCfg.label}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 text-sm text-gray-600 mb-3">
                    <div className="flex justify-between">
                      <span>핸드북</span>
                      <span className="font-medium text-gray-800">{t.handbookTotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>게임</span>
                      <span className="font-medium text-gray-800">{t.gameTotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between pt-1.5 border-t border-gray-100">
                      <span className="font-semibold text-gray-700">총합</span>
                      <span className="font-bold text-lg" style={{ color: t.teamColor }}>
                        {t.grandTotal.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* 승인/반려 버튼 (submitted 상태일 때만) */}
                  {status === 'submitted' && (
                    <div className="space-y-2 mt-3 pt-3 border-t border-gray-100">
                      {rejectingTeam === t.teamId ? (
                        <>
                          <textarea
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
                            rows={2}
                            placeholder="반려 사유 입력..."
                            value={rejectionNotes[t.teamId] || ''}
                            onChange={(e) =>
                              setRejectionNotes((prev) => ({ ...prev, [t.teamId]: e.target.value }))
                            }
                          />
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => handleReject(t)}
                              disabled={actionLoading === t.teamId}
                              className="flex-1 py-1 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                            >
                              {actionLoading === t.teamId ? '처리중...' : '반려 확인'}
                            </button>
                            <button
                              onClick={() => setRejectingTeam(null)}
                              className="flex-1 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200"
                            >
                              취소
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleApprove(t)}
                            disabled={actionLoading === t.teamId}
                            className="flex-1 py-1 rounded-lg text-xs font-medium bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
                          >
                            {actionLoading === t.teamId ? '처리중...' : '승인'}
                          </button>
                          <button
                            onClick={() => setRejectingTeam(t.teamId)}
                            className="flex-1 py-1 rounded-lg text-xs font-medium bg-red-100 text-red-600 hover:bg-red-200"
                          >
                            반려
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 반려된 경우 메모 표시 */}
                  {status === 'rejected' && t.submission?.rejection_note && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-xs text-red-500">반려 사유: {t.submission.rejection_note}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 멤버별 상세 테이블 */}
          <div className="space-y-3">
            {teamScores.map((t) => {
              const isExpanded = expandedTeams.has(t.teamId);
              return (
                <div key={t.teamId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => toggleExpand(t.teamId)}
                    className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: t.teamColor }}
                      />
                      <span className="font-semibold text-gray-800">{t.teamName}</span>
                      <span className="text-sm text-gray-500">
                        ({t.memberScores.length}명)
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold" style={{ color: t.teamColor }}>
                        총 {t.grandTotal.toLocaleString()}점
                      </span>
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100">
                      {t.memberScores.length === 0 ? (
                        <p className="text-center text-sm text-gray-400 py-6">멤버가 없습니다</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-500">이름</th>
                              {CATEGORIES.map((cat) => (
                                <th key={cat} className="px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                                  {CATEGORY_LABELS[cat]}
                                </th>
                              ))}
                              <th className="px-5 py-2.5 text-right text-xs font-medium text-gray-500">소계</th>
                            </tr>
                          </thead>
                          <tbody>
                            {t.memberScores.map((row, idx) => (
                              <tr
                                key={row.memberId}
                                className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                              >
                                <td className="px-5 py-2.5 font-medium text-gray-800">
                                  {row.memberName}
                                  {row.clubName && <span className="ml-1 text-xs text-gray-400">({row.clubName})</span>}
                                </td>
                                {CATEGORIES.map((cat) => (
                                  <td key={cat} className="px-3 py-2.5 text-center text-gray-600">
                                    {row.scores[cat] !== undefined ? row.scores[cat]!.toLocaleString() : (
                                      <span className="text-gray-300">-</span>
                                    )}
                                  </td>
                                ))}
                                <td className="px-5 py-2.5 text-right font-bold text-gray-800">
                                  {row.total.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-gray-200 bg-gray-50">
                              <td className="px-5 py-2.5 font-semibold text-gray-700">팀 소계</td>
                              {CATEGORIES.map((cat) => {
                                const catTotal = t.memberScores.reduce(
                                  (sum, row) => sum + (row.scores[cat] || 0),
                                  0
                                );
                                return (
                                  <td key={cat} className="px-3 py-2.5 text-center font-semibold text-gray-700">
                                    {catTotal > 0 ? catTotal.toLocaleString() : <span className="text-gray-300">-</span>}
                                  </td>
                                );
                              })}
                              <td className="px-5 py-2.5 text-right font-bold" style={{ color: t.teamColor }}>
                                {t.handbookTotal.toLocaleString()}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
