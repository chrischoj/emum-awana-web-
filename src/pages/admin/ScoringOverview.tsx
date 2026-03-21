import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useClub } from '../../contexts/ClubContext';
import { useAuth } from '../../contexts/AuthContext';
import { getWeeklyScores, getSubmissionsByDate, approveSubmission, rejectSubmission, editScoreWithHistory, getScoreEditHistory } from '../../services/scoringService';
import { getTeamGameTotals } from '../../services/gameScoreService';
import { getToday, cn, sortTeamsByColor, teamColorOrder } from '../../lib/utils';
import { Avatar } from '../../components/ui/Avatar';
import { DatePickerWithToday } from '../../components/ui/DatePickerWithToday';
import { useMemberProfile } from '../../contexts/MemberProfileContext';
import type { WeeklyScore, ScoringCategory, Team, Member, SubmissionStatus, WeeklyScoreSubmission, ScoreEditHistory, Room } from '../../types/awana';

interface RoomSubmissionData {
  roomId: string;
  roomName: string;
  submission: WeeklyScoreSubmission | null;
}

interface SubTeamData {
  teamId: string;
  clubId: string;
  clubName: string;
  handbookTotal: number;
  gameTotal: number;
  grandTotal: number;
  submission: WeeklyScoreSubmission | null;
  roomSubmissions: RoomSubmissionData[];
}

interface TeamScoreData {
  teamId: string;
  teamName: string;
  teamColor: string;
  handbookTotal: number;
  gameTotal: number;
  grandTotal: number;
  submission: WeeklyScoreSubmission | null;
  roomSubmissions: RoomSubmissionData[];
  memberScores: MemberScoreRow[];
  subTeams?: SubTeamData[];
}

