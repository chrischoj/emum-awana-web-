import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { getMemberBadges } from '../../services/badgeService';
import { cn } from '../../lib/utils';
import type { Member, WeeklyScore, MemberBadge, Badge, Team } from '../../types/awana';

export default function MemberProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [member, setMember] = useState<Member | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [scores, setScores] = useState<WeeklyScore[]>([]);
  const [badges, setBadges] = useState<(MemberBadge & { badge: Badge })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    async function load() {
      try {
        const [memberRes, scoresRes] = await Promise.all([
          supabase.from('members').select('*').eq('id', id).single(),
          supabase
            .from('weekly_scores')
            .select('*')
            .eq('member_id', id)
            .order('training_date', { ascending: false })
            .limit(50),
        ]);

        if (memberRes.error) throw memberRes.error;
        const m = memberRes.data as Member;
        setMember(m);
        setScores((scoresRes.data as WeeklyScore[]) || []);

        if (m.team_id) {
          const { data: teamData } = await supabase
            .from('teams')
            .select('*')
            .eq('id', m.team_id)
            .single();
          setTeam(teamData as Team | null);
        }

        const memberBadges = await getMemberBadges(id!);
        setBadges(memberBadges);
      } catch {
        toast.error('프로필 로드 실패');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!member) {
    return <p className="text-center text-gray-500 mt-10">멤버를 찾을 수 없습니다.</p>;
  }

  // Score summary by date
  const scoresByDate = new Map<string, number>();
  for (const score of scores) {
    const current = scoresByDate.get(score.training_date) || 0;
    scoresByDate.set(score.training_date, current + score.total_points);
  }

  const totalPoints = scores.reduce((sum, s) => sum + s.total_points, 0);

  return (
    <div className="pb-4">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-indigo-600 mb-4 flex items-center gap-1"
      >
        ← 뒤로
      </button>

      {/* Profile header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-2xl font-bold text-indigo-700">
            {member.name[0]}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{member.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              {team && (
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: team.color }}
                >
                  {team.name}
                </span>
              )}
              {member.birthday && (
                <span className="text-sm text-gray-500">
                  {new Date(member.birthday).toLocaleDateString('ko-KR')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-indigo-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">총 점수</p>
            <p className="text-2xl font-bold text-indigo-700">{totalPoints.toLocaleString()}</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">뱃지</p>
            <p className="text-2xl font-bold text-amber-700">{badges.length}</p>
          </div>
        </div>
      </div>

      {/* Badges */}
      {badges.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3">획득 뱃지</h2>
          <div className="flex flex-wrap gap-2">
            {badges.map((mb) => (
              <div
                key={mb.id}
                className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-center"
              >
                <p className="text-sm font-medium text-amber-800">{mb.badge.name}</p>
                <p className="text-xs text-gray-500">{mb.awarded_date}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score history */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900 mb-3">점수 이력</h2>
        {scores.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">기록이 없습니다</p>
        ) : (
          <div className="space-y-2">
            {Array.from(scoresByDate.entries()).map(([date, total]) => (
              <div key={date} className="flex items-center justify-between py-2 border-b border-gray-50">
                <span className="text-sm text-gray-600">{date}</span>
                <span className="font-bold text-indigo-600">{total}pt</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
