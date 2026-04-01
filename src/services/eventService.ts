import { supabase } from '../lib/supabase';
import type { AwanaEvent, EventParticipant, EventStatus, EventParticipantRole } from '../types/awana';

// 활성 이벤트 조회 (Teacher 홈 배너용)
export async function getActiveEvents(): Promise<AwanaEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .in('status', ['upcoming', 'active'])
    .eq('visibility', true)
    .order('start_date', { ascending: true });

  if (error) throw error;
  return (data as AwanaEvent[]) || [];
}

// 전체 이벤트 조회 (Admin용)
export async function getAllEvents(): Promise<AwanaEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('start_date', { ascending: false });

  if (error) throw error;
  return (data as AwanaEvent[]) || [];
}

// 이벤트 상세 조회
export async function getEventById(eventId: string): Promise<AwanaEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as AwanaEvent;
}

// 이벤트 참가자 조회 (member/teacher JOIN)
export async function getEventParticipants(eventId: string): Promise<EventParticipant[]> {
  const { data, error } = await supabase
    .from('event_participants')
    .select('*, member:members(*), teacher:teachers(*)')
    .eq('event_id', eventId)
    .order('role', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data as unknown as EventParticipant[]) || [];
}

// 이벤트 생성
export async function createEvent(
  event: Omit<AwanaEvent, 'id' | 'created_at' | 'updated_at'>
): Promise<AwanaEvent> {
  const { data, error } = await supabase
    .from('events')
    .insert(event)
    .select()
    .single();

  if (error) throw error;
  return data as AwanaEvent;
}

// 이벤트 수정
export async function updateEvent(
  eventId: string,
  updates: Partial<Pick<AwanaEvent, 'name' | 'description' | 'start_date' | 'end_date' | 'status' | 'visibility' | 'metadata'>>
): Promise<AwanaEvent> {
  const { data, error } = await supabase
    .from('events')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .select()
    .single();

  if (error) throw error;
  return data as AwanaEvent;
}

// 참가자 일괄 추가
export async function addParticipants(
  eventId: string,
  participants: Array<{
    member_id?: string;
    teacher_id?: string;
    club_type: 'sparks' | 'tnt';
    role: string;
    sub_group?: string;
  }>
): Promise<void> {
  const memberRecords = participants
    .filter((p) => p.member_id)
    .map((p) => ({
      event_id: eventId,
      member_id: p.member_id!,
      teacher_id: null,
      club_type: p.club_type,
      role: p.role,
      sub_group: p.sub_group || null,
    }));

  const teacherRecords = participants
    .filter((p) => p.teacher_id)
    .map((p) => ({
      event_id: eventId,
      member_id: null,
      teacher_id: p.teacher_id!,
      club_type: p.club_type,
      role: p.role,
      sub_group: p.sub_group || null,
    }));

  if (memberRecords.length > 0) {
    const { error } = await supabase
      .from('event_participants')
      .upsert(memberRecords, { onConflict: 'event_id,member_id' });
    if (error) throw error;
  }

  if (teacherRecords.length > 0) {
    const { error } = await supabase
      .from('event_participants')
      .upsert(teacherRecords, { onConflict: 'event_id,teacher_id' });
    if (error) throw error;
  }
}

// 참가자 제거
export async function removeParticipant(participantId: string): Promise<void> {
  const { error } = await supabase
    .from('event_participants')
    .delete()
    .eq('id', participantId);

  if (error) throw error;
}

// 이벤트 삭제
export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId);

  if (error) throw error;
}
