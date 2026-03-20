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
 * 교사 로그아웃 시 활성 세션을 정리합니다.
 * 1. 오늘 활성 세션에서 해당 교사의 room_teachers 레코드 삭제
 * 2. 남은 교사가 없는 세션은 status='inactive'로 비활성화
 */
export async function deactivateTeacherSessions(teacherId: string): Promise<void> {
  const today = getToday();

  // 1. 오늘의 활성 세션 ID 목록
  const { data: activeSessions } = await supabase
    .from('room_sessions')
    .select('id')
    .eq('training_date', today)
    .eq('status', 'active');

  if (!activeSessions?.length) return;

  const sessionIds = activeSessions.map(s => s.id);

  // 2. 이 교사의 체크인 레코드 삭제 (삭제된 행 반환)
  const { data: deleted } = await supabase
    .from('room_teachers')
    .delete()
    .eq('teacher_id', teacherId)
    .in('room_session_id', sessionIds)
    .select('room_session_id');

  if (!deleted?.length) return;

  // 3. 영향받은 세션에서 남은 교사 확인 → 0명이면 비활성화
  const affectedSessionIds = [...new Set(deleted.map(d => d.room_session_id))];

  for (const sessionId of affectedSessionIds) {
    const { count } = await supabase
      .from('room_teachers')
      .select('*', { count: 'exact', head: true })
      .eq('room_session_id', sessionId);

    if (count === 0) {
      await supabase
        .from('room_sessions')
        .update({ status: 'inactive', ended_at: new Date().toISOString() })
        .eq('id', sessionId);
    }
  }
}

/**
 * 오래된 활성 세션을 자동 정리합니다.
 * started_at 기준 maxAgeHours 이상 경과한 active 세션을 inactive로 변경.
 * 관리자 대시보드 로드 시 호출하여 좀비 세션 정리.
 */
export async function cleanupStaleSessions(maxAgeHours = 4): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

  // 오래된 active 세션 조회
  const { data: staleSessions } = await supabase
    .from('room_sessions')
    .select('id')
    .eq('status', 'active')
    .lt('started_at', cutoff);

  if (!staleSessions?.length) return 0;

  const staleIds = staleSessions.map(s => s.id);

  // 해당 세션의 room_teachers 레코드 삭제
  await supabase
    .from('room_teachers')
    .delete()
    .in('room_session_id', staleIds);

  // 세션 비활성화
  await supabase
    .from('room_sessions')
    .update({ status: 'inactive', ended_at: new Date().toISOString() })
    .in('id', staleIds);

  console.log(`[SessionCleanup] ${staleIds.length}개 오래된 세션 정리 완료`);
  return staleIds.length;
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
