import { createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useClub } from './ClubContext';
import { getActiveAssignments } from '../services/assignmentService';
import type { ActiveTeacherAssignment, TeacherAssignmentInfo } from '../types/awana';

interface TeacherAssignmentContextValue extends TeacherAssignmentInfo {
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
}

const TeacherAssignmentContext = createContext<TeacherAssignmentContextValue | null>(null);

export function TeacherAssignmentProvider({ children }: { children: ReactNode }) {
  const { teacher, role } = useAuth();
  const { members, teams, currentClub } = useClub();
  const [assignments, setAssignments] = useState<ActiveTeacherAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // 초기 로드 (stale 보호)
  useEffect(() => {
    if (!teacher) {
      setLoading(false);
      return;
    }

    let stale = false;
    setLoading(true);
    setError(false);

    getActiveAssignments(teacher.id)
      .then((data) => {
        if (!stale) setAssignments(data);
      })
      .catch((err) => {
        if (!stale) {
          console.error('Failed to load teacher assignments:', err);
          setAssignments([]);
          setError(true);
        }
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });

    return () => { stale = true; };
  }, [teacher]);

  // 수동 새로고침용
  const refresh = useCallback(async () => {
    if (!teacher) return;
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

  const info = useMemo((): TeacherAssignmentInfo => {
    const clubAssignments = currentClub
      ? assignments.filter(a => a.club_id === currentClub.id)
      : assignments;

    const teamIds = [...new Set(clubAssignments.map(a => a.team_id))];
    const roomIds = [...new Set(clubAssignments.map(a => a.room_id))];
    const hasAssignments = teamIds.length > 0;

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
        ? members
        : members.filter(m =>
            (m.room_id != null && roomIds.includes(m.room_id)) ||
            (!m.room_id && m.team_id != null && teamIds.includes(m.team_id))
          ),
      isUnassigned,
      isReadOnly: isUnassigned && role !== 'admin',
    };
  }, [assignments, members, teams, role, currentClub]);

  const value = useMemo(() => ({
    ...info,
    loading,
    error,
    refresh,
  }), [info, loading, error, refresh]);

  return (
    <TeacherAssignmentContext.Provider value={value}>
      {children}
    </TeacherAssignmentContext.Provider>
  );
}

export function useTeacherAssignment(): TeacherAssignmentContextValue {
  const ctx = useContext(TeacherAssignmentContext);
  if (!ctx) throw new Error('useTeacherAssignment must be used within TeacherAssignmentProvider');
  return ctx;
}
