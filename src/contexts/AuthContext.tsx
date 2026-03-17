import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
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
  refreshTeacher: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchTeacher(session.user.id);
      } else {
        setLoading(false);
      }
    });

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
      setRole(null);
    } finally {
      setLoading(false);
    }
  }

  async function refreshTeacher() {
    if (user) {
      await fetchTeacher(user.id);
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
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setTeacher(null);
    setRole(null);
  }

  return (
    <AuthContext.Provider value={{ session, user, teacher, role, loading, signIn, signUp, signOut, refreshTeacher }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
