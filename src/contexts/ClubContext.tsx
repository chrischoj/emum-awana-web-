import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Club, CurriculumTemplate, Team, Member } from '../types/awana';
import { useAuth } from './AuthContext';

interface ClubContextType {
  clubs: Club[];
  currentClub: Club | null;
  setCurrentClub: (club: Club | null) => void;
  curriculumTemplate: CurriculumTemplate | null;
  teams: Team[];
  members: Member[];
  loading: boolean;
  refreshMembers: () => Promise<void>;
}

const ClubContext = createContext<ClubContextType | undefined>(undefined);

export function ClubProvider({ children }: { children: ReactNode }) {
  const { teacher, role, loading: authLoading } = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [currentClub, setCurrentClub] = useState<Club | null>(null);
  const [curriculumTemplate, setCurriculumTemplate] = useState<CurriculumTemplate | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Load clubs on mount, after auth is ready
  useEffect(() => {
    async function loadClubs() {
      const { data } = await supabase.from('clubs').select('*');
      const clubList = (data as Club[]) || [];
      setClubs(clubList);

      if (clubList.length > 0 && !currentClub) {
        let targetClubId: string | null = null;

        // For non-admin teachers, check their room assignment first
        if (teacher && role !== 'admin') {
          try {
            const { data: assignments } = await supabase
              .from('active_teacher_assignments')
              .select('club_id')
              .eq('teacher_id', teacher.id)
              .limit(1);
            if (assignments && assignments.length > 0) {
              targetClubId = assignments[0].club_id;
            }
          } catch {
            // fallback below
          }
        }

        // Fallback to teacher's own club_id
        if (!targetClubId && teacher?.club_id) {
          targetClubId = teacher.club_id;
        }

        // Find matching club or default to first
        const matchedClub = targetClubId
          ? clubList.find(c => c.id === targetClubId)
          : null;
        setCurrentClub(matchedClub || clubList[0]);
      }
      setLoading(false);
    }

    // Wait for auth to finish loading before determining club
    if (!authLoading) {
      loadClubs();
    }
  }, [authLoading, teacher, role]);

  // When currentClub changes, reload template, teams, members
  useEffect(() => {
    if (!currentClub) {
      setCurriculumTemplate(null);
      setTeams([]);
      setMembers([]);
      return;
    }

    async function loadClubData() {
      setLoading(true);

      const [templateRes, teamsRes, membersRes] = await Promise.all([
        supabase
          .from('curriculum_templates')
          .select('*')
          .eq('club_type', currentClub!.type)
          .single(),
        supabase
          .from('teams')
          .select('*')
          .eq('club_id', currentClub!.id)
          .order('name'),
        supabase
          .from('members')
          .select('*')
          .eq('club_id', currentClub!.id)
          .eq('active', true)
          .eq('enrollment_status', 'active')
          .order('name'),
      ]);

      setCurriculumTemplate((templateRes.data as CurriculumTemplate) || null);
      setTeams((teamsRes.data as Team[]) || []);
      setMembers((membersRes.data as Member[]) || []);
      setLoading(false);
    }

    loadClubData();
  }, [currentClub]);

  async function refreshMembers() {
    if (!currentClub) return;
    const { data } = await supabase
      .from('members')
      .select('*')
      .eq('club_id', currentClub.id)
      .eq('active', true)
      .eq('enrollment_status', 'active')
      .order('name');
    setMembers((data as Member[]) || []);
  }

  return (
    <ClubContext.Provider value={{
      clubs, currentClub, setCurrentClub,
      curriculumTemplate, teams, members, loading, refreshMembers,
    }}>
      {children}
    </ClubContext.Provider>
  );
}

export function useClub() {
  const context = useContext(ClubContext);
  if (!context) throw new Error('useClub must be used within ClubProvider');
  return context;
}
