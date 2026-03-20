import { supabase } from '../lib/supabase';
import type { Badge, MemberBadge, ClubType, ClubStage, BadgeType, BadgeGroup } from '../types/awana';

export async function getBadges(): Promise<Badge[]> {
  const { data, error } = await supabase.from('badges').select('*').order('name');
  if (error) throw error;
  return (data as Badge[]) || [];
}

export async function createBadge(badge: Omit<Badge, 'id' | 'created_at'>): Promise<Badge> {
  const { data, error } = await supabase.from('badges').insert(badge).select().single();
  if (error) throw error;
  return data as Badge;
}

export async function awardBadge(params: {
  memberId: string;
  badgeId: string;
  awardedBy?: string;
  note?: string;
}): Promise<MemberBadge> {
  const { data, error } = await supabase
    .from('member_badges')
    .insert({
      member_id: params.memberId,
      badge_id: params.badgeId,
      awarded_by: params.awardedBy || null,
      note: params.note || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as MemberBadge;
}

export async function getMemberBadges(memberId: string): Promise<(MemberBadge & { badge: Badge })[]> {
  const { data, error } = await supabase
    .from('member_badges')
    .select('*, badge:badges(*)')
    .eq('member_id', memberId)
    .order('awarded_date', { ascending: false });
  if (error) throw error;
  return (data as (MemberBadge & { badge: Badge })[]) || [];
}

export async function updateBadge(
  id: string,
  data: Partial<Omit<Badge, 'id' | 'created_at'>>
): Promise<Badge> {
  const { data: updated, error } = await supabase
    .from('badges')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return updated as Badge;
}

export async function deleteBadge(id: string): Promise<void> {
  const { error } = await supabase
    .from('badges')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function getBadgesByCategory(category: string): Promise<Badge[]> {
  const { data, error } = await supabase
    .from('badges')
    .select('*')
    .eq('category', category)
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return (data as Badge[]) || [];
}

export async function getClubStages(clubType: ClubType): Promise<ClubStage[]> {
  const { data, error } = await supabase
    .from('club_stages')
    .select('*')
    .eq('club_type', clubType)
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

export async function getBadgesByStageAndGroup(stageId: string, badgeGroup?: BadgeGroup): Promise<Badge[]> {
  let query = supabase
    .from('badges')
    .select('*, stage:club_stages(*)')
    .eq('stage_id', stageId)
    .order('badge_group')
    .order('sort_order');
  if (badgeGroup) {
    query = query.eq('badge_group', badgeGroup);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getBadgesByClubType(clubType: ClubType): Promise<Badge[]> {
  const { data, error } = await supabase
    .from('badges')
    .select('*, stage:club_stages!inner(*)')
    .eq('stage.club_type', clubType)
    .order('sort_order', { referencedTable: 'club_stages' })
    .order('badge_group')
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

/** 여러 멤버의 뱃지를 한 번에 조회 (N+1 쿼리 방지) */
export async function getBatchMemberBadges(memberIds: string[]): Promise<Record<string, string[]>> {
  if (memberIds.length === 0) return {};
  const { data, error } = await supabase
    .from('member_badges')
    .select('member_id, badge_id')
    .in('member_id', memberIds);
  if (error) throw error;
  const map: Record<string, string[]> = {};
  for (const id of memberIds) map[id] = [];
  for (const row of data || []) {
    if (map[row.member_id]) map[row.member_id].push(row.badge_id);
    else map[row.member_id] = [row.badge_id];
  }
  return map;
}

export async function createBadgeWithStage(badge: {
  name: string;
  badge_type: BadgeType;
  badge_group: BadgeGroup;
  stage_id: string;
  description?: string;
  icon_url?: string;
  sort_order?: number;
}): Promise<Badge> {
  const { data, error } = await supabase
    .from('badges')
    .insert(badge)
    .select('*, stage:club_stages(*)')
    .single();
  if (error) throw error;
  return data;
}
