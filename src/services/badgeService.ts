import { supabase } from '../lib/supabase';
import type { Badge, MemberBadge } from '../types/awana';

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
