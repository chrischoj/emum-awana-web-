import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { deactivateTeacherSessions } from '../services/checkInService';
import { clearLastRoute } from '../hooks/useRouteRestore';
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
  const teacherRef = useRef<Teacher | null>(null);

  // 마지막으로 유효했던 user id를 기억 (토큰 갱신 실패 시 보호용)
  const lastValidUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // onAuthStateChange만 사용 (INITIAL_SESSION 이벤트로 getSession() 역할도 수행)
    // getSession() + onAuthStateChange 이중 호출 race condition 제거
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // TOKEN_REFRESHED 실패 등으로 session이 null이 되는 경우:
      // 명시적 SIGNED_OUT이 아니면 기존 상태 유지 (모바일 백그라운드 복귀 보호)
      if (!session && event !== 'SIGNED_OUT' && lastValidUserIdRef.current) {
        // 세션 복구 시도 (localStorage에 저장된 Supabase 세션)
        supabase.auth.getSession().then(({ data: { session: recovered } }) => {
          if (recovered) {
            setSession(recovered);
            setUser(recovered.user);
            lastValidUserIdRef.current = recovered.user.id;
          }
          // 복구 실패 시에도 기존 teacher 상태를 유지 (강제 로그아웃 방지)
        });
        return;
      }

      // 토큰 갱신(TOKEN_REFRESHED)인 경우: 동일 유저면 session만 조용히 교체, re-render 최소화
      if (event === 'TOKEN_REFRESHED' && session?.user && lastValidUserIdRef.current === session.user.id) {
        setSession(session);
        // user/teacher는 변하지 않으므로 건드리지 않음
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        lastValidUserIdRef.current = session.user.id;
        fetchTeacher(session.user.id);
      } else {
        lastValidUserIdRef.current = null;
        setTeacher(null);
        setRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 모바일 백그라운드→포그라운드 복귀 시 세션 갱신
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      // 백그라운드 복귀 시 세션을 proactive하게 갱신
      supabase.auth.getSession().then(({ data: { session: freshSession } }) => {
        if (freshSession) {
          setSession(freshSession);
          setUser(freshSession.user);
          lastValidUserIdRef.current = freshSession.user.id;
          // teacher가 없는 경우에만 다시 fetch (정상 상태면 skip)
          if (!teacherRef.current && freshSession.user) {
            fetchTeacher(freshSession.user.id);
          }
        }
      });
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  async function fetchTeacher(userId: string) {
    // 중복 호출 방지
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    // 이미 teacher가 있으면 loading 스피너를 보여주지 않고 백그라운드 갱신
    const hasExisting = !!teacherRef.current;
    if (!hasExisting) setLoading(true);

    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      const t = data as Teacher;

      // 데이터가 실제로 변경된 경우에만 상태 업데이트 (불필요한 re-render 방지)
      if (!teacherRef.current || teacherRef.current.id !== t.id || teacherRef.current.role !== t.role || teacherRef.current.name !== t.name || teacherRef.current.position !== t.position) {
        setTeacher(t);
        setRole(t.role);
      }
      teacherRef.current = t;
    } catch {
      // 이미 teacher가 있으면 네트워크 실패 시 기존 상태 유지
      if (!hasExisting) {
        setTeacher(null);
        teacherRef.current = null;
        // teachers 테이블에 없으면 이미 가진 user 정보에서 role 확인
        const currentUser = user;
        if (currentUser?.user_metadata?.role === 'member') {
          setRole('member');
        } else {
          setRole(null);
        }
      }
    } finally {
      if (!hasExisting) setLoading(false);
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
    teacherRef.current = null;
    setRole(null);
    clearLastRoute(); // 로그아웃 시 저장된 경로 삭제 (재로그인 시 홈으로)
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
