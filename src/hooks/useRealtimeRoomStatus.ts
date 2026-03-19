import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getToday } from '../lib/utils';
import type { RoomSession, RoomTeacher } from '../types/awana';

interface RoomStatus {
  sessions: RoomSession[];
  teachers: RoomTeacher[];
}

/** 오늘 활성 세션의 교사만 조회하는 헬퍼 */
async function fetchTeachersForSessions(sessions: RoomSession[]): Promise<RoomTeacher[]> {
  if (sessions.length === 0) return [];
  const sessionIds = sessions.map(s => s.id);
  const { data } = await supabase
    .from('room_teachers')
    .select('*')
    .in('room_session_id', sessionIds);
  return (data as RoomTeacher[]) || [];
}

export function useRealtimeRoomStatus() {
  const [status, setStatus] = useState<RoomStatus>({ sessions: [], teachers: [] });

  useEffect(() => {
    const today = getToday();

    // Initial load: sessions 먼저 → sessionIds로 teachers 필터
    supabase
      .from('room_sessions')
      .select('*')
      .eq('training_date', today)
      .eq('status', 'active')
      .then(async ({ data: sessionsData }) => {
        const sessions = (sessionsData as RoomSession[]) || [];
        const teachers = await fetchTeachersForSessions(sessions);
        setStatus({ sessions, teachers });
      });

    // Realtime: sessions 변경 시 teachers도 함께 갱신
    const sessionsChannel = supabase
      .channel('room-sessions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_sessions' }, () => {
        supabase
          .from('room_sessions')
          .select('*')
          .eq('training_date', today)
          .eq('status', 'active')
          .then(async ({ data }) => {
            const sessions = (data as RoomSession[]) || [];
            const teachers = await fetchTeachersForSessions(sessions);
            setStatus({ sessions, teachers });
          });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_teachers' }, () => {
        // room_teachers 변경 시: 현재 sessions 기준으로 teachers만 리페치
        setStatus((prev) => {
          fetchTeachersForSessions(prev.sessions).then((teachers) => {
            setStatus((curr) => ({ ...curr, teachers }));
          });
          return prev;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionsChannel);
    };
  }, []);

  return status;
}
