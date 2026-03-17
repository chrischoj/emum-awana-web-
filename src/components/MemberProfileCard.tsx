import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { BottomSheet } from './ui/BottomSheet';
import type { Member, AttendanceStatus, ScoringCategory, BadgeType } from '../types/awana';

// ---- Types ----

interface MemberProfileCardProps { memberId: string; onClose: () => void }
interface AttendanceStats { present: number; late: number; absent: number; total: number }
interface ScoreStats { attendance: number; handbook: number; uniform: number; recitation: number; total: number }
interface BadgeInfo { name: string; badge_type: BadgeType; awarded_date: string }

type MemberWithJoins = Member & {
  clubs?: { name: string } | null;
  teams?: { name: string; color: string } | null;
};

// ---- Constants ----

const SCORE_CATS: { key: ScoringCategory; label: string; color: string; light: string }[] = [
  { key: 'attendance', label: '출석', color: '#6366f1', light: '#eef2ff' },
  { key: 'handbook', label: '핸드북', color: '#0ea5e9', light: '#f0f9ff' },
  { key: 'uniform', label: '단복', color: '#f59e0b', light: '#fffbeb' },
  { key: 'recitation', label: '암송', color: '#8b5cf6', light: '#f5f3ff' },
];

const ATT_ITEMS = [
  { key: 'present' as const, label: '출석', color: '#22c55e', bg: '#f0fdf4' },
  { key: 'late' as const, label: '지각', color: '#f59e0b', bg: '#fffbeb' },
  { key: 'absent' as const, label: '결석', color: '#ef4444', bg: '#fef2f2' },
];

const BADGE_STYLE: Record<BadgeType, { bg: string; text: string; icon: string }> = {
  handbook_completion: { bg: 'bg-blue-50', text: 'text-blue-700', icon: '\uD83D\uDCD6' },
  attendance_perfect: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: '\u2B50' },
  memorization: { bg: 'bg-violet-50', text: 'text-violet-700', icon: '\uD83C\uDFC6' },
  special: { bg: 'bg-amber-50', text: 'text-amber-700', icon: '\uD83C\uDF1F' },
  custom: { bg: 'bg-gray-50', text: 'text-gray-600', icon: '\uD83C\uDFC5' },
};

// ---- Animated Donut (SVG) ----

