import { supabase } from '../lib/supabase';
import type { Notification, NotificationType } from '../types/awana';

/** 단일 알림 생성 */
export async function createNotification(params: {
  recipientId: string;
  type: NotificationType;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    recipient_id: params.recipientId,
    type: params.type,
    title: params.title,
    body: params.body || null,
    metadata: params.metadata || {},
  });
  if (error) console.error('알림 생성 실패:', error);
}

/** 다수 수신자에게 동일 알림 생성 */
export async function createNotifications(params: {
  recipientIds: string[];
  type: NotificationType;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (params.recipientIds.length === 0) return;
  const records = params.recipientIds.map((recipientId) => ({
    recipient_id: recipientId,
    type: params.type,
    title: params.title,
    body: params.body || null,
    metadata: params.metadata || {},
  }));
  const { error } = await supabase.from('notifications').insert(records);
  if (error) console.error('알림 일괄 생성 실패:', error);
}

/** 미읽음 알림 조회 */
export async function getUnreadNotifications(recipientId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', recipientId)
    .eq('read', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as Notification[]) || [];
}

/** 알림 목록 조회 (최근 50개) */
export async function getNotifications(recipientId: string, limit = 50): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', recipientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Notification[]) || [];
}

/** 단일 알림 읽음 처리 */
export async function markAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);
  if (error) throw error;
}

/** 전체 알림 읽음 처리 */
export async function markAllAsRead(recipientId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('recipient_id', recipientId)
    .eq('read', false);
  if (error) throw error;
}

/** admin 교사 ID 목록 조회 */
export async function getAdminTeacherIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('teachers')
    .select('id')
    .eq('role', 'admin')
    .eq('active', true);
  if (error) throw error;
  return (data || []).map((t) => t.id);
}

/** 특정 클럽의 교사 ID 목록 (게임 잠금 알림용 - teacher_room_assignments 기반) */
export async function getClubTeacherIds(clubId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('teachers')
    .select('id')
    .eq('active', true)
    .neq('role', 'admin');
  if (error) throw error;
  // 모든 활성 교사에게 알림 (클럽별 필터링은 추후 필요 시 추가)
  return (data || []).map((t) => t.id);
}

/** 팀 이름 조회 */
export async function getTeamName(teamId: string): Promise<string> {
  const { data } = await supabase.from('teams').select('name').eq('id', teamId).single();
  return data?.name || '팀';
}

/** 오래된 읽은 알림 정리 (3일 이상) */
export async function cleanupOldNotifications(recipientId: string): Promise<void> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from('notifications')
    .delete()
    .eq('recipient_id', recipientId)
    .eq('read', true)
    .lt('created_at', threeDaysAgo);
}

/** 클럽 이름 조회 */
export async function getClubName(clubId: string): Promise<string> {
  const { data } = await supabase.from('clubs').select('name').eq('id', clubId).single();
  return data?.name || '클럽';
}
