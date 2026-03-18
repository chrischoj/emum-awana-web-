import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useClub } from '../../contexts/ClubContext';
import { getGameScoresByDate, getTeamGameTotals } from '../../services/gameScoreService';
import { getSubmissionsByDate, approveSubmission, rejectSubmission } from '../../services/scoringService';
import { useAuth } from '../../contexts/AuthContext';
import { getToday, cn } from '../../lib/utils';
import type { GameScoreEntry, Team, WeeklyScoreSubmission, SubmissionStatus } from '../../types/awana';

interface ColorTotal {
  name: string;
  color: string;
  total: number;
}

const STATUS_CONFIG: Record<SubmissionStatus, { label: string; className: string }> = {
  draft:     { label: '작성중',  className: 'bg-gray-100 text-gray-600' },
  submitted: { label: '제출됨',  className: 'bg-blue-100 text-blue-700' },
  approved:  { label: '승인됨',  className: 'bg-green-100 text-green-700' },
  rejected:  { label: '반려됨',  className: 'bg-red-100 text-red-700' },
};

export default function GameScoresAdmin() {
  const { currentClub, clubs, setCurrentClub, teams } = useClub();
  const { teacher: adminTeacher } = useAuth();
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [viewMode, setViewMode] = useState<'all' | string>('all');
  const [teamTotals, setTeamTotals] = useState<Record<string, number>>({});
  const [colorTotals, setColorTotals] = useState<ColorTotal[]>([]);
  const [entries, setEntries] = useState<GameScoreEntry[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<WeeklyScoreSubmission[]>([]);
  const [rejectingTeam, setRejectingTeam] = useState<string | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (viewMode !== 'all') {
      const club = clubs.find((c) => c.id === viewMode);
      if (club) setCurrentClub(club);
    }
  }, [viewMode, clubs]);

  useEffect(() => {
    if (viewMode === 'all') {
      if (clubs.length > 0) loadAllData();
    } else if (currentClub && currentClub.id === viewMode) {
      loadClubData();
    }
  }, [viewMode, currentClub, selectedDate, clubs]);

  async function loadClubData() {
    if (!currentClub) return;
    setLoading(true);
    try {
      const [totals, data, subs] = await Promise.all([
        getTeamGameTotals(currentClub.id, selectedDate),
        getGameScoresByDate(currentClub.id, selectedDate),
        getSubmissionsByDate(currentClub.id, selectedDate),
      ]);
      setSubmissions(subs);
      // 제출/승인된 팀만 필터링
      const submittedTeamIds = new Set(
        subs.filter(s => s.status === 'submitted' || s.status === 'approved').map(s => s.team_id)
      );
      const filteredTotals: Record<string, number> = {};
      for (const [tid, total] of Object.entries(totals)) {
        if (submittedTeamIds.has(tid)) filteredTotals[tid] = total;
      }
      setTeamTotals(filteredTotals);
      setEntries(data.filter(e => submittedTeamIds.has(e.team_id)));
    } catch {
      toast.error('데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }

  async function loadAllData() {
    setLoading(true);
    try {
      const [teamsRes, entriesRes, submissionsRes] = await Promise.all([
        supabase.from('teams').select('*').order('name'),
        supabase.from('game_score_entries').select('*').eq('training_date', selectedDate).order('created_at', { ascending: false }),
        supabase.from('weekly_score_submissions').select('*').eq('training_date', selectedDate).in('status', ['submitted', 'approved']),
      ]);

      const fetchedTeams = (teamsRes.data as Team[]) || [];
      const fetchedEntries = (entriesRes.data as GameScoreEntry[]) || [];
      const allSubs = (submissionsRes.data as WeeklyScoreSubmission[]) || [];
      const submittedTeamIds = new Set(allSubs.map(s => s.team_id));

      setAllTeams(fetchedTeams);
      setEntries(fetchedEntries.filter(e => submittedTeamIds.has(e.team_id)));

      // Aggregate by color — only submitted teams
      const colorGroupMap = new Map<string, { color: string; teamIds: string[] }>();
      for (const team of fetchedTeams) {
        if (!submittedTeamIds.has(team.id)) continue;
        const existing = colorGroupMap.get(team.name);
        if (existing) existing.teamIds.push(team.id);
        else colorGroupMap.set(team.name, { color: team.color, teamIds: [team.id] });
      }

      const totals: ColorTotal[] = [];
      for (const [name, { color, teamIds }] of colorGroupMap) {
        const total = fetchedEntries
          .filter((e) => teamIds.includes(e.team_id))
          .reduce((sum, e) => sum + e.points, 0);
        totals.push({ name, color, total });
      }
      setColorTotals(totals);
    } catch {
      toast.error('데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const channel = supabase
      .channel(`admin-game-scores-${selectedDate}-${viewMode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_score_entries' }, () => {
        if (viewMode === 'all') loadAllData();
        else loadClubData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_score_submissions' }, () => {
        if (viewMode === 'all') loadAllData();
        else loadClubData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedDate, viewMode, currentClub, clubs]);

  async function handleApprove(teamId: string) {
    if (!currentClub || !adminTeacher) return;
    setActionLoading(teamId);
    try {
      await approveSubmission({
        clubId: currentClub.id,
        teamId,
        trainingDate: selectedDate,
        approvedBy: adminTeacher.id,
      });
      toast.success('승인됨');
      await loadClubData();
    } catch {
      toast.error('승인 처리 실패');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(teamId: string) {
    if (!currentClub) return;
    setActionLoading(teamId);
    try {
      await rejectSubmission({
        clubId: currentClub.id,
        teamId,
        trainingDate: selectedDate,
        rejectionNote: rejectionNotes[teamId] || '',
      });
      toast.success('반려됨');
      setRejectingTeam(null);
      setRejectionNotes(prev => { const n = { ...prev }; delete n[teamId]; return n; });
      await loadClubData();
    } catch {
      toast.error('반려 처리 실패');
    } finally {
      setActionLoading(null);
    }
  }

  const getTeamSubmission = (teamId: string) => submissions.find(s => s.team_id === teamId);

  const clubMap = new Map(clubs.map((c) => [c.id, c.name]));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">게임 점수 관리</h1>
          {viewMode !== 'all' && submissions.filter(s => s.status === 'submitted').length > 0 && (
            <p className="text-sm text-blue-600 mt-0.5">
              {submissions.filter(s => s.status === 'submitted').length}개 팀이 승인 대기 중입니다
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${viewMode === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            모두(총합)
          </button>
          {clubs.map((club) => (
            <button key={club.id} onClick={() => setViewMode(club.id)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${viewMode === club.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              {club.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>

      {/* Team/Color totals */}
      {viewMode === 'all' ? (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {colorTotals.map((ct) => (
            <div key={ct.name} className="bg-white rounded-xl border border-gray-200 p-4 text-center" style={{ borderTopColor: ct.color, borderTopWidth: 3 }}>
              <p className="text-sm font-bold" style={{ color: ct.color }}>{ct.name}</p>
              <p className="text-2xl font-bold mt-1">{ct.total.toLocaleString()}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-6 lg:grid-cols-4">
          {teams.filter(team => teamTotals[team.id] !== undefined).map((team) => {
            const sub = getTeamSubmission(team.id);
            const status = sub?.status ?? 'draft';
            const statusCfg = STATUS_CONFIG[status];
            return (
              <div key={team.id} className="bg-white rounded-xl border border-gray-200 p-4" style={{ borderTopColor: team.color, borderTopWidth: 3 }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold" style={{ color: team.color }}>{team.name}</p>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusCfg.className)}>
                    {statusCfg.label}
                  </span>
                </div>
                <p className="text-2xl font-bold text-center">{(teamTotals[team.id] || 0).toLocaleString()}</p>
                {status === 'submitted' && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    {rejectingTeam === team.id ? (
                      <>
                        <textarea
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
                          rows={2}
                          placeholder="반려 사유 입력..."
                          value={rejectionNotes[team.id] || ''}
                          onChange={(e) => setRejectionNotes(prev => ({ ...prev, [team.id]: e.target.value }))}
                        />
                        <div className="flex gap-1.5 mt-2">
                          <button
                            onClick={() => handleReject(team.id)}
                            disabled={actionLoading === team.id}
                            className="flex-1 py-1 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                          >
                            {actionLoading === team.id ? '처리중...' : '반려 확인'}
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
                          onClick={() => handleApprove(team.id)}
                          disabled={actionLoading === team.id}
                          className="flex-1 py-1 rounded-lg text-xs font-medium bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
                        >
                          {actionLoading === team.id ? '처리중...' : '승인'}
                        </button>
                        <button
                          onClick={() => setRejectingTeam(team.id)}
                          className="flex-1 py-1 rounded-lg text-xs font-medium bg-red-100 text-red-600 hover:bg-red-200"
                        >
                          반려
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {status === 'rejected' && sub?.rejection_note && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-xs text-red-500">반려 사유: {sub.rejection_note}</p>
                  </div>
                )}
              </div>
            );
          })}
          {teams.filter(team => teamTotals[team.id] !== undefined).length === 0 && (
            <div className="col-span-full text-center py-8">
              <p className="text-gray-400 text-sm">아직 제출된 팀이 없습니다</p>
            </div>
          )}
        </div>
      )}

      {/* Entry list */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold mb-3">점수 기록</h2>
        {loading ? (
          <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" /></div>
        ) : entries.length === 0 ? (
          <p className="text-gray-400 text-center py-4 text-sm">제출된 팀의 기록이 없습니다</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => {
              const team = viewMode === 'all'
                ? allTeams.find((t) => t.id === entry.team_id)
                : teams.find((t) => t.id === entry.team_id);
              return (
                <div key={entry.id} className="flex items-center justify-between py-2 border-b border-gray-50 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{new Date(entry.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                    {viewMode === 'all' && (
                      <span className="text-xs text-gray-500">[{clubMap.get(entry.club_id) || ''}]</span>
                    )}
                    {team && <span className="px-2 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: team.color }}>{team.name}</span>}
                    {entry.description && <span className="text-gray-500">{entry.description}</span>}
                  </div>
                  <span className="font-bold text-indigo-600">+{entry.points}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