function DonutChart({ rate }: { rate: number }) {
  const size = 80;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (rate / 100) * circ;
  const color = rate >= 80 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${filled} ${circ - filled}` }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-extrabold text-gray-800">{rate}</span>
        <span className="text-[9px] text-gray-400 -mt-0.5">%</span>
      </div>
    </div>
  );
}

// ---- Animated Bar ----

function AnimatedBar({ pct, color, delay = 0 }: { pct: number; color: string; delay?: number }) {
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut', delay }}
      />
    </div>
  );
}

// ---- Stagger container ----

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
};

// ---- Initials ----

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

// ---- Main Component ----

export function MemberProfileCard({ memberId, onClose }: MemberProfileCardProps) {
  const [member, setMember] = useState<MemberWithJoins | null>(null);
  const [att, setAtt] = useState<AttendanceStats>({ present: 0, late: 0, absent: 0, total: 0 });
  const [scores, setScores] = useState<ScoreStats>({ attendance: 0, handbook: 0, uniform: 0, recitation: 0, total: 0 });
  const [badges, setBadges] = useState<BadgeInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadProfile(); }, [memberId]);

  async function loadProfile() {
    setLoading(true);
    try {
      const [memberRes, attendanceRes, scoresRes, badgesRes] = await Promise.all([
        supabase.from('members').select('*, clubs(name), teams(name, color)').eq('id', memberId).single(),
        supabase.from('member_attendance').select('status').eq('member_id', memberId),
        supabase.from('weekly_scores').select('category, total_points').eq('member_id', memberId),
        supabase.from('member_badges').select('awarded_date, badges(name, badge_type)').eq('member_id', memberId),
      ]);
      if (memberRes.error) throw memberRes.error;
      setMember(memberRes.data as MemberWithJoins);

      const recs = ((attendanceRes.data || []) as { status: AttendanceStatus }[]).filter(r => r.status !== 'none');
      const a: AttendanceStats = { present: 0, late: 0, absent: 0, total: recs.length };
      for (const r of recs) if (r.status in a) a[r.status as keyof Omit<AttendanceStats, 'total'>]++;
      setAtt(a);

      const sRecs = (scoresRes.data || []) as { category: ScoringCategory; total_points: number }[];
      const sc: ScoreStats = { attendance: 0, handbook: 0, uniform: 0, recitation: 0, total: 0 };
      for (const r of sRecs) { sc[r.category] += r.total_points; sc.total += r.total_points; }
      setScores(sc);

      const bd = (badgesRes.data || []) as { awarded_date: string; badges: { name: string; badge_type: BadgeType } | null }[];
      setBadges(bd.filter((b) => b.badges).map((b) => ({
        name: b.badges!.name, badge_type: b.badges!.badge_type, awarded_date: b.awarded_date,
      })));
    } catch {
      toast.error('프로필 로드 실패');
    } finally {
      setLoading(false);
    }
  }

  const rate = att.total > 0 ? Math.round((att.present / att.total) * 100) : 0;
  const maxScore = Math.max(...SCORE_CATS.map((c) => scores[c.key]), 1);

  return (
    <BottomSheet open onClose={onClose}>
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : member ? (
        <div>
          {/* ===== Compact Header ===== */}
          <div className="relative">
            {/* Gradient background */}
            <div className="h-24 bg-gradient-to-br from-indigo-400 via-purple-400 to-pink-300 rounded-b-[2rem]" />

            {/* Total score pill */}
            <motion.div
              className="absolute top-3 right-4 bg-white/80 backdrop-blur-md rounded-xl px-3 py-1.5 shadow-sm"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
            >
              <p className="text-sm font-extrabold text-indigo-600 leading-none">{scores.total.toLocaleString()}<span className="text-[10px] text-indigo-400 font-medium ml-0.5">pt</span></p>
            </motion.div>

            {/* Avatar */}
            <motion.div
              className="absolute -bottom-12 left-5"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, type: 'spring', stiffness: 300, damping: 25 }}
            >
              <div className="w-24 h-24 rounded-full border-[3px] border-white shadow-lg overflow-hidden bg-white">
                {member.avatar_url ? (
                  <img
                    src={member.avatar_url}
                    alt={member.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center">
                    <span className="text-xl font-bold text-white">{getInitials(member.name)}</span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          {/* ===== Name + Tags ===== */}
          <div className="px-5 pt-14 pb-1">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.25 }}
            >
              <h2 className="text-xl font-bold text-gray-900">{member.name}</h2>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {member.clubs?.name && (
                  <span className="text-[11px] text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full font-medium">
                    {member.clubs.name}
                  </span>
                )}
                {member.teams?.name && (
                  <span
                    className="text-[11px] font-semibold text-white px-2.5 py-0.5 rounded-full shadow-sm"
                    style={{ backgroundColor: member.teams.color }}
                  >
                    {member.teams.name}
                  </span>
                )}
                {member.birthday && (
                  <span className="text-[11px] text-gray-400">{member.birthday}</span>
                )}
              </div>
            </motion.div>
          </div>

          {/* ===== Stats Content ===== */}
          <motion.div
            className="px-5 pt-5 pb-6 space-y-5"
            variants={stagger}
            initial="hidden"
            animate="show"
          >
            {/* Attendance */}
            <motion.div variants={fadeUp} className="bg-gradient-to-br from-slate-50 to-indigo-50/30 rounded-2xl p-4">
              <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">출석 현황</h4>
              <div className="flex items-center gap-5">
                <DonutChart rate={rate} />
                <div className="flex-1 space-y-2.5">
                  {ATT_ITEMS.map(({ key, label, color }, i) => {
                    const pct = att.total > 0 ? (att[key] / att.total) * 100 : 0;
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                            <span className="text-[11px] text-gray-500">{label}</span>
                          </div>
                          <span className="text-[11px] font-bold" style={{ color }}>{att[key]}회</span>
                        </div>
                        <AnimatedBar pct={pct} color={color} delay={0.05 + i * 0.05} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>

            {/* Scores */}
            <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">누적 점수</h4>
              <div className="space-y-3">
                {SCORE_CATS.map(({ key, label, color, light }, i) => {
                  const val = scores[key];
                  const pct = maxScore > 0 ? (val / maxScore) * 100 : 0;
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-xs font-medium text-gray-600">{label}</span>
                        </div>
                        <span className="text-xs font-bold text-gray-800">
                          {val.toLocaleString()}<span className="text-gray-400 font-normal ml-0.5">pt</span>
                        </span>
                      </div>
                      <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: light }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.05 + i * 0.05 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Badges */}
            <motion.div variants={fadeUp}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">뱃지</h4>
                {badges.length > 0 && (
                  <span className="text-xs text-gray-400">{badges.length}개</span>
                )}
              </div>
              {badges.length === 0 ? (
                <div className="text-center py-6 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <p className="text-2xl mb-1">{'\uD83C\uDFC5'}</p>
                  <p className="text-sm text-gray-400">아직 획득한 뱃지가 없습니다</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {badges.map((badge, i) => {
                    const s = BADGE_STYLE[badge.badge_type];
                    return (
                      <motion.span
                        key={i}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold ring-1 ring-inset ring-black/5 ${s.bg} ${s.text}`}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1 + i * 0.03, duration: 0.2, type: 'spring' }}
                      >
                        <span>{s.icon}</span>{badge.name}
                      </motion.span>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </motion.div>
        </div>
      ) : (
        <p className="text-center text-gray-500 py-6">멤버를 찾을 수 없습니다</p>
      )}
    </BottomSheet>
  );
}
