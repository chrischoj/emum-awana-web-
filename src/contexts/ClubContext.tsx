import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Club, CurriculumTemplate, Team, Member } from '../types/awana';

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
  const [clubs, setClubs] = useState<Club[]>([]);
  const [currentClub, setCurrentClub] = useState<Club | null>(null);
  const [curriculumTemplate, setCurriculumTemplate] = useState<CurriculumTemplate | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Load clubs on mount
  useEffect(() => {
    async function loadClubs() {
      const { data } = await supabase.from('clubs').select('*');
      const clubList = (data as Club[]) || [];
      setClubs(clubList);
      if (clubList.length > 0 && !currentClub) {
        setCurrentClub(clubList[0]);
      }
      setLoading(false);
    }
    loadClubs();
  }, []);

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
