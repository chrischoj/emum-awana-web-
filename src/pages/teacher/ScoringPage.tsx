import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useClub } from '../../contexts/ClubContext';
import { getWeeklyScores, upsertScore, getSubmission, submitScores, reopenSubmission } from '../../services/scoringService';
import { recordAttendance, getAttendancePoints, getAttendanceByDate } from '../../services/attendanceService';
import { supabase } from '../../lib/supabase';
import { useLocation } from 'react-router-dom';
import { cn, getToday } from '../../lib/utils';
import { Avatar } from '../../components/ui/Avatar';
import { OfflineBanner } from '../../components/ui/OfflineBanner';
import { DatePickerWithToday } from '../../components/ui/DatePickerWithToday';
import { useMemberProfile } from '../../contexts/MemberProfileContext';
import { useTeacherAssignment } from '../../hooks/useTeacherAssignment';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useSessionCache } from '../../hooks/useSessionCache';
import { useOfflineQueue } from '../../hooks/useOfflineQueue';
import type { WeeklyScore, ScoringCategory, AttendanceStatus, Member, SubmissionStatus } from '../../types/awana';
import BadgeRequestPanel from '../../components/scoring/BadgeRequestPanel';
import BadgeReviewBanner from '../../components/scoring/BadgeReviewBanner';
import { useBadgeRequests } from '../../hooks/useBadgeRequests';
import { useAppResume } from '../../hooks/useAppResume';
import { getBadges, getBatchMemberBadges } from '../../services/badgeService';
import { getMemberBadgeRequests, getBatchMemberBadgeRequests } from '../../services/badgeRequestService';
import { canApproveBadges } from '../../lib/positionUtils';
import type { Badge, BadgeRequest } from '../../types/awana';

const ATTENDANCE_CYCLE: AttendanceStatus[] = ['present', 'late', 'absent'];
const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  none: '미입력', present: '출석', late: '지각', absent: '결석',
};
const ATTENDANCE_COLORS: Record<AttendanceStatus, string> = {
  none: 'bg-gray-50 text-gray-500 border-gray-300',
  present: 'bg-green-100 text-green-800 border-green-400',
  late: 'bg-yellow-100 text-yellow-800 border-yellow-400',
  absent: 'bg-red-100 text-red-800 border-red-400',
};

interface MemberScoreState {
  attendance: { status: AttendanceStatus; points: number };
  handbook: { done: boolean; points: number };
  uniform: { done: boolean; points: number };
  recitation: { multiplier: number; points: number };
  total: number;
}

function calcTotal(s: Omit<MemberScoreState, 'total'>): number {
  return s.attendance.points + s.handbook.points + s.uniform.points + s.recitation.points;
}

