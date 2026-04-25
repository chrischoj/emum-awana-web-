import { supabase } from '../lib/supabase';
import {
  DEFAULT_CEREMONY_EFFECT_SELECTION,
  isCeremonyEffectSelection,
  resolveCeremonyEffect,
} from '../config/ceremonyEffects';
import type { CeremonyEffectPresetId, CeremonyEffectSelection } from '../config/ceremonyEffects';
import type { AwardsData, TeamName } from '../types/awana';

const CONFIRMED_CEREMONY_KEY = 'awana-ceremony-confirmed';
const CEREMONY_EFFECT_SELECTION_KEY = 'awana-ceremony-effect-selection';

export interface BonusDetail {
  team: TeamName;
  club: 'sparks' | 'tnt';
  category: 'handbook' | 'game';
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
  effectSelection?: CeremonyEffectSelection;
  effectPreset?: CeremonyEffectPresetId;
}

export function getStoredCeremonyEffectSelection(): CeremonyEffectSelection {
  try {
    const raw = localStorage.getItem(CEREMONY_EFFECT_SELECTION_KEY);
    return isCeremonyEffectSelection(raw) ? raw : DEFAULT_CEREMONY_EFFECT_SELECTION;
  } catch {
    return DEFAULT_CEREMONY_EFFECT_SELECTION;
  }
}

export function setStoredCeremonyEffectSelection(selection: CeremonyEffectSelection) {
  try {
    localStorage.setItem(CEREMONY_EFFECT_SELECTION_KEY, selection);
  } catch { /* ignore */ }
}

/** Save confirmed ceremony to Supabase + localStorage cache */
export async function saveConfirmedCeremony(
  data: AwardsData,
  dateFrom: string,
  dateTo: string,
  bonusDetails?: BonusDetail[],
  effectSelection: CeremonyEffectSelection = getStoredCeremonyEffectSelection(),
): Promise<ConfirmedCeremony> {
  const now = new Date().toISOString();
  const effectPreset = resolveCeremonyEffect(effectSelection, now);

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
    effectSelection,
    effectPreset,
  };

  // localStorage fallback cache
  try {
    setStoredCeremonyEffectSelection(effectSelection);
    localStorage.setItem(CONFIRMED_CEREMONY_KEY, JSON.stringify(confirmed));
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
      const effectSelection = getStoredCeremonyEffectSelection();
      return {
        id: data.id,
        data: data.scores as AwardsData,
        confirmedAt: data.confirmed_at,
        dateFrom: data.date_from,
        dateTo: data.date_to,
        bonusDetails: data.bonus_details as BonusDetail[] | undefined,
        effectSelection,
        effectPreset: resolveCeremonyEffect(effectSelection, data.confirmed_at),
      };
    }
  } catch { /* fall through to localStorage */ }

  // localStorage fallback
  return loadConfirmedCeremonyLocal();
}

/** Sync load from localStorage only (for initial render / non-async contexts) */
export function loadConfirmedCeremonyLocal(): ConfirmedCeremony | null {
  try {
    const raw = localStorage.getItem(CONFIRMED_CEREMONY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConfirmedCeremony;
    if (parsed?.data?.handbook?.sparks && parsed?.data?.game?.sparks) {
      const effectSelection = getStoredCeremonyEffectSelection();
      return {
        ...parsed,
        effectSelection,
        effectPreset: resolveCeremonyEffect(effectSelection, parsed.confirmedAt),
      };
    }
    return null;
  } catch {
    return null;
  }
}
