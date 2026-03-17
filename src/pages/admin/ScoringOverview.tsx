import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useClub } from '../../contexts/ClubContext';
import { useAuth } from '../../contexts/AuthContext';
import { getWeeklyScores, getSubmissionsByDate, approveSubmission, rejectSubmission, editScoreWithHistory, getScoreEditHistory } from '../../services/scoringService';
import { getTeamGameTotals } from '../../services/gameScoreService';
import { getToday, cn } from '../../lib/utils';
import { Avatar } from '../../components/ui/Avatar';
import { useMemberProfile } from '../../contexts/MemberProfileContext';
import type { WeeklyScore, ScoringCategory, Team, Member, SubmissionStatus, WeeklyScoreSubmission, ScoreEditHistory } from '../../types/awana';

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
  avatarUrl: string | null;
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

export default function ScoringOverview() {
  const { clubs, currentClub, setCurrentClub, teams, members } = useClub();
  const { teacher: adminTeacher } = useAuth();
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [viewMode, setViewMode] = useState<'all' | string>('all');
  const [teamScores, setTeamScores] = useState<TeamScoreData[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [rejectionNotes, setRejectionNotes] = useState<Record<string, string>>({});
  const [rejectingTeam, setRejectingTeam] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { openMemberProfile } = useMemberProfile();
  const [editingScore, setEditingScore] = useState<{
    memberId: string;
    memberName: string;
    teamId: string;
    scores: Partial<Record<ScoringCategory, { id: string; basePoints: number; multiplier: number; totalPoints: number }>>;
  } | null>(null);
  const [editValues, setEditValues] = useState<Record<ScoringCategory, { basePoints: number; multiplier: number }>>({
    attendance: { basePoints: 0, multiplier: 1 },
    handbook: { basePoints: 0, multiplier: 1 },
    uniform: { basePoints: 0, multiplier: 1 },
    recitation: { basePoints: 0, multiplier: 1 },
  });
  const [editReason, setEditReason] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [historyData, setHistoryData] = useState<ScoreEditHistory[]>([]);
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  // Realtime 구독
  useEffect(() => {
    const channel = supabase
      .channel(`admin-scoring-${selectedDate}-${viewMode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_scores' }, () => {
        if (viewMode === 'all') loadAllData(false);
        else loadData(false);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_score_submissions' }, () => {
        if (viewMode === 'all') loadAllData(false);
        else loadData(false);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedDate, viewMode, currentClub, members, clubs]);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (viewMode === 'all') await loadAllData(false);
    else await loadData(false);
    setRefreshing(false);
    toast.success('갱신됨');
  };

  async function loadData(showLoading = true) {
    if (!currentClub) return;
    if (showLoading) setLoading(true);
    try {
      const [weeklyScores, gameTotals, submissions] = await Promise.all([
        getWeeklyScores(currentClub.id, selectedDate),
        getTeamGameTotals(currentClub.id, selectedDate),
        getSubmissionsByDate(currentClub.id, selectedDate),
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
            avatarUrl: m.avatar_url,
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
      if (showLoading) setLoading(false);
    }
  }

  async function loadAllData(showLoading = true) {
    if (clubs.length === 0) return;
    if (showLoading) setLoading(true);
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
            avatarUrl: m.avatar_url,
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
      if (showLoading) setLoading(false);
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
    if (!currentClub || !adminTeacher) return;
    setActionLoading(teamScore.teamId);
    try {
      await approveSubmission({
        clubId: currentClub.id,
        teamId: teamScore.teamId,
        trainingDate: selectedDate,
        approvedBy: adminTeacher.id,
      });
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
      await rejectSubmission({
        clubId: currentClub.id,
        teamId: teamScore.teamId,
        trainingDate: selectedDate,
        rejectionNote: note,
      });
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

  async function handleOpenEdit(row: MemberScoreRow, teamId: string) {
    if (!currentClub) return;
    const scores = await getWeeklyScores(currentClub.id, selectedDate);
    const memberScores = scores.filter(s => s.member_id === row.memberId);

    const scoreMap: Partial<Record<ScoringCategory, { id: string; basePoints: number; multiplier: number; totalPoints: number }>> = {};
    for (const s of memberScores) {
      scoreMap[s.category] = { id: s.id, basePoints: s.base_points, multiplier: s.multiplier, totalPoints: s.total_points };
    }

    setEditingScore({ memberId: row.memberId, memberName: row.memberName, teamId, scores: scoreMap });
    setEditValues({
      attendance: { basePoints: scoreMap.attendance?.basePoints ?? 0, multiplier: scoreMap.attendance?.multiplier ?? 1 },
      handbook: { basePoints: scoreMap.handbook?.basePoints ?? 0, multiplier: scoreMap.handbook?.multiplier ?? 1 },
      uniform: { basePoints: scoreMap.uniform?.basePoints ?? 0, multiplier: scoreMap.uniform?.multiplier ?? 1 },
      recitation: { basePoints: scoreMap.recitation?.basePoints ?? 100, multiplier: scoreMap.recitation?.multiplier ?? 0 },
    });
    setEditReason('');
  }

  async function handleSaveEdit() {
    if (!editingScore || !adminTeacher || !editReason.trim()) {
      toast.error('수정 사유를 입력해주세요');
      return;
    }
    setEditSaving(true);
    try {
      for (const cat of CATEGORIES) {
        const existing = editingScore.scores[cat];
        if (!existing) continue;
        const newVals = editValues[cat];
        if (existing.basePoints !== newVals.basePoints || existing.multiplier !== newVals.multiplier) {
          await editScoreWithHistory({
            weeklyScoreId: existing.id,
            newBasePoints: newVals.basePoints,
            newMultiplier: newVals.multiplier,
            editedBy: adminTeacher.id,
            editReason: editReason.trim(),
          });
        }
      }
      toast.success('점수가 수정되었습니다');
      setEditingScore(null);
      await loadData();
    } catch {
      toast.error('점수 수정 실패');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleViewHistory(memberId: string) {
    try {
      const history = await getScoreEditHistory(memberId, selectedDate);
      setHistoryData(history);
      setShowHistory(memberId);
    } catch {
      toast.error('이력 조회 실패');
    }
  }

  const submittedCount = teamScores.filter((t) => t.submission?.status === 'submitted').length;

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">점수 총괄</h1>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              title="새로고침"
            >
              <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            </button>
          </div>
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
                              {viewMode !== 'all' && (
                                <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500">관리</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {t.memberScores.map((row, idx) => (
                              <tr
                                key={row.memberId}
                                className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                              >
                                <td className="px-5 py-2.5">
                                  <button
                                    onClick={() => openMemberProfile(row.memberId)}
                                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                                  >
                                    <Avatar name={row.memberName} src={row.avatarUrl} size="sm" />
                                    <span className="font-medium text-gray-800">{row.memberName}</span>
                                    {row.clubName && <span className="text-xs text-gray-400">({row.clubName})</span>}
                                  </button>
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
                                {viewMode !== 'all' && (
                                  <td className="px-3 py-2.5 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        onClick={() => handleOpenEdit(row, t.teamId)}
                                        className="text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium"
                                      >
                                        수정
                                      </button>
                                      <button
                                        onClick={() => handleViewHistory(row.memberId)}
                                        className="text-xs px-2 py-1 rounded bg-gray-50 text-gray-500 hover:bg-gray-100 font-medium"
                                      >
                                        이력
                                      </button>
                                    </div>
                                  </td>
                                )}
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
                              {viewMode !== 'all' && <td />}
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

      {/* 점수 수정 모달 */}
      {editingScore && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-1">점수 수정</h3>
            <p className="text-sm text-gray-500 mb-4">{editingScore.memberName}</p>

            <div className="space-y-3 mb-4">
              {CATEGORIES.map((cat) => {
                const existing = editingScore.scores[cat];
                if (!existing) return null;
                return (
                  <div key={cat} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">{CATEGORY_LABELS[cat]}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={editValues[cat].basePoints}
                        onChange={(e) => setEditValues(prev => ({
                          ...prev,
                          [cat]: { ...prev[cat], basePoints: Number(e.target.value) }
                        }))}
                        className="w-20 text-sm border border-gray-300 rounded px-2 py-1 text-right"
                      />
                      {cat === 'recitation' && (
                        <>
                          <span className="text-xs text-gray-400">x</span>
                          <input
                            type="number"
                            value={editValues[cat].multiplier}
                            onChange={(e) => setEditValues(prev => ({
                              ...prev,
                              [cat]: { ...prev[cat], multiplier: Number(e.target.value) }
                            }))}
                            className="w-16 text-sm border border-gray-300 rounded px-2 py-1 text-right"
                          />
                        </>
                      )}
                      <span className="text-xs text-gray-400 w-12 text-right">
                        = {editValues[cat].basePoints * editValues[cat].multiplier}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">수정 사유 (필수)</label>
              <textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="수정 사유를 입력해주세요..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                rows={2}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setEditingScore(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium"
              >
                취소
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editSaving || !editReason.trim()}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {editSaving ? '저장중...' : '수정 저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 수정 이력 모달 */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">수정 이력</h3>
            {historyData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">수정 이력이 없습니다</p>
            ) : (
              <div className="space-y-3">
                {historyData.map((h) => (
                  <div key={h.id} className="p-3 bg-gray-50 rounded-lg text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="font-medium text-gray-700">{CATEGORY_LABELS[h.category]}</span>
                      <span className="text-xs text-gray-400">{new Date(h.created_at).toLocaleString('ko-KR')}</span>
                    </div>
                    <p className="text-gray-600">
                      {h.old_total_points} → {h.new_total_points}
                    </p>
                    {h.edit_reason && <p className="text-xs text-gray-500 mt-1">사유: {h.edit_reason}</p>}
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowHistory(null)}
              className="mt-4 w-full py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