interface MemberScoreRow {
  memberId: string;
  memberName: string;
  avatarUrl: string | null;
  clubName?: string;
  roomId?: string | null;
  roomName?: string | null;
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

/** room submissions에서 가장 긴급한(우선순위 높은) submission 파생 */
function deriveTeamSubmission(roomSubs: RoomSubmissionData[]): WeeklyScoreSubmission | null {
  const priority: Record<string, number> = { submitted: 0, rejected: 1, draft: 2, approved: 3 };
  let best: WeeklyScoreSubmission | null = null;
  let bestP = 999;
  for (const rs of roomSubs) {
    if (!rs.submission) continue;
    const p = priority[rs.submission.status] ?? 4;
    if (p < bestP) { bestP = p; best = rs.submission; }
  }
  return best;
}

export default function ScoringOverview() {
  const { clubs, currentClub, setCurrentClub, teams, members, loading: clubLoading } = useClub();
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
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When viewMode changes to a specific club, update context
  useEffect(() => {
    if (viewMode !== 'all') {
      const club = clubs.find((c) => c.id === viewMode);
      if (club && club.id !== currentClub?.id) setCurrentClub(club);
    }
  }, [viewMode, clubs]);

  // Load data based on viewMode
  useEffect(() => {
    if (viewMode === 'all') {
      if (clubs.length > 0) loadAllData();
    } else if (currentClub && currentClub.id === viewMode && !clubLoading) {
      loadData();
    }
  }, [viewMode, currentClub, selectedDate, clubs, clubLoading]);

  // Realtime 구독 (300ms debounce)
  useEffect(() => {
    const debouncedRefresh = () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = setTimeout(() => {
        if (viewMode === 'all') loadAllData(false);
        else loadData(false);
      }, 300);
    };
    const channel = supabase
      .channel(`admin-scoring-${selectedDate}-${viewMode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_scores' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_score_submissions' }, debouncedRefresh)
      .subscribe();
    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [selectedDate, viewMode, currentClub, clubs]);

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
      const [weeklyScores, gameTotals, submissions, roomsRes] = await Promise.all([
        getWeeklyScores(currentClub.id, selectedDate),
        getTeamGameTotals(currentClub.id, selectedDate),
        getSubmissionsByDate(currentClub.id, selectedDate),
        supabase.from('rooms').select('*').eq('club_id', currentClub.id).eq('active', true),
      ]);
      const rooms = (roomsRes.data as Room[]) || [];
      const roomNameMap = new Map<string, string>();
      for (const room of rooms) {
        roomNameMap.set(room.id, room.name);
      }

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

      // submission 맵 (room_id -> submission)
      const submissionByRoom = new Map<string, WeeklyScoreSubmission>();
      for (const s of submissions) {
        if (s.room_id) submissionByRoom.set(s.room_id, s);
      }

      // rooms by team
      const roomsByTeam = new Map<string, Room[]>();
      for (const room of rooms) {
        if (!room.team_id) continue;
        const list = roomsByTeam.get(room.team_id) || [];
        list.push(room);
        roomsByTeam.set(room.team_id, list);
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

      // 팀별 데이터 빌드 (R, B, G, Y 순)
      const result: TeamScoreData[] = sortTeamsByColor(teams).map((team) => {
        const teamMembers = members.filter((m) => m.team_id === team.id);

        const memberRows: MemberScoreRow[] = teamMembers.map((m) => {
          const scores = memberScoreMap.get(m.id) || {};
          const total = Object.values(scores).reduce((a, b) => a + (b || 0), 0);
          return {
            memberId: m.id,
            memberName: m.name,
            avatarUrl: m.avatar_url,
            roomId: m.room_id,
            roomName: m.room_id ? roomNameMap.get(m.room_id) ?? null : null,
            scores,
            total,
          };
        });

        const handbookTotal = teamHandbookMap.get(team.id) || 0;
        const gameTotal = gameTotals[team.id] || 0;

        const teamRooms = roomsByTeam.get(team.id) || [];
        const roomSubmissions: RoomSubmissionData[] = teamRooms.map(r => ({
          roomId: r.id,
          roomName: r.name,
          submission: submissionByRoom.get(r.id) || null,
        }));

        return {
          teamId: team.id,
          teamName: team.name,
          teamColor: team.color,
          handbookTotal,
          gameTotal,
          grandTotal: handbookTotal + gameTotal,
          submission: deriveTeamSubmission(roomSubmissions),
          roomSubmissions,
          memberScores: memberRows,
        };
      });

      // 상태 우선순위 정렬: 승인대기 → 반려됨 → 승인됨 → 미제출
      const statusOrder: Record<string, number> = {
        submitted: 0,
        rejected: 1,
        approved: 2,
        draft: 3,
      };
      result.sort((a, b) => {
        const sa = a.submission?.status ?? 'none';
        const sb = b.submission?.status ?? 'none';
        const statusDiff = (statusOrder[sa] ?? 4) - (statusOrder[sb] ?? 4);
        if (statusDiff !== 0) return statusDiff;
        return teamColorOrder(a.teamName) - teamColorOrder(b.teamName);
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
      const [teamsRes, membersRes, scoresRes, gameRes, submissionsRes, roomsRes] = await Promise.all([
        supabase.from('teams').select('*').order('name'),
        supabase.from('members').select('*').eq('active', true).eq('enrollment_status', 'active').order('name'),
        supabase.from('weekly_scores').select('*').eq('training_date', selectedDate),
        supabase.from('game_score_entries').select('*').eq('training_date', selectedDate),
        supabase.from('weekly_score_submissions').select('*').eq('training_date', selectedDate),
        supabase.from('rooms').select('*').eq('active', true),
      ]);

      const allTeams = (teamsRes.data as Team[]) || [];
      const allMembers = (membersRes.data as Member[]) || [];
      const allScores = (scoresRes.data as WeeklyScore[]) || [];
      const allGameEntries = (gameRes.data as { team_id: string; points: number }[]) || [];
      const allSubmissions = (submissionsRes.data as WeeklyScoreSubmission[]) || [];
      const allRooms = (roomsRes.data as Room[]) || [];

      // submission 맵 (room_id -> submission)
      const submissionByRoom = new Map<string, WeeklyScoreSubmission>();
      for (const s of allSubmissions) {
        if (s.room_id) submissionByRoom.set(s.room_id, s);
      }

      // rooms by team
      const roomsByTeam = new Map<string, Room[]>();
      for (const room of allRooms) {
        if (!room.team_id) continue;
        const list = roomsByTeam.get(room.team_id) || [];
        list.push(room);
        roomsByTeam.set(room.team_id, list);
      }

      const memberTeamMap = new Map<string, string>();
      for (const m of allMembers) {
        if (m.team_id) memberTeamMap.set(m.id, m.team_id);
      }

      // team_id -> club_id 맵
      const teamClubMap = new Map<string, string>();
      for (const team of allTeams) {
        teamClubMap.set(team.id, team.club_id);
      }

      // Group ALL teams by color name (not just submitted)
      const colorGroups = new Map<string, { color: string; teamIds: string[] }>();
      for (const team of allTeams) {
        const existing = colorGroups.get(team.name);
        if (existing) {
          existing.teamIds.push(team.id);
        } else {
          colorGroups.set(team.name, { color: team.color, teamIds: [team.id] });
        }
      }

      // Handbook scores per team (모든 팀)
      const teamHandbookMap = new Map<string, number>();
      const memberScoreMap = new Map<string, Partial<Record<ScoringCategory, number>>>();
      for (const score of allScores) {
        const teamId = memberTeamMap.get(score.member_id);
        if (teamId) {
          teamHandbookMap.set(teamId, (teamHandbookMap.get(teamId) || 0) + score.total_points);
          if (!memberScoreMap.has(score.member_id)) {
            memberScoreMap.set(score.member_id, {});
          }
          memberScoreMap.get(score.member_id)![score.category] = score.total_points;
        }
      }

      // Game totals per team (모든 팀)
      const teamGameMap = new Map<string, number>();
      for (const entry of allGameEntries) {
        teamGameMap.set(entry.team_id, (teamGameMap.get(entry.team_id) || 0) + entry.points);
      }

      // Build color-aggregated TeamScoreData with subTeams
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

        // subTeams: 각 클럽별 개별 데이터
        const subTeams: SubTeamData[] = teamIds.map((tid) => {
          const clubId = teamClubMap.get(tid) || '';
          const subRooms = roomsByTeam.get(tid) || [];
          const roomSubmissions: RoomSubmissionData[] = subRooms.map(r => ({
            roomId: r.id,
            roomName: r.name,
            submission: submissionByRoom.get(r.id) || null,
          }));
          return {
            teamId: tid,
            clubId,
            clubName: clubNameMap.get(clubId) || '알 수 없음',
            handbookTotal: teamHandbookMap.get(tid) || 0,
            gameTotal: teamGameMap.get(tid) || 0,
            grandTotal: (teamHandbookMap.get(tid) || 0) + (teamGameMap.get(tid) || 0),
            submission: deriveTeamSubmission(roomSubmissions),
            roomSubmissions,
          };
        });

        result.push({
          teamId: colorName,
          teamName: colorName,
          teamColor: color,
          handbookTotal,
          gameTotal,
          grandTotal: handbookTotal + gameTotal,
          submission: null,
          roomSubmissions: [],
          memberScores: memberRows,
          subTeams,
        });
      }

      result.sort((a, b) => teamColorOrder(a.teamName) - teamColorOrder(b.teamName));
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

  async function handleApproveRoom(rs: RoomSubmissionData, teamId: string) {
    if (!currentClub || !adminTeacher || !rs.submission) return;
    setActionLoading(rs.roomId);
    try {
      await approveSubmission({
        roomId: rs.roomId,
        clubId: currentClub.id,
        teamId,
        trainingDate: selectedDate,
        approvedBy: adminTeacher.id,
      });
      toast.success(`${rs.roomName} 승인됨`);
      await loadData();
    } catch {
      toast.error('승인 처리 실패');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRejectRoom(rs: RoomSubmissionData, teamId: string) {
    if (!currentClub) return;
    setActionLoading(rs.roomId);
    try {
      const note = rejectionNotes[rs.roomId] || '';
      await rejectSubmission({
        roomId: rs.roomId,
        clubId: currentClub.id,
        teamId,
        trainingDate: selectedDate,
        rejectionNote: note,
      });
      toast.success(`${rs.roomName} 반려됨`);
      setRejectingTeam(null);
      setRejectionNotes((prev) => { const n = { ...prev }; delete n[rs.roomId]; return n; });
      await loadData();
    } catch {
      toast.error('반려 처리 실패');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleAllViewApproveRoom(rs: RoomSubmissionData, sub: SubTeamData) {
    if (!adminTeacher || !rs.submission) return;
    setActionLoading(rs.roomId);
    try {
      await approveSubmission({
        roomId: rs.roomId,
        clubId: sub.clubId,
        teamId: sub.teamId,
        trainingDate: selectedDate,
        approvedBy: adminTeacher.id,
      });
      toast.success(`${rs.roomName} 승인됨`);
      await loadAllData(false);
    } catch {
      toast.error('승인 처리 실패');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleAllViewRejectRoom(rs: RoomSubmissionData, sub: SubTeamData) {
    setActionLoading(rs.roomId);
    try {
      const note = rejectionNotes[rs.roomId] || '';
      await rejectSubmission({
        roomId: rs.roomId,
        clubId: sub.clubId,
        teamId: sub.teamId,
        trainingDate: selectedDate,
        rejectionNote: note,
      });
      toast.success(`${rs.roomName} 반려됨`);
      setRejectingTeam(null);
      setRejectionNotes((prev) => { const n = { ...prev }; delete n[rs.roomId]; return n; });
      await loadAllData(false);
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

  // 개별 클럽 뷰 통계 (room 기반)
  const allClubRoomSubs = teamScores.flatMap(t => t.roomSubmissions);
  const submittedCount = allClubRoomSubs.filter(r => r.submission?.status === 'submitted').length;
  const approvedCount = allClubRoomSubs.filter(r => r.submission?.status === 'approved').length;
  const rejectedCount = allClubRoomSubs.filter(r => r.submission?.status === 'rejected').length;
  // 팀 단위 점수 기반 통계는 유지
  const noSubmissionTeams = teamScores.filter(t => !t.submission || t.submission.status === 'draft');
  const draftingCount = noSubmissionTeams.filter(t => t.handbookTotal > 0).length;
  const gameOnlyCount = noSubmissionTeams.filter(t => t.handbookTotal === 0 && t.gameTotal > 0).length;
  const unsubmittedCount = noSubmissionTeams.filter(t => t.handbookTotal === 0 && t.gameTotal === 0).length;

  // all 뷰용 전체 통계 (room 기반)
  const allRoomSubs = teamScores.flatMap(t => (t.subTeams || []).flatMap(s => s.roomSubmissions));
  const allSubmittedCount = allRoomSubs.filter(r => r.submission?.status === 'submitted').length;
  const allApprovedCount = allRoomSubs.filter(r => r.submission?.status === 'approved').length;
  const allRejectedCount = allRoomSubs.filter(r => r.submission?.status === 'rejected').length;
  const allNoSubmissionCount = allRoomSubs.filter(r => !r.submission || r.submission.status === 'draft').length;

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
          {viewMode === 'all' ? (
            <p className="text-sm text-gray-500 mt-0.5 flex flex-wrap gap-x-2">
              {allApprovedCount > 0 && <span className="text-green-600">승인 {allApprovedCount}</span>}
              {allSubmittedCount > 0 && <span className="text-blue-600">대기 {allSubmittedCount}</span>}
              {allRejectedCount > 0 && <span className="text-red-500">반려 {allRejectedCount}</span>}
              {allNoSubmissionCount > 0 && <span className="text-gray-400">미제출 {allNoSubmissionCount}</span>}
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-0.5 flex flex-wrap gap-x-2">
              {approvedCount > 0 && <span className="text-green-600">승인 {approvedCount}</span>}
              {submittedCount > 0 && <span className="text-blue-600">대기 {submittedCount}</span>}
              {rejectedCount > 0 && <span className="text-red-500">반려 {rejectedCount}</span>}
              {draftingCount > 0 && <span className="text-orange-500">작성중 {draftingCount}</span>}
              {gameOnlyCount > 0 && <span className="text-blue-500">게임 {gameOnlyCount}</span>}
              {unsubmittedCount > 0 && <span className="text-gray-400">미제출 {unsubmittedCount}</span>}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            data-testid="club-filter-all"
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
              data-testid={`club-filter-${club.id}`}
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
        <DatePickerWithToday
          value={selectedDate}
          onChange={setSelectedDate}
          className="focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : teamScores.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">{viewMode === 'all' ? '등록된 팀이 없습니다' : '아직 제출된 팀이 없습니다'}</p>
        </div>
      ) : (
        <>
          {/* 팀별 점수 카드 */}
          {(() => {
            const renderTeamCard = (t: TeamScoreData) => {
              const status = t.submission?.status ?? null;
              const statusCfg = status ? STATUS_CONFIG[status] : null;
              const hasSubTeams = (t.subTeams?.length ?? 0) > 0;
              const noSubmission = !status || status === 'draft';
              const isGameOnly = !hasSubTeams && noSubmission && t.handbookTotal === 0 && t.gameTotal > 0;
              const isDrafting = !hasSubTeams && noSubmission && t.handbookTotal > 0;
              const isUnsubmitted = !hasSubTeams && noSubmission && t.handbookTotal === 0 && t.gameTotal === 0;

              return (
                <div
                  key={t.teamId}
                  className={cn(
                    'bg-white rounded-xl border p-5 transition-all',
                    isUnsubmitted && 'opacity-50 grayscale',
                    isDrafting && 'opacity-75',
                    status === 'rejected' && 'border-red-200 bg-red-50/30',
                    !isUnsubmitted && !isDrafting && status !== 'rejected' && 'border-gray-200',
                  )}
                  style={{ borderTopColor: t.teamColor, borderTopWidth: 3 }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-bold text-sm" style={{ color: t.teamColor }}>{t.teamName}</p>
                    {!hasSubTeams && (
                      <>
                        {statusCfg && !isUnsubmitted && !isDrafting && !isGameOnly && (
                          <span data-testid={`admin-submission-status-${t.teamId}`} className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.className}`}>
                            {statusCfg.label}
                          </span>
                        )}
                        {isGameOnly && (
                          <span data-testid={`admin-submission-status-${t.teamId}`} className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-600">
                            게임
                          </span>
                        )}
                        {isDrafting && (
                          <span data-testid={`admin-submission-status-${t.teamId}`} className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-600">
                            작성중
                          </span>
                        )}
                        {isUnsubmitted && (
                          <span data-testid={`admin-submission-status-${t.teamId}`} className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-400">
                            미제출
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {isUnsubmitted ? (
                    <p className="text-xs text-gray-400 text-center py-4">아직 제출되지 않았습니다</p>
                  ) : (
                    <>
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

                      {/* 교실별 제출 현황 (개별 클럽 뷰) */}
                      {!hasSubTeams && t.roomSubmissions.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">교실별 현황</p>
                          {t.roomSubmissions.map((rs) => {
                            const rsStatus = rs.submission?.status ?? null;
                            const rsCfg = rsStatus ? STATUS_CONFIG[rsStatus] : null;
                            return (
                              <div
                                key={rs.roomId}
                                data-testid={`admin-room-card-${rs.roomId}`}
                                className={cn(
                                  'rounded-lg p-2.5 text-xs',
                                  rsStatus === 'submitted' && 'bg-blue-50',
                                  rsStatus === 'approved' && 'bg-green-50',
                                  rsStatus === 'rejected' && 'bg-red-50',
                                  !rsStatus && 'bg-gray-50 opacity-60',
                                )}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-semibold text-gray-700">{rs.roomName}</span>
                                  {rsCfg ? (
                                    <span data-testid={`admin-room-status-${rs.roomId}`} className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${rsCfg.className}`}>
                                      {rsCfg.label}
                                    </span>
                                  ) : (
                                    <span data-testid={`admin-room-status-${rs.roomId}`} className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-400">
                                      미제출
                                    </span>
                                  )}
                                </div>

                                {/* 승인/반려 버튼 */}
                                {rsStatus === 'submitted' && (
                                  <div className="mt-1.5">
                                    {rejectingTeam === rs.roomId ? (
                                      <div className="space-y-1.5">
                                        <textarea
                                          data-testid={`admin-room-reject-input-${rs.roomId}`}
                                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
                                          rows={2}
                                          placeholder="반려 사유 입력..."
                                          value={rejectionNotes[rs.roomId] || ''}
                                          onChange={(e) =>
                                            setRejectionNotes((prev) => ({ ...prev, [rs.roomId]: e.target.value }))
                                          }
                                        />
                                        <div className="flex gap-1">
                                          <button
                                            data-testid={`admin-room-reject-confirm-${rs.roomId}`}
                                            onClick={() => handleRejectRoom(rs, t.teamId)}
                                            disabled={actionLoading === rs.roomId}
                                            className="flex-1 py-1 rounded text-[10px] font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                                          >
                                            {actionLoading === rs.roomId ? '처리중...' : '반려 확인'}
                                          </button>
                                          <button
                                            onClick={() => setRejectingTeam(null)}
                                            className="flex-1 py-1 rounded text-[10px] font-medium bg-gray-100 text-gray-600 hover:bg-gray-200"
                                          >
                                            취소
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex gap-1">
                                        <button
                                          data-testid={`admin-room-approve-btn-${rs.roomId}`}
                                          onClick={() => handleApproveRoom(rs, t.teamId)}
                                          disabled={actionLoading === rs.roomId}
                                          className="flex-1 py-1 rounded text-[10px] font-medium bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
                                        >
                                          {actionLoading === rs.roomId ? '처리중...' : '승인'}
                                        </button>
                                        <button
                                          data-testid={`admin-room-reject-btn-${rs.roomId}`}
                                          onClick={() => setRejectingTeam(rs.roomId)}
                                          className="flex-1 py-1 rounded text-[10px] font-medium bg-red-100 text-red-600 hover:bg-red-200"
                                        >
                                          반려
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* 반려 사유 */}
                                {rsStatus === 'rejected' && rs.submission?.rejection_note && (
                                  <p className="text-[10px] text-red-500 mt-1">사유: {rs.submission.rejection_note}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* 클럽별 개별 현황 (all 뷰) */}
                      {t.subTeams && t.subTeams.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                          {t.subTeams.map((sub) => {
                            const subStatus = sub.submission?.status ?? null;
                            const subStatusCfg = subStatus ? STATUS_CONFIG[subStatus] : null;
                            const subNoSubmission = !subStatus || subStatus === 'draft';
                            const isSubGameOnly = subNoSubmission && sub.handbookTotal === 0 && sub.gameTotal > 0;
                            const isSubDrafting = subNoSubmission && sub.handbookTotal > 0;
                            const isSubUnsubmitted = subNoSubmission && sub.handbookTotal === 0 && sub.gameTotal === 0;
                            return (
                              <div
                                key={sub.teamId}
                                className={cn(
                                  'rounded-lg p-2.5 text-xs',
                                  isSubUnsubmitted && 'bg-gray-50 opacity-60',
                                  isSubDrafting && 'bg-orange-50/50',
                                  isSubGameOnly && 'bg-blue-50/50',
                                  subStatus === 'rejected' && 'bg-red-50',
                                  subStatus === 'submitted' && 'bg-blue-50',
                                  subStatus === 'approved' && 'bg-green-50',
                                )}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-semibold text-gray-700">{sub.clubName}</span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-gray-500">
                                      {sub.grandTotal.toLocaleString()}점
                                    </span>
                                    {subStatusCfg && !isSubUnsubmitted && !isSubDrafting && !isSubGameOnly ? (
                                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${subStatusCfg.className}`}>
                                        {subStatusCfg.label}
                                      </span>
                                    ) : isSubGameOnly ? (
                                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-600">
                                        게임
                                      </span>
                                    ) : isSubDrafting ? (
                                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-600">
                                        작성중
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-400">
                                        미제출
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* 교실별 현황 */}
                                {sub.roomSubmissions.length > 0 && (
                                  <div className="mt-1.5 space-y-1">
                                    {sub.roomSubmissions.map((rs) => {
                                      const rsStatus = rs.submission?.status ?? null;
                                      const rsCfg = rsStatus ? STATUS_CONFIG[rsStatus] : null;
                                      return (
                                        <div key={rs.roomId} className={cn(
                                          'rounded p-1.5',
                                          rsStatus === 'submitted' && 'bg-blue-100/50',
                                          rsStatus === 'approved' && 'bg-green-100/50',
                                          rsStatus === 'rejected' && 'bg-red-100/50',
                                          !rsStatus && 'bg-gray-100/50',
                                        )}>
                                          <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-gray-600">{rs.roomName}</span>
                                            {rsCfg ? (
                                              <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${rsCfg.className}`}>
                                                {rsCfg.label}
                                              </span>
                                            ) : (
                                              <span className="px-1 py-0.5 rounded text-[9px] font-medium bg-gray-100 text-gray-400">미제출</span>
                                            )}
                                          </div>

                                          {rsStatus === 'submitted' && (
                                            <div className="mt-1">
                                              {rejectingTeam === rs.roomId ? (
                                                <div className="space-y-1">
                                                  <textarea
                                                    className="w-full border border-gray-300 rounded px-1.5 py-0.5 text-[10px] resize-none focus:outline-none focus:ring-1 focus:ring-red-300"
                                                    rows={1}
                                                    placeholder="반려 사유..."
                                                    value={rejectionNotes[rs.roomId] || ''}
                                                    onChange={(e) =>
                                                      setRejectionNotes((prev) => ({ ...prev, [rs.roomId]: e.target.value }))
                                                    }
                                                  />
                                                  <div className="flex gap-0.5">
                                                    <button
                                                      onClick={() => handleAllViewRejectRoom(rs, sub)}
                                                      disabled={actionLoading === rs.roomId}
                                                      className="flex-1 py-0.5 rounded text-[9px] font-medium bg-red-500 text-white disabled:opacity-50"
                                                    >
                                                      {actionLoading === rs.roomId ? '...' : '반려'}
                                                    </button>
                                                    <button
                                                      onClick={() => setRejectingTeam(null)}
                                                      className="flex-1 py-0.5 rounded text-[9px] font-medium bg-gray-100 text-gray-600"
                                                    >
                                                      취소
                                                    </button>
                                                  </div>
                                                </div>
                                              ) : (
                                                <div className="flex gap-0.5">
                                                  <button
                                                    onClick={() => handleAllViewApproveRoom(rs, sub)}
                                                    disabled={actionLoading === rs.roomId}
                                                    className="flex-1 py-0.5 rounded text-[9px] font-medium bg-green-500 text-white disabled:opacity-50"
                                                  >
                                                    {actionLoading === rs.roomId ? '...' : '승인'}
                                                  </button>
                                                  <button
                                                    onClick={() => setRejectingTeam(rs.roomId)}
                                                    className="flex-1 py-0.5 rounded text-[9px] font-medium bg-red-100 text-red-600"
                                                  >
                                                    반려
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          {rsStatus === 'rejected' && rs.submission?.rejection_note && (
                                            <p className="text-[9px] text-red-500 mt-0.5">사유: {rs.submission.rejection_note}</p>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            };

            return viewMode !== 'all' ? (
              <div className="space-y-6 mb-6">
                {/* 승인 대기 섹션 */}
                {teamScores.filter(t => t.submission?.status === 'submitted').length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <h3 className="text-sm font-semibold text-blue-700">
                        승인 대기 ({teamScores.filter(t => t.submission?.status === 'submitted').length})
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                      {teamScores.filter(t => t.submission?.status === 'submitted').map(renderTeamCard)}
                    </div>
                  </div>
                )}

                {/* 반려됨 섹션 */}
                {teamScores.filter(t => t.submission?.status === 'rejected').length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <h3 className="text-sm font-semibold text-red-700">
                        반려됨 ({teamScores.filter(t => t.submission?.status === 'rejected').length})
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                      {teamScores.filter(t => t.submission?.status === 'rejected').map(renderTeamCard)}
                    </div>
                  </div>
                )}

                {/* 승인됨 섹션 */}
                {teamScores.filter(t => t.submission?.status === 'approved').length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <h3 className="text-sm font-semibold text-green-700">
                        승인됨 ({teamScores.filter(t => t.submission?.status === 'approved').length})
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                      {teamScores.filter(t => t.submission?.status === 'approved').map(renderTeamCard)}
                    </div>
                  </div>
                )}

                {/* 작성중 섹션 */}
                {teamScores.filter(t => (!t.submission || t.submission.status === 'draft') && t.handbookTotal > 0).length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-orange-400" />
                      <h3 className="text-sm font-semibold text-orange-600">
                        작성중 ({teamScores.filter(t => (!t.submission || t.submission.status === 'draft') && t.handbookTotal > 0).length})
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                      {teamScores.filter(t => (!t.submission || t.submission.status === 'draft') && t.handbookTotal > 0).map(renderTeamCard)}
                    </div>
                  </div>
                )}

                {/* 게임 전용 섹션 */}
                {teamScores.filter(t => (!t.submission || t.submission.status === 'draft') && t.handbookTotal === 0 && t.gameTotal > 0).length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                      <h3 className="text-sm font-semibold text-blue-600">
                        게임 ({teamScores.filter(t => (!t.submission || t.submission.status === 'draft') && t.handbookTotal === 0 && t.gameTotal > 0).length})
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                      {teamScores.filter(t => (!t.submission || t.submission.status === 'draft') && t.handbookTotal === 0 && t.gameTotal > 0).map(renderTeamCard)}
                    </div>
                  </div>
                )}

                {/* 미제출 섹션 */}
                {teamScores.filter(t => (!t.submission || t.submission.status === 'draft') && t.handbookTotal === 0 && t.gameTotal === 0).length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-gray-300" />
                      <h3 className="text-sm font-semibold text-gray-400">
                        미제출 ({teamScores.filter(t => (!t.submission || t.submission.status === 'draft') && t.handbookTotal === 0 && t.gameTotal === 0).length})
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                      {teamScores.filter(t => (!t.submission || t.submission.status === 'draft') && t.handbookTotal === 0 && t.gameTotal === 0).map(renderTeamCard)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
                {teamScores.map(renderTeamCard)}
              </div>
            );
          })()}

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
                      {(!t.submission || t.submission.status === 'draft') && viewMode !== 'all' && (
                        t.handbookTotal === 0 && t.gameTotal > 0 ? (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">게임</span>
                        ) : t.handbookTotal > 0 ? (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 font-medium">작성중</span>
                        ) : (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 font-medium">미제출</span>
                        )
                      )}
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
                            {viewMode !== 'all' ? (() => {
                              // 교실별 그룹핑
                              const roomMap = new Map<string, MemberScoreRow[]>();
                              const noRoom: MemberScoreRow[] = [];
                              for (const row of t.memberScores) {
                                if (row.roomId) {
                                  const arr = roomMap.get(row.roomId) || [];
                                  arr.push(row);
                                  roomMap.set(row.roomId, arr);
                                } else {
                                  noRoom.push(row);
                                }
                              }
                              const groups = [...roomMap.entries()].map(([rid, rows]) => ({
                                id: rid, name: rows[0]?.roomName || '알 수 없음', rows,
                              }));
                              groups.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
                              if (noRoom.length > 0) groups.push({ id: '__none__', name: '미배정', rows: noRoom });

                              const totalCols = CATEGORIES.length + 3;

                              return groups.map((g) => (
                                <Fragment key={`room-${g.id}`}>
                                  <tr className="bg-gray-100/80 border-t border-gray-200">
                                    <td colSpan={totalCols} className="px-5 py-1.5">
                                      <div className="flex items-center gap-2">
                                        <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.teamColor }} />
                                        <span className="text-xs font-semibold text-gray-600">{g.name}</span>
                                        <span className="text-[10px] text-gray-400">({g.rows.length}명)</span>
                                      </div>
                                    </td>
                                  </tr>
                                  {g.rows.map((row, idx) => (
                                    <tr key={row.memberId} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                      <td className="px-5 py-2.5">
                                        <button
                                          onClick={() => openMemberProfile(row.memberId)}
                                          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                                        >
                                          <Avatar name={row.memberName} src={row.avatarUrl} size="sm" />
                                          <span className="font-medium text-gray-800">{row.memberName}</span>
                                        </button>
                                      </td>
                                      {CATEGORIES.map((cat) => (
                                        <td key={cat} className="px-3 py-2.5 text-center text-gray-600">
                                          {row.scores[cat] !== undefined ? row.scores[cat]!.toLocaleString() : <span className="text-gray-300">-</span>}
                                        </td>
                                      ))}
                                      <td className="px-5 py-2.5 text-right font-bold text-gray-800">{row.total.toLocaleString()}</td>
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
                                    </tr>
                                  ))}
                                </Fragment>
                              ));
                            })() : (
                              t.memberScores.map((row, idx) => (
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
                                </tr>
                              ))
                            )}
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
