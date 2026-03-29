import { supabase } from '../lib/supabase';
import type { AwardsData, TeamName } from '../types/awana';

export interface BonusDetail {
  team: TeamName;
  club: 'sparks' | 'tnt';
  points: number;
  reason: string;
}

export interface ConfirmedCeremony {
  id?: string;
  data: AwardsData;
  confirmedAt: string;
  dateFrom: string;
  dateTo: string;
  bonusDetails?: BonusDetail[];
}

/** Save confirmed ceremony to Supabase + localStorage cache */
export async function saveConfirmedCeremony(
  data: AwardsData,
  dateFrom: string,
  dateTo: string,
  bonusDetails?: BonusDetail[],
): Promise<ConfirmedCeremony> {
  const now = new Date().toISOString();

  // Supabase insert
  const { data: row, error } = await supabase
    .from('ceremony_confirmations')
    .insert({
      date_from: dateFrom,
      date_to: dateTo,
      scores: data,
      bonus_details: bonusDetails || [],
      confirmed_at: now,
    })
    .select()
    .single();

  if (error) {
    console.error('ceremony_confirmations insert error:', error);
  }

  const confirmed: ConfirmedCeremony = {
    id: row?.id,
    data,
    confirmedAt: now,
    dateFrom,
    dateTo,
    bonusDetails,
  };

  // localStorage fallback cache
  try {
    localStorage.setItem('awana-ceremony-confirmed', JSON.stringify(confirmed));
  } catch { /* ignore */ }

  return confirmed;
}

/** Load the latest confirmed ceremony from Supabase (fallback to localStorage) */
export async function loadConfirmedCeremony(): Promise<ConfirmedCeremony | null> {
  try {
    const { data, error } = await supabase
      .from('ceremony_confirmations')
      .select('*')
      .order('confirmed_at', { ascending: false })
      .limit(1)
      .single();

    if (!error && data) {
      return {
        id: data.id,
        data: data.scores as AwardsData,
        confirmedAt: data.confirmed_at,
        dateFrom: data.date_from,
        dateTo: data.date_to,
        bonusDetails: data.bonus_details as BonusDetail[] | undefined,
      };
    }
  } catch { /* fall through to localStorage */ }

  // localStorage fallback
  return loadConfirmedCeremonyLocal();
}

/** Sync load from localStorage only (for initial render / non-async contexts) */
export function loadConfirmedCeremonyLocal(): ConfirmedCeremony | null {
  try {
    const raw = localStorage.getItem('awana-ceremony-confirmed');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConfirmedCeremony;
    if (parsed?.data?.handbook?.sparks && parsed?.data?.game?.sparks) return parsed;
    return null;
  } catch {
    return null;
  }
}
