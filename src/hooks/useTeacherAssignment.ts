import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useClub } from '../contexts/ClubContext';
import { getActiveAssignments } from '../services/assignmentService';
import type { ActiveTeacherAssignment, TeacherAssignmentInfo } from '../types/awana';

export function useTeacherAssignment(): TeacherAssignmentInfo & {
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
} {
  const { teacher, role } = useAuth();
  const { members, teams, currentClub } = useClub();
  const [assignments, setAssignments] = useState<ActiveTeacherAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadAssignments = useCallback(async () => {
    if (!teacher) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(false);
      const data = await getActiveAssignments(teacher.id);
      setAssignments(data);
    } catch (err) {
      console.error('Failed to load teacher assignments:', err);
      setAssignments([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [teacher]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const info = useMemo((): TeacherAssignmentInfo => {
    // 현재 클럽에 해당하는 배정만 필터
    const clubAssignments = currentClub
      ? assignments.filter(a => a.club_id === currentClub.id)
      : assignments;

    const teamIds = [...new Set(clubAssignments.map(a => a.team_id))];
    const roomIds = [...new Set(clubAssignments.map(a => a.room_id))];
    const hasAssignments = teamIds.length > 0;

    // 관리자: 배정 없으면 미배정이지만, 전체 팀 접근 가능 + 읽기전용 아님
    if (role === 'admin' && !hasAssignments) {
      return {
        assignedTeamIds: teams.map(t => t.id),
        assignedRoomIds: [],
        primaryAssignments: [],
        temporaryAssignments: [],
        assignedMembers: [],
        isUnassigned: true,
        isReadOnly: false,
      };
    }

    const isUnassigned = !hasAssignments;

    return {
      assignedTeamIds: teamIds,
      assignedRoomIds: roomIds,
      primaryAssignments: clubAssignments.filter(a => a.assignment_type === 'primary'),
      temporaryAssignments: clubAssignments.filter(a => a.assignment_type === 'temporary'),
      assignedMembers: isUnassigned
        ? members  // 미배정: 전체 멤버 (열람 전용)
        : roomIds.length > 0
          ? members.filter(m => m.room_id != null && roomIds.includes(m.room_id))
          : members.filter(m => m.team_id != null && teamIds.includes(m.team_id)),
      isUnassigned,
      isReadOnly: isUnassigned && role !== 'admin',
    };
  }, [assignments, members, teams, role, currentClub]);

  return {
    ...info,
    loading,
    error,
    refresh: loadAssignments,
  };
}
