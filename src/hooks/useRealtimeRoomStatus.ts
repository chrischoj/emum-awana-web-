import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { RoomSession, RoomTeacher } from '../types/awana';

interface RoomStatus {
  sessions: RoomSession[];
  teachers: RoomTeacher[];
}

export function useRealtimeRoomStatus() {
  const [status, setStatus] = useState<RoomStatus>({ sessions: [], teachers: [] });

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];

    // Initial load
    Promise.all([
      supabase.from('room_sessions').select('*').eq('training_date', today).eq('status', 'active'),
      supabase.from('room_teachers').select('*'),
    ]).then(([sessionsRes, teachersRes]) => {
      setStatus({
        sessions: (sessionsRes.data as RoomSession[]) || [],
        teachers: (teachersRes.data as RoomTeacher[]) || [],
      });
    });

    const sessionsChannel = supabase
      .channel('room-sessions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_sessions' }, () => {
        supabase
          .from('room_sessions')
          .select('*')
          .eq('training_date', today)
          .eq('status', 'active')
          .then(({ data }) => setStatus((prev) => ({ ...prev, sessions: (data as RoomSession[]) || [] })));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_teachers' }, () => {
        supabase
          .from('room_teachers')
          .select('*')
          .then(({ data }) => setStatus((prev) => ({ ...prev, teachers: (data as RoomTeacher[]) || [] })));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionsChannel);
    };
  }, []);

  return status;
}
