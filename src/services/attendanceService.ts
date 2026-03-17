import { supabase } from '../lib/supabase';
import type { MemberAttendanceRecord, AttendanceStatus } from '../types/awana';

export async function getAttendanceByDate(
  trainingDate: string,
  clubId?: string
): Promise<MemberAttendanceRecord[]> {
  let query = supabase
    .from('member_attendance')
    .select('*, members!inner(club_id)')
    .eq('training_date', trainingDate);

  if (clubId) {
    query = query.eq('members.club_id', clubId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as MemberAttendanceRecord[]) || [];
}

export async function recordAttendance(params: {
  memberId: string;
  trainingDate: string;
  status: AttendanceStatus;
  absenceReason?: string;
}): Promise<MemberAttendanceRecord> {
  const present = params.status === 'present';
  const { data, error } = await supabase
    .from('member_attendance')
    .upsert(
      {
        member_id: params.memberId,
        training_date: params.trainingDate,
        present,
        status: params.status,
        absence_reason: params.absenceReason || null,
      },
      { onConflict: 'member_id,training_date' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as MemberAttendanceRecord;
}

export async function bulkRecordAttendance(
  memberIds: string[],
  trainingDate: string,
  status: AttendanceStatus
): Promise<void> {
  const records = memberIds.map((memberId) => ({
    member_id: memberId,
    training_date: trainingDate,
    present: status === 'present',
    status,
    absence_reason: null,
  }));

  const { error } = await supabase
    .from('member_attendance')
    .upsert(records, { onConflict: 'member_id,training_date' });

  if (error) throw error;
}

export async function getLateTracking(
  memberId: string,
  semester: string
): Promise<{ late_count: number; converted_absences: number }> {
  const { data, error } = await supabase
    .from('late_absence_tracking')
    .select('late_count, converted_absences')
    .eq('member_id', memberId)
    .eq('semester', semester)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || { late_count: 0, converted_absences: 0 };
}

export async function incrementLateCount(
  memberId: string,
  semester: string
): Promise<{ late_count: number; converted_absences: number }> {
  const current = await getLateTracking(memberId, semester);
  const newLateCount = current.late_count + 1;
  const newConverted = Math.floor(newLateCount / 3);

  const { data, error } = await supabase
    .from('late_absence_tracking')
    .upsert(
      {
        member_id: memberId,
        semester,
        late_count: newLateCount,
        converted_absences: newConverted,
      },
      { onConflict: 'member_id,semester' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as { late_count: number; converted_absences: number };
}

export function getAttendancePoints(status: AttendanceStatus, basePoints = 50): number {
  switch (status) {
    case 'present': return basePoints;
    case 'late': return 0;
    case 'absent': return 0;
    case 'none': return 0;
  }
}
