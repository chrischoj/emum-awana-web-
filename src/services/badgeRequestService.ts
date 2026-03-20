import { supabase } from '../lib/supabase';
import type { BadgeRequest } from '../types/awana';
import { createNotification, createNotifications } from './notificationService';

/** admin role 또는 승인 가능 position의 교사 ID 조회 */
async function getBadgeApproverIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('teachers')
    .select('id')
    .or('role.eq.admin,position.in.(서기,감독관,조정관)');
  if (error) return [];
  return (data || []).map((t) => t.id);
}

// ---- 조회 ----

export async function getBadgeRequests(filters?: {
  status?: string;
  memberId?: string;
}): Promise<(BadgeRequest & { badge: { id: string; name: string; category: string | null }; member: { id: string; name: string; avatar_url: string | null }; requester: { id: string; name: string } })[]> {
  let query = supabase
    .from('badge_requests')
    .select('*, badge:badges(id, name, category), member:members(id, name, avatar_url), requester:teachers!requested_by(id, name)')
    .order('created_at', { ascending: false });

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.memberId) query = query.eq('member_id', filters.memberId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getMemberBadgeRequests(memberId: string): Promise<(BadgeRequest & { badge: { id: string; name: string; category: string | null } })[]> {
  const { data, error } = await supabase
    .from('badge_requests')
    .select('*, badge:badges(id, name, category)')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getPendingBadgeRequestCount(): Promise<number> {
  const { count, error } = await supabase
    .from('badge_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'requested');
  if (error) throw error;
  return count || 0;
}

/** 여러 멤버의 뱃지 신청을 한 번에 조회 (N+1 쿼리 방지) */
export async function getBatchMemberBadgeRequests(memberIds: string[]): Promise<Record<string, (BadgeRequest & { badge: { id: string; name: string; category: string | null } })[]>> {
  if (memberIds.length === 0) return {};
  const { data, error } = await supabase
    .from('badge_requests')
    .select('*, badge:badges(id, name, category)')
    .in('member_id', memberIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const map: Record<string, (BadgeRequest & { badge: { id: string; name: string; category: string | null } })[]> = {};
  for (const id of memberIds) map[id] = [];
  for (const row of (data || []) as any[]) {
    if (map[row.member_id]) map[row.member_id].push(row);
    else map[row.member_id] = [row];
  }
  return map;
}

// ---- 신청 ----

export async function createBadgeRequest(params: {
  memberId: string;
  badgeId: string;
  requestedBy: string;
  note?: string;
}): Promise<BadgeRequest> {
  const { data, error } = await supabase
    .from('badge_requests')
    .insert({
      member_id: params.memberId,
      badge_id: params.badgeId,
      requested_by: params.requestedBy,
      note: params.note || null,
    })
    .select()
    .single();
  if (error) throw error;

  // 승인 권한자에게 알림 발송
  try {
    const approverIds = await getBadgeApproverIds();
    // 신청자 본인은 제외
    const recipients = approverIds.filter((id) => id !== params.requestedBy);
    if (recipients.length > 0) {
      // 멤버 이름 조회
      const { data: memberData } = await supabase
        .from('members')
        .select('name')
        .eq('id', params.memberId)
        .single();
      const memberName = memberData?.name || '학생';

      await createNotifications({
        recipientIds: recipients,
        type: 'badge_requested',
        title: `🏅 ${memberName} 뱃지 신청`,
        body: params.note || undefined,
        metadata: { badgeRequestId: data.id, memberId: params.memberId },
      });
    }
  } catch {
    // 알림 실패는 무시 (신청 자체는 성공)
  }

  return data as BadgeRequest;
}

// ---- 승인/반려 ----

export async function approveBadgeRequest(params: {
  requestId: string;
  approvedBy: string;
}): Promise<void> {
  // 1. 요청 조회
  const { data: request, error: fetchErr } = await supabase
    .from('badge_requests')
    .select('member_id, badge_id')
    .eq('id', params.requestId)
    .single();
  if (fetchErr) throw fetchErr;

  // 2. 상태 업데이트
  const { error: updateErr } = await supabase
    .from('badge_requests')
    .update({
      status: 'approved',
      approved_by: params.approvedBy,
    })
    .eq('id', params.requestId);
  if (updateErr) throw updateErr;

  // 3. member_badges에 자동 INSERT (UNIQUE 제약으로 중복 방지)
  const { error: awardErr } = await supabase
    .from('member_badges')
    .upsert(
      {
        member_id: request.member_id,
        badge_id: request.badge_id,
        awarded_by: params.approvedBy,
        note: '뱃지 신청 승인',
      },
      { onConflict: 'member_id,badge_id' }
    );
  if (awardErr) throw awardErr;

  // 신청 교사에게 승인 알림
  try {
    const { data: reqData } = await supabase
      .from('badge_requests')
      .select('requested_by, badge:badges(name), member:members(name)')
      .eq('id', params.requestId)
      .single();
    if (reqData?.requested_by && reqData.requested_by !== params.approvedBy) {
      const badgeName = (reqData.badge as any)?.name || '뱃지';
      const memberName = (reqData.member as any)?.name || '학생';
      await createNotification({
        recipientId: reqData.requested_by,
        type: 'badge_approved',
        title: `✅ ${memberName} - ${badgeName} 승인`,
        metadata: { badgeRequestId: params.requestId },
      });
    }
  } catch {
    // 알림 실패는 무시
  }
}

export async function rejectBadgeRequest(params: {
  requestId: string;
  rejectedBy: string;
  rejectionNote?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('badge_requests')
    .update({
      status: 'rejected',
      approved_by: params.rejectedBy,
      rejection_note: params.rejectionNote || null,
    })
    .eq('id', params.requestId);
  if (error) throw error;

  // 신청 교사에게 반려 알림
  try {
    const { data: reqData } = await supabase
      .from('badge_requests')
      .select('requested_by, badge:badges(name), member:members(name)')
      .eq('id', params.requestId)
      .single();
    if (reqData?.requested_by && reqData.requested_by !== params.rejectedBy) {
      const badgeName = (reqData.badge as any)?.name || '뱃지';
      const memberName = (reqData.member as any)?.name || '학생';
      await createNotification({
        recipientId: reqData.requested_by,
        type: 'badge_rejected',
        title: `❌ ${memberName} - ${badgeName} 반려`,
        body: params.rejectionNote || undefined,
        metadata: { badgeRequestId: params.requestId },
      });
    }
  } catch {
    // 알림 실패는 무시
  }
}
