import { supabase } from '../lib/supabase';
import { getToday } from '../lib/utils';

/**
 * 교사를 특정 교실에 체크인합니다.
 * room_sessions find-or-create + room_teachers upsert
 * DB UNIQUE 제약으로 중복 안전
 */
export async function checkInTeacherToRoom(roomId: string, teacherId: string): Promise<void> {
  const today = getToday();

  // 1. Find or create today's session (ensure status = 'active')
  let { data: existingSession } = await supabase
    .from('room_sessions')
    .select('id, status')
    .eq('room_id', roomId)
    .eq('training_date', today)
    .single();

  if (!existingSession) {
    const { data: newSession } = await supabase
      .from('room_sessions')
      .insert({ room_id: roomId, training_date: today, status: 'active' })
      .select('id')
      .single();
    existingSession = newSession;
  } else if (existingSession.status !== 'active') {
    // 비활성 세션이 있으면 재활성화
    await supabase
      .from('room_sessions')
      .update({ status: 'active' })
      .eq('id', existingSession.id);
  }

  if (!existingSession) {
    throw new Error('세션 생성 실패');
  }

  // 2. Upsert teacher check-in
  const { error } = await supabase.from('room_teachers').upsert(
    {
      room_session_id: existingSession.id,
      teacher_id: teacherId,
    },
    { onConflict: 'room_session_id,teacher_id' }
  );

  if (error) throw error;
}

/**
 * 교사를 여러 교실에 일괄 체크인합니다.
 * 실패한 교실은 무시하고 성공한 교실만 처리
 */
export async function checkInTeacherToRooms(roomIds: string[], teacherId: string): Promise<void> {
  const results = await Promise.allSettled(
    roomIds.map(roomId => checkInTeacherToRoom(roomId, teacherId))
  );

  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    console.warn(`[AutoCheckIn] ${failures.length}/${roomIds.length} 교실 체크인 실패`);
  }
}
