import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { deactivateTeacherSessions } from '../services/checkInService';
import type { Teacher, UserRole } from '../types/awana';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  teacher: Teacher | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string, phone?: string, clubId?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshTeacher: (userId?: string) => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchingRef = useRef(false);

  useEffect(() => {
    // onAuthStateChange만 사용 (INITIAL_SESSION 이벤트로 getSession() 역할도 수행)
    // getSession() + onAuthStateChange 이중 호출 race condition 제거
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchTeacher(session.user.id);
      } else {
        setTeacher(null);
        setRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchTeacher(userId: string) {
    // 중복 호출 방지
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      setTeacher(data as Teacher);
      setRole((data as Teacher).role);
    } catch {
      setTeacher(null);
      // teachers 테이블에 없으면 이미 가진 user 정보에서 role 확인
      // (catch 내에서 추가 네트워크 호출하면 이중 hang 위험)
      const currentUser = user;
      if (currentUser?.user_metadata?.role === 'member') {
        setRole('member');
      } else {
        setRole(null);
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }

  async function refreshTeacher(userId?: string) {
    const id = userId || user?.id;
    if (id) {
      await fetchTeacher(id);
    }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  }

  async function signUp(email: string, password: string, name: string, phone?: string, clubId?: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: new Error(error.message) };

    if (data.user) {
      const { error: teacherError } = await supabase.from('teachers').insert({
        user_id: data.user.id,
        name,
        phone: phone || null,
        club_id: clubId || null,
        role: 'teacher',
      });
      if (teacherError) return { error: new Error(teacherError.message) };
    }
    return { error: null };
  }

  async function signOut() {
    // 로그아웃 전에 활성 세션 정리 (교사가 빠지면 교실 비활성화)
    if (teacher?.id) {
      try {
        await deactivateTeacherSessions(teacher.id);
      } catch (err) {
        console.warn('[SignOut] 활성 세션 정리 실패:', err);
      }
      localStorage.removeItem('awana_auto_checkin');
    }

    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setTeacher(null);
    setRole(null);
  }

  async function changePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error ? new Error(error.message) : null };
  }

  return (
    <AuthContext.Provider value={{ session, user, teacher, role, loading, signIn, signUp, signOut, refreshTeacher, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
