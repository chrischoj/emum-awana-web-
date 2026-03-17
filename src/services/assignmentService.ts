import { supabase } from '../lib/supabase';
import type { TeacherRoomAssignment, ActiveTeacherAssignment, AssignmentType } from '../types/awana';

/** 특정 교사의 현재 유효 배정 조회 (active_teacher_assignments 뷰 사용) */
export async function getActiveAssignments(teacherId: string): Promise<ActiveTeacherAssignment[]> {
  const { data, error } = await supabase
    .from('active_teacher_assignments')
    .select('*')
    .eq('teacher_id', teacherId);
  if (error) throw error;
  return (data as ActiveTeacherAssignment[]) || [];
}

/** 특정 방의 현재 배정된 교사 목록 */
export async function getRoomAssignments(roomId: string): Promise<(ActiveTeacherAssignment & { teacher_name: string })[]> {
  // active_teacher_assignments 뷰에서 room_id로 필터 + teachers 테이블 JOIN해서 teacher_name 가져오기
  // 또는 별도 쿼리: teacher_room_assignments + teachers JOIN
  const { data, error } = await supabase
    .from('active_teacher_assignments')
    .select('*')
    .eq('room_id', roomId);
  if (error) throw error;

  // teacher 이름도 필요하므로 teacher_id들로 teachers 조회
  if (!data || data.length === 0) return [];

  const teacherIds = data.map(d => d.teacher_id);
  const { data: teachers } = await supabase
    .from('teachers')
    .select('id, name, avatar_url')
    .in('id', teacherIds);

  const teacherMap = new Map((teachers || []).map(t => [t.id, t]));

  return data.map(d => ({
    ...d,
    teacher_name: teacherMap.get(d.teacher_id)?.name || '알 수 없음',
    teacher_avatar_url: teacherMap.get(d.teacher_id)?.avatar_url || null,
  }));
}

/** 클럽 전체의 교사-방 배정 현황 (관리자용) */
export async function getAllAssignmentsByClub(clubId: string): Promise<ActiveTeacherAssignment[]> {
  const { data, error } = await supabase
    .from('active_teacher_assignments')
    .select('*')
    .eq('club_id', clubId);
  if (error) throw error;
  return (data as ActiveTeacherAssignment[]) || [];
}

/** 미배정 교사 목록 (active 배정이 없는 교사) */
export async function getUnassignedTeachers(clubId: string): Promise<{ id: string; name: string }[]> {
  // 1. 클럽의 모든 활성 교사 조회
  const { data: allTeachers, error: teacherError } = await supabase
    .from('teachers')
    .select('id, name')
    .eq('club_id', clubId)
    .eq('active', true);
  if (teacherError) throw teacherError;

  // 2. 현재 배정된 교사 ID 조회
  const { data: assigned, error: assignedError } = await supabase
    .from('active_teacher_assignments')
    .select('teacher_id')
    .eq('club_id', clubId);
  if (assignedError) throw assignedError;

  const assignedIds = new Set((assigned || []).map(a => a.teacher_id));

  // 3. 배정 안 된 교사만 반환
  return (allTeachers || []).filter(t => !assignedIds.has(t.id));
}

/** 담임 배정 생성 */
export async function createAssignment(params: {
  teacherId: string;
  roomId: string;
  assignmentType: AssignmentType;
  effectiveDate?: string;
  endDate?: string | null;
  createdBy: string;
}): Promise<TeacherRoomAssignment> {
  const { data, error } = await supabase
    .from('teacher_room_assignments')
    .insert({
      teacher_id: params.teacherId,
      room_id: params.roomId,
      assignment_type: params.assignmentType,
      effective_date: params.effectiveDate || new Date().toISOString().split('T')[0],
      end_date: params.endDate || null,
      created_by: params.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data as TeacherRoomAssignment;
}

/** 배정 종료 (end_date를 오늘로 설정) */
export async function endAssignment(assignmentId: string): Promise<void> {
  const { error } = await supabase
    .from('teacher_room_assignments')
    .update({ end_date: new Date().toISOString().split('T')[0], updated_at: new Date().toISOString() })
    .eq('id', assignmentId);
  if (error) throw error;
}

/** 배정 삭제 */
export async function deleteAssignment(assignmentId: string): Promise<void> {
  const { error } = await supabase
    .from('teacher_room_assignments')
    .delete()
    .eq('id', assignmentId);
  if (error) throw error;
}

/** 배정 수정 */
export async function updateAssignment(
  assignmentId: string,
  updates: {
    assignmentType?: AssignmentType;
    effectiveDate?: string;
    endDate?: string | null;
  }
): Promise<TeacherRoomAssignment> {
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.assignmentType !== undefined) updateData.assignment_type = updates.assignmentType;
  if (updates.effectiveDate !== undefined) updateData.effective_date = updates.effectiveDate;
  if (updates.endDate !== undefined) updateData.end_date = updates.endDate;

  const { data, error } = await supabase
    .from('teacher_room_assignments')
    .update(updateData)
    .eq('id', assignmentId)
    .select()
    .single();
  if (error) throw error;
  return data as TeacherRoomAssignment;
}