export default function ScoringPage() {
  const { teacher } = useAuth();
  const { currentClub, curriculumTemplate, teams, members } = useClub();
  const { openMemberProfile } = useMemberProfile();
  const { assignedTeamIds, assignedMembers, isReadOnly, isUnassigned, primaryAssignments, temporaryAssignments } = useTeacherAssignment();
  const { isOffline, onReconnect } = useNetworkStatus();
  const { enqueue, pendingCount } = useOfflineQueue();
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const selectedTeamIdRef = useRef(selectedTeamId);
  selectedTeamIdRef.current = selectedTeamId;
  const selectedRoomId = useMemo(() => {
    if (!selectedTeamId) return null;
    const allAssigns = [...primaryAssignments, ...temporaryAssignments];
    return allAssigns.find(a => a.team_id === selectedTeamId)?.room_id ?? null;
  }, [selectedTeamId, primaryAssignments, temporaryAssignments]);
  const selectedRoomIdRef = useRef(selectedRoomId);
  selectedRoomIdRef.current = selectedRoomId;
  const location = useLocation();
  const [scores, setScores] = useState<Record<string, MemberScoreState>>({});
  const [loading, setLoading] = useState(true);
  const [recitationMemberId, setRecitationMemberId] = useState<string | null>(null);
  const [badgeMemberId, setBadgeMemberId] = useState<string | null>(null);
  const [allBadges, setAllBadges] = useState<Badge[]>([]);
  const [memberBadgeMap, setMemberBadgeMap] = useState<Record<string, string[]>>({});
  const [memberRequestMap, setMemberRequestMap] = useState<Record<string, (BadgeRequest & { badge: { id: string; name: string; category: string | null } })[]>>({});
  const { requests: badgeRequests, pendingCount: badgePendingCount, submitRequest, approve: approveBadge, reject: rejectBadge } = useBadgeRequests();
  const canReview = canApproveBadges(teacher?.role || '', teacher?.position || null);

  const cacheKey = `scoring-${currentClub?.id}-${selectedDate}`;
  const { restore: restoreScores } = useSessionCache(cacheKey, scores, Object.keys(scores).length > 0);
  const pendingSyncs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [submission, setSubmission] = useState<{ status: SubmissionStatus; rejectionNote?: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const baseMembers = isUnassigned
    ? (isReadOnly ? members : [])  // 일반교사 미배정: 열람용 전체, admin 미배정: 빈 목록
    : assignedMembers;
  const filteredMembers = selectedTeamId
    ? baseMembers.filter((m) => m.team_id === selectedTeamId)
    : baseMembers;

  const isLocked = isReadOnly || submission?.status === 'submitted' || submission?.status === 'approved';

  // Load scores
  const loadScores = useCallback(
    async (showLoading = true) => {
      if (!currentClub) return;
      if (showLoading) setLoading(true);
      try {
        const [weeklyScores, attendanceRecords] = await Promise.all([
          getWeeklyScores(currentClub.id, selectedDate),
          getAttendanceByDate(selectedDate, currentClub.id),
        ]);

        // Build attendance status map from member_attendance table
        const attStatusMap: Record<string, AttendanceStatus> = {};
        for (const rec of attendanceRecords) {
          const status = rec.status || (rec.present ? 'present' : 'absent');
          if (status !== 'none') attStatusMap[rec.member_id] = status;
        }

        const scoreMap: Record<string, MemberScoreState> = {};
        for (const member of members) {
          const memberScores = weeklyScores.filter((s) => s.member_id === member.id);
          const att = memberScores.find((s) => s.category === 'attendance');
          const hb = memberScores.find((s) => s.category === 'handbook');
          const uni = memberScores.find((s) => s.category === 'uniform');
          const rec = memberScores.find((s) => s.category === 'recitation');

          // Use actual status from member_attendance table
          const attStatus = attStatusMap[member.id] ?? 'none';

          const state: Omit<MemberScoreState, 'total'> = {
            attendance: { status: attStatus, points: att?.total_points ?? 0 },
            handbook: { done: (hb?.base_points ?? 0) > 0, points: hb?.total_points ?? 0 },
            uniform: { done: (uni?.base_points ?? 0) > 0, points: uni?.total_points ?? 0 },
            recitation: { multiplier: rec?.multiplier ?? 0, points: rec?.total_points ?? 0 },
          };
          scoreMap[member.id] = { ...state, total: calcTotal(state) };
        }
        setScores(scoreMap);
      } catch {
        // 네트워크 실패 시 캐시에서 복원
        const cached = restoreScores();
        if (cached && Object.keys(cached).length > 0) {
          setScores(cached);
        } else if (navigator.onLine) {
          toast.error('점수 로드 실패');
        }
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [currentClub, selectedDate, members, restoreScores]
  );

  useEffect(() => {
    loadScores(true);
  }, [loadScores]);

  // Load badge data
  useEffect(() => {
    getBadges().then(setAllBadges).catch(() => {});
  }, []);

  // Load member badges & requests when members change (배치 쿼리로 N+1 방지)
  useEffect(() => {
    if (members.length === 0) return;
    let stale = false;
    const memberIds = members.map(m => m.id);
    Promise.all([
      getBatchMemberBadges(memberIds),
      getBatchMemberBadgeRequests(memberIds),
    ])
      .then(([badgeMap, requestMap]) => {
        if (!stale) {
          setMemberBadgeMap(badgeMap);
          setMemberRequestMap(requestMap);
        }
      })
      .catch(() => {
        if (!stale) {
          setMemberBadgeMap({});
          setMemberRequestMap({});
        }
      });
    return () => { stale = true; };
  }, [members]);

  // Realtime subscription for attendance & score changes
  useEffect(() => {
    if (!currentClub) return;

    const channel = supabase
      .channel(`scoring-sync-${currentClub.id}-${selectedDate}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'member_attendance', filter: `training_date=eq.${selectedDate}` },
        () => loadScores(false)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'weekly_scores', filter: `club_id=eq.${currentClub.id}` },
        () => loadScores(false)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'weekly_score_submissions', filter: `club_id=eq.${currentClub.id}` },
        () => {
          const rid = selectedRoomIdRef.current;
          if (rid) {
            getSubmission(rid, selectedDate)
              .then((sub) => {
                if (sub) {
                  setSubmission({ status: sub.status, rejectionNote: sub.rejection_note });
                } else {
                  setSubmission(null);
                }
              })
              .catch(() => {});
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentClub, selectedDate, loadScores]);

  // Load submission status
  useEffect(() => {
    if (!currentClub || !selectedRoomId) {
      setSubmission(null);
      return;
    }
    getSubmission(selectedRoomId, selectedDate)
      .then((sub) => {
        if (sub) {
          setSubmission({ status: sub.status, rejectionNote: sub.rejection_note });
        } else {
          setSubmission(null);
        }
      })
      .catch(() => setSubmission(null));
  }, [currentClub, selectedRoomId, selectedDate]);

  // 알림 클릭에 의한 adaptive refresh (동일 경로여도 강제 갱신)
  useEffect(() => {
    const state = location.state as { fromNotification?: boolean; team_id?: string; room_id?: string; training_date?: string } | null;
    if (!state?.fromNotification) return;

    // 날짜/팀 설정 (다르면 기존 useEffect가 자동 갱신, 같으면 아래에서 강제 갱신)
    if (state.training_date) setSelectedDate(state.training_date);
    if (state.team_id) setSelectedTeamId(state.team_id);

    // 동일 팀/날짜여도 submission 강제 갱신
    if (currentClub) {
      const date = state.training_date || selectedDate;
      const rid = state.room_id;
      if (rid) {
        getSubmission(rid, date)
          .then((sub) => {
            if (sub) {
              setSubmission({ status: sub.status, rejectionNote: sub.rejection_note });
            } else {
              setSubmission(null);
            }
          })
          .catch(() => {});
      }
      loadScores(false);
    }

    // navigation state 클리어 (재진입 시 재트리거 방지)
    window.history.replaceState({}, document.title);
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced sync to Supabase (오프라인 시 큐에 저장)
  const syncScore = useCallback(
    (memberId: string, category: ScoringCategory, basePoints: number, multiplier: number) => {
      if (!currentClub) return;
      const params = {
        memberId,
        clubId: currentClub.id,
        trainingDate: selectedDate,
        category,
        basePoints,
        multiplier,
        recordedBy: teacher?.id,
      };

      if (isOffline) {
        enqueue('upsertScore', params);
        return;
      }

      const key = `${memberId}-${category}`;
      const existing = pendingSyncs.current.get(key);
      if (existing) clearTimeout(existing);

      const timeout = setTimeout(() => {
        upsertScore(params).catch(() => {
          if (navigator.onLine) toast.error('점수 저장 실패');
          else enqueue('upsertScore', params);
        });
        pendingSyncs.current.delete(key);
      }, 500);
      pendingSyncs.current.set(key, timeout);
    },
    [currentClub, selectedDate, teacher, isOffline, enqueue]
  );

  const syncAttendance = useCallback(
    (memberId: string, status: AttendanceStatus) => {
      const params = {
        memberId,
        trainingDate: selectedDate,
        status,
      };

      if (isOffline) {
        enqueue('recordAttendance', params);
        return;
      }

      recordAttendance(params).catch(() => {
        if (navigator.onLine) toast.error('출석 저장 실패');
        else enqueue('recordAttendance', params);
      });
    },
    [selectedDate, isOffline, enqueue]
  );

  // 온라인 복귀 시 전체 데이터 재동기화
  useEffect(() => {
    return onReconnect(() => {
      loadScores(false);
    });
  }, [onReconnect, loadScores]);

  // 백그라운드 전환 시 pending sync 즉시 flush, 복귀 시 soft-reload
  const flushPendingSyncs = useCallback(() => {
    if (!currentClub || !teacher) return;
    for (const [key, timeout] of pendingSyncs.current) {
      clearTimeout(timeout);
      const dashIdx = key.indexOf('-');
      const memberId = key.slice(0, dashIdx);
      const category = key.slice(dashIdx + 1) as ScoringCategory;
      const memberScore = scores[memberId];
      if (memberScore && category) {
        let basePoints = 0;
        let multiplier = 1;
        if (category === 'attendance') basePoints = memberScore.attendance.points;
        else if (category === 'handbook') basePoints = memberScore.handbook.points;
        else if (category === 'uniform') basePoints = memberScore.uniform.points;
        else if (category === 'recitation') { basePoints = 100; multiplier = memberScore.recitation.multiplier; }
        upsertScore({
          memberId, clubId: currentClub.id, trainingDate: selectedDate,
          category, basePoints, multiplier, recordedBy: teacher.id,
        }).catch(() => {});
      }
    }
    pendingSyncs.current.clear();
  }, [currentClub, teacher, selectedDate, scores]);

  useAppResume(
    // onResume: 스피너 없이 데이터 갱신
    () => { loadScores(false); },
    // onBackground: pending sync 즉시 flush
    flushPendingSyncs,
  );

  const handleAttendanceTap = (memberId: string) => {
    if (isLocked) return;
    navigator.vibrate?.(10);
    setScores((prev) => {
      const current = prev[memberId];
      if (!current) return prev;
      const idx = ATTENDANCE_CYCLE.indexOf(current.attendance.status);
      const nextStatus = ATTENDANCE_CYCLE[(idx + 1) % 3];
      const points = getAttendancePoints(nextStatus);
      const updated = {
        ...current,
        attendance: { status: nextStatus, points },
      };

      // 결석 전환 시 암송 패널만 닫기 (점수는 보존)
      if (nextStatus === 'absent' && recitationMemberId === memberId) {
        setTimeout(() => setRecitationMemberId(null), 0);
      }
      // 뱃지 패널도 닫기
      if (nextStatus === 'absent' && badgeMemberId === memberId) {
        setTimeout(() => setBadgeMemberId(null), 0);
      }

      updated.total = calcTotal(updated);
      syncScore(memberId, 'attendance', points, 1);
      syncAttendance(memberId, nextStatus);
      return { ...prev, [memberId]: updated };
    });
  };

  const handleToggle = (memberId: string, category: 'handbook' | 'uniform') => {
    if (isLocked) return;
    // 결석 상태면 입력 차단
    if (scores[memberId]?.attendance.status === 'absent') return;
    navigator.vibrate?.(10);
    setScores((prev) => {
      const current = prev[memberId];
      if (!current) return prev;
      const wasOn = current[category].done;
      const points = wasOn ? 0 : 50;
      const updated = {
        ...current,
        [category]: { done: !wasOn, points },
      };
      updated.total = calcTotal(updated);
      syncScore(memberId, category, points, 1);
      return { ...prev, [memberId]: updated };
    });
  };

  const handleRecitationChange = (memberId: string, delta: number) => {
    if (isLocked) return;
    // 결석 상태면 입력 차단
    if (scores[memberId]?.attendance.status === 'absent') return;
    navigator.vibrate?.(10);
    setScores((prev) => {
      const current = prev[memberId];
      if (!current) return prev;
      const newMult = Math.max(0, current.recitation.multiplier + delta);
      const points = 100 * newMult;
      const updated = {
        ...current,
        recitation: { multiplier: newMult, points },
      };
      updated.total = calcTotal(updated);
      syncScore(memberId, 'recitation', 100, newMult);
      return { ...prev, [memberId]: updated };
    });
  };

  const handleSubmit = async () => {
    if (!currentClub || !selectedTeamId || !selectedRoomId || !teacher) return;
    // flush pending syncs - 대기 중인 sync를 즉시 실행
    const flushPromises: Promise<void>[] = [];
    for (const [key, timeout] of pendingSyncs.current) {
      clearTimeout(timeout);
      // key format: "memberId-category"
      const dashIdx = key.indexOf('-');
      const memberId = key.slice(0, dashIdx);
      const category = key.slice(dashIdx + 1);
      const memberScore = scores[memberId];
      if (memberScore && category) {
        const cat = category as ScoringCategory;
        let basePoints = 0;
        let multiplier = 1;
        if (cat === 'attendance') {
          basePoints = memberScore.attendance.points;
        } else if (cat === 'handbook') {
          basePoints = memberScore.handbook.points;
        } else if (cat === 'uniform') {
          basePoints = memberScore.uniform.points;
        } else if (cat === 'recitation') {
          basePoints = 100;
          multiplier = memberScore.recitation.multiplier;
        }
        flushPromises.push(
          upsertScore({
            memberId,
            clubId: currentClub.id,
            trainingDate: selectedDate,
            category: cat,
            basePoints,
            multiplier,
            recordedBy: teacher.id,
          }).then(() => {}).catch(() => {})
        );
      }
    }
    pendingSyncs.current.clear();
    if (flushPromises.length > 0) {
      await Promise.all(flushPromises);
    }

    setSubmitting(true);
    try {
      await submitScores({
        clubId: currentClub.id,
        teamId: selectedTeamId,
        roomId: selectedRoomId,
        trainingDate: selectedDate,
        submittedBy: teacher.id,
      });
      setSubmission({ status: 'submitted' });
      setShowSubmitConfirm(false);
      toast.success('점수가 제출되었습니다');
    } catch {
      toast.error('제출 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopen = async () => {
    if (!selectedRoomId) return;
    try {
      await reopenSubmission({
        roomId: selectedRoomId,
        trainingDate: selectedDate,
      });
      setSubmission({ status: 'draft' });
      toast.success('수정 모드로 전환되었습니다');
    } catch {
      toast.error('전환 실패');
    }
  };

  const visibleTeams = isUnassigned ? teams : teams.filter(t => assignedTeamIds.includes(t.id));

  // 배정된 반이 1개면 자동 선택
  useEffect(() => {
    if (!isUnassigned && visibleTeams.length === 1) {
      setSelectedTeamId(visibleTeams[0].id);
    }
  }, [isUnassigned, visibleTeams]);

  const teamTotal = filteredMembers.reduce(
    (sum, m) => sum + (scores[m.id]?.total ?? 0),
    0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="pb-20">
      {isOffline && <OfflineBanner pendingCount={pendingCount} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">반별 점수</h1>
        <DatePickerWithToday
          value={selectedDate}
          onChange={setSelectedDate}
          className="px-2 py-1"
        />
      </div>

      {/* Team tabs - 2개 이상일 때만 표시 */}
      {(isUnassigned || visibleTeams.length >= 2) && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
          <button
            onClick={() => setSelectedTeamId(null)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors',
              !selectedTeamId ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'
            )}
          >
            전체
          </button>
          {visibleTeams.map((team) => (
            <button
              key={team.id}
              onClick={() => setSelectedTeamId(team.id)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors',
                selectedTeamId === team.id
                  ? 'text-white'
                  : 'bg-gray-100 text-gray-700'
              )}
              style={selectedTeamId === team.id ? { backgroundColor: team.color } : undefined}
            >
              {team.name}
            </button>
          ))}
        </div>
      )}

      {/* Unassigned banner */}
      {isUnassigned && (
        isReadOnly ? (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-700 font-medium">반 배정 후 입력이 가능합니다</p>
            <p className="text-xs text-amber-600 mt-0.5">현재 열람 전용 모드입니다</p>
          </div>
        ) : (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700 font-medium">내 학급 없음</p>
            <p className="text-xs text-blue-600 mt-0.5">관리 메뉴에서 학급을 배정한 후 점수를 입력할 수 있습니다</p>
          </div>
        )
      )}

      {/* Rejected banner */}
      {submission?.status === 'rejected' && submission.rejectionNote && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700 font-medium">반려됨</p>
          <p className="text-xs text-red-600 mt-0.5">사유: {submission.rejectionNote}</p>
          <button onClick={handleReopen} className="mt-2 text-xs text-red-700 underline font-medium">수정 후 재제출하기</button>
        </div>
      )}

      {/* Submitted/Approved lock banner */}
      {(submission?.status === 'submitted' || submission?.status === 'approved') && (
        <div className={`mb-4 p-3 rounded-lg border ${
          submission.status === 'submitted' ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'
        }`}>
          <p className={`text-sm font-medium ${
            submission.status === 'submitted' ? 'text-blue-700' : 'text-green-700'
          }`}>
            {submission.status === 'submitted' ? '제출 완료 - 승인 대기 중 (수정 불가)' : '승인 완료 (수정 불가)'}
          </p>
        </div>
      )}

      {/* Badge review banner (서기/감독관 전용) */}
      {canReview && (
        <BadgeReviewBanner
          pendingCount={badgePendingCount}
          requests={badgeRequests.filter((r) => r.status === 'requested')}
          onApprove={approveBadge}
          onReject={rejectBadge}
        />
      )}

      {/* Member cards */}
      <div className="space-y-3">
        {filteredMembers.map((member) => {
          const s = scores[member.id];
          if (!s) return null;
          const team = teams.find((t) => t.id === member.team_id);

          return (
            <div key={member.id} data-testid={`member-card-${member.id}`} className="bg-white rounded-xl border border-gray-200 p-3">
              {/* Member header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {team && (
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: team.color }}
                    />
                  )}
                  <button onClick={() => openMemberProfile(member.id)} className="flex items-center gap-2 hover:opacity-80">
                    <Avatar name={member.name} src={member.avatar_url} size="sm" />
                    <span className="font-semibold text-gray-900 text-sm">{member.name}</span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span data-testid={`member-total-${member.id}`} className="text-sm font-bold text-indigo-600">{s.total}pt</span>
                  {!isLocked && (
                    <button
                      type="button"
                      data-testid={`badge-open-${member.id}`}
                      onClick={() => setBadgeMemberId(badgeMemberId === member.id ? null : member.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-amber-100 text-xs active:scale-95 touch-manipulation"
                      title="뱃지 신청"
                    >
                      🏅
                    </button>
                  )}
                </div>
              </div>

              {/* Score chips */}
              {(() => {
                const isAbsent = s.attendance.status === 'absent';
                const absentDim = isAbsent && 'opacity-30 pointer-events-none grayscale';
                return (
                  <div className="grid grid-cols-4 gap-2">
                    {/* Attendance */}
                    <button
                      type="button"
                      data-testid={`attendance-btn-${member.id}`}
                      onClick={() => handleAttendanceTap(member.id)}
                      disabled={isLocked}
                      className={cn(
                        'flex flex-col items-center justify-center rounded-lg px-1 py-2 border-2 transition-all duration-300 active:scale-95 select-none touch-manipulation',
                        ATTENDANCE_COLORS[s.attendance.status],
                        isLocked && 'opacity-60 cursor-not-allowed'
                      )}
                    >
                      <span className="text-[10px] font-medium">출석</span>
                      <span className="text-base font-bold">{s.attendance.points}</span>
                      <span className="text-[10px]">{ATTENDANCE_LABELS[s.attendance.status]}</span>
                    </button>

                    {/* Handbook */}
                    <button
                      type="button"
                      data-testid={`handbook-btn-${member.id}`}
                      onClick={() => handleToggle(member.id, 'handbook')}
                      disabled={isLocked || isAbsent}
                      className={cn(
                        'flex flex-col items-center justify-center rounded-lg px-1 py-2 border-2 transition-all duration-300 active:scale-95 select-none touch-manipulation',
                        s.handbook.done
                          ? 'bg-green-100 text-green-800 border-green-400'
                          : 'bg-gray-100 text-gray-500 border-transparent',
                        isLocked && 'opacity-60 cursor-not-allowed',
                        absentDim
                      )}
                    >
                      <span className="text-[10px] font-medium">핸드북</span>
                      <span className="text-base font-bold">{s.handbook.points}</span>
                      <span className="text-[10px]">{s.handbook.done ? '✓' : '✗'}</span>
                    </button>

                    {/* Uniform */}
                    <button
                      type="button"
                      data-testid={`uniform-btn-${member.id}`}
                      onClick={() => handleToggle(member.id, 'uniform')}
                      disabled={isLocked || isAbsent}
                      className={cn(
                        'flex flex-col items-center justify-center rounded-lg px-1 py-2 border-2 transition-all duration-300 active:scale-95 select-none touch-manipulation',
                        s.uniform.done
                          ? 'bg-green-100 text-green-800 border-green-400'
                          : 'bg-gray-100 text-gray-500 border-transparent',
                        isLocked && 'opacity-60 cursor-not-allowed',
                        absentDim
                      )}
                    >
                      <span className="text-[10px] font-medium">단복</span>
                      <span className="text-base font-bold">{s.uniform.points}</span>
                      <span className="text-[10px]">{s.uniform.done ? '✓' : '✗'}</span>
                    </button>

                    {/* Recitation */}
                    <button
                      type="button"
                      data-testid={`recitation-btn-${member.id}`}
                      onClick={() =>
                        !isAbsent && setRecitationMemberId(
                          recitationMemberId === member.id ? null : member.id
                        )
                      }
                      disabled={isLocked || isAbsent}
                      className={cn(
                        'flex flex-col items-center justify-center rounded-lg px-1 py-2 border-2 transition-all duration-300 active:scale-95 select-none touch-manipulation',
                        s.recitation.multiplier > 0
                          ? 'bg-green-100 text-green-800 border-green-400'
                          : 'bg-gray-100 text-gray-500 border-transparent',
                        isLocked && 'opacity-60 cursor-not-allowed',
                        absentDim
                      )}
                    >
                      <span className="text-[10px] font-medium">암송</span>
                      <span className="text-base font-bold">{s.recitation.points}</span>
                      {s.recitation.multiplier > 0 && (
                        <span className="text-[10px] text-indigo-600">x{s.recitation.multiplier}</span>
                      )}
                    </button>
                  </div>
                );
              })()}

              {/* Recitation stepper (inline expand) */}
              {recitationMemberId === member.id && (
                <div className="mt-2 flex items-center justify-center gap-4 py-2 bg-indigo-50 rounded-lg">
                  <button
                    type="button"
                    data-testid={`recitation-minus-${member.id}`}
                    onClick={() => handleRecitationChange(member.id, -1)}
                    className="w-12 h-12 rounded-full bg-white border-2 border-gray-300 text-xl font-bold text-gray-700 active:scale-95 touch-manipulation"
                  >
                    −
                  </button>
                  <div className="text-center">
                    <p data-testid={`recitation-count-${member.id}`} className="text-2xl font-bold text-indigo-700">{s.recitation.multiplier}</p>
                    <p className="text-xs text-gray-500">구절</p>
                  </div>
                  <button
                    type="button"
                    data-testid={`recitation-plus-${member.id}`}
                    onClick={() => handleRecitationChange(member.id, 1)}
                    className="w-12 h-12 rounded-full bg-indigo-600 text-white text-xl font-bold active:scale-95 touch-manipulation"
                  >
                    +
                  </button>
                </div>
              )}

              {/* Badge request panel (inline expand) */}
              <BadgeRequestPanel
                memberId={member.id}
                memberName={member.name}
                memberAvatarUrl={member.avatar_url}
                isOpen={badgeMemberId === member.id}
                onClose={() => setBadgeMemberId(null)}
                badges={allBadges}
                existingBadgeIds={memberBadgeMap[member.id] || []}
                existingRequestIds={
                  (memberRequestMap[member.id] || [])
                    .filter((r) => r.status === 'requested')
                    .map((r) => r.badge_id)
                }
                memberRequests={memberRequestMap[member.id] || []}
                onSubmit={async (badgeId, note) => {
                  await submitRequest(member.id, badgeId, note);
                  // 신청 후 해당 멤버의 request 데이터 갱신
                  try {
                    const updated = await getMemberBadgeRequests(member.id);
                    setMemberRequestMap((prev) => ({ ...prev, [member.id]: updated }));
                  } catch {}
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between z-20">
        <div>
          <span className="text-sm text-gray-500">팀 합계</span>
          <span data-testid="team-total" className="ml-2 text-lg font-bold text-indigo-600">{teamTotal.toLocaleString()}pt</span>
        </div>
        <div className="flex items-center gap-2">
          {submission?.status && (
            <span data-testid="submission-status" className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              submission.status === 'draft' ? 'bg-gray-100 text-gray-600' :
              submission.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
              submission.status === 'approved' ? 'bg-green-100 text-green-700' :
              'bg-red-100 text-red-700'
            }`}>
              {submission.status === 'draft' ? '작성중' :
               submission.status === 'submitted' ? '제출됨' :
               submission.status === 'approved' ? '승인됨' : '반려됨'}
            </span>
          )}
          {!isLocked && selectedTeamId && selectedRoomId && (
            <button
              data-testid="submit-scores-btn"
              onClick={() => setShowSubmitConfirm(true)}
              disabled={submitting}
              className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg active:scale-95 touch-manipulation disabled:opacity-50"
            >
              {submitting ? '제출중...' : '제출'}
            </button>
          )}
          {!selectedTeamId && <span className="text-xs text-gray-400">팀을 선택하세요</span>}
          {isLocked && !isUnassigned && <span className="text-xs text-green-600 font-medium">자동 저장됨</span>}
        </div>
      </div>

      {/* Submit confirmation modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">점수를 제출하시겠습니까?</h3>
            <p className="text-sm text-gray-500 mb-4">제출 후에는 수정이 불가합니다. 관리자 승인 후 점수가 확정됩니다.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium"
              >
                취소
              </button>
              <button
                data-testid="submit-confirm-btn"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {submitting ? '제출중...' : '제출하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
