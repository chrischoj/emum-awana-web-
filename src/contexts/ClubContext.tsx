import { createContext, useContext, useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Club, CurriculumTemplate, Team, Member } from '../types/awana';
import { useAuth } from './AuthContext';

const CACHE_KEY = 'awana_club_cache';

interface CachedClubData {
  clubs: Club[];
  currentClubId: string | null;
  curriculumTemplate: CurriculumTemplate | null;
  teams: Team[];
  members: Member[];
  timestamp: number;
}

function loadCache(): CachedClubData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedClubData;
  } catch {
    return null;
  }
}

function saveCache(data: CachedClubData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable
  }
}

// Keep the same interface
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

  // Initialize state from cache for instant display
  const cachedRef = useRef(loadCache());
  const initialCache = cachedRef.current;

  const [clubs, setClubs] = useState<Club[]>(initialCache?.clubs || []);
  const [currentClub, setCurrentClubState] = useState<Club | null>(
    initialCache?.clubs?.find(c => c.id === initialCache?.currentClubId) || null
  );
  const [curriculumTemplate, setCurriculumTemplate] = useState<CurriculumTemplate | null>(
    initialCache?.curriculumTemplate || null
  );
  const [teams, setTeams] = useState<Team[]>(initialCache?.teams || []);
  const [members, setMembers] = useState<Member[]>(initialCache?.members || []);
  // If cache exists, don't show loading spinner initially
  const [loading, setLoading] = useState(!initialCache);

  // Track clubs fetch result for parallel loading
  const [clubsFetched, setClubsFetched] = useState<Club[] | null>(null);
  // 이미 데이터 로드가 완료된 teacher id 추적 (불필요한 재로드 방지)
  const loadedForTeacherRef = useRef<string | null>(null);

  // Stage 1: Fetch clubs immediately on mount (no auth dependency)
  useEffect(() => {
    supabase.from('clubs').select('*').then(({ data }) => {
      const clubList = (data as Club[]) || [];
      setClubs(clubList);
      setClubsFetched(clubList);
    });
  }, []);

  // Stage 2: Once auth + clubs both ready, determine currentClub + load clubData in ONE pass
  useEffect(() => {
    if (authLoading || !clubsFetched) return;

    async function loadAll() {
      const clubList = clubsFetched!;
      if (clubList.length === 0) {
        setLoading(false);
        return;
      }

      // 같은 teacher에 대해 이미 로드 완료된 경우 → 재로드 skip (백그라운드 복귀 보호)
      if (teacher && loadedForTeacherRef.current === teacher.id && currentClub) {
        return;
      }

      // Determine target club via assignment
      let targetClubId: string | null = null;
      if (teacher) {
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
      if (!targetClubId && teacher?.club_id) {
        targetClubId = teacher.club_id;
      }

      const matchedClub = targetClubId
        ? clubList.find(c => c.id === targetClubId)
        : null;
      const resolved = matchedClub || clubList[0];
      setCurrentClubState(resolved);

      // If not authenticated, skip RLS-protected queries
      if (!teacher) {
        setCurriculumTemplate(null);
        setTeams([]);
        setMembers([]);
        setLoading(false);
        loadedForTeacherRef.current = null;
        return;
      }

      // Fetch clubData in the SAME pass (no second useEffect cycle)
      const [templateRes, teamsRes, membersRes] = await Promise.all([
        supabase
          .from('curriculum_templates')
          .select('*')
          .eq('club_type', resolved.type)
          .single(),
        supabase
          .from('teams')
          .select('*')
          .eq('club_id', resolved.id)
          .order('name'),
        supabase
          .from('members')
          .select('*')
          .eq('club_id', resolved.id)
          .eq('active', true)
          .eq('enrollment_status', 'active')
          .order('name'),
      ]);

      const newTemplate = (templateRes.data as CurriculumTemplate) || null;
      const newTeams = (teamsRes.data as Team[]) || [];
      const newMembers = (membersRes.data as Member[]) || [];

      setCurriculumTemplate(newTemplate);
      setTeams(newTeams);
      setMembers(newMembers);
      setLoading(false);
      loadedForTeacherRef.current = teacher?.id || null;

      // Update cache
      saveCache({
        clubs: clubList,
        currentClubId: resolved.id,
        curriculumTemplate: newTemplate,
        teams: newTeams,
        members: newMembers,
        timestamp: Date.now(),
      });
    }

    loadAll();
  }, [authLoading, clubsFetched, teacher]);

  // Manual club change handler - loads clubData immediately
  const setCurrentClub = useCallback(async (club: Club | null) => {
    // 같은 클럽이면 불필요한 재쿼리 방지
    if (club && currentClub && club.id === currentClub.id) return;

    setCurrentClubState(club);

    if (!club || !teacher) {
      setCurriculumTemplate(null);
      setTeams([]);
      setMembers([]);
      return;
    }

    setLoading(true);
    const [templateRes, teamsRes, membersRes] = await Promise.all([
      supabase
        .from('curriculum_templates')
        .select('*')
        .eq('club_type', club.type)
        .single(),
      supabase
        .from('teams')
        .select('*')
        .eq('club_id', club.id)
        .order('name'),
      supabase
        .from('members')
        .select('*')
        .eq('club_id', club.id)
        .eq('active', true)
        .eq('enrollment_status', 'active')
        .order('name'),
    ]);

    const newTemplate = (templateRes.data as CurriculumTemplate) || null;
    const newTeams = (teamsRes.data as Team[]) || [];
    const newMembers = (membersRes.data as Member[]) || [];

    setCurriculumTemplate(newTemplate);
    setTeams(newTeams);
    setMembers(newMembers);
    setLoading(false);

    // Update cache with new club selection
    saveCache({
      clubs,
      currentClubId: club.id,
      curriculumTemplate: newTemplate,
      teams: newTeams,
      members: newMembers,
      timestamp: Date.now(),
    });
  }, [teacher, clubs, currentClub]);

  const refreshMembers = useCallback(async () => {
    if (!currentClub) return;
    const { data } = await supabase
      .from('members')
      .select('*')
      .eq('club_id', currentClub.id)
      .eq('active', true)
      .eq('enrollment_status', 'active')
      .order('name');
    setMembers((data as Member[]) || []);
  }, [currentClub]);

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
