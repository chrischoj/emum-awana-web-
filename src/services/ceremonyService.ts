import { supabase } from '../lib/supabase';
import {
  DEFAULT_CEREMONY_EFFECT_SELECTION,
  isCeremonyEffectPresetId,
  isCeremonyEffectSelection,
  resolveCeremonyEffect,
} from '../config/ceremonyEffects';
import type { CeremonyEffectPresetId, CeremonyEffectSelection } from '../config/ceremonyEffects';
import type { AwardsData, TeamName } from '../types/awana';

const CONFIRMED_CEREMONY_KEY = 'awana-ceremony-confirmed';
const CEREMONY_EFFECT_SELECTION_KEY = 'awana-ceremony-effect-selection';

type CeremonyConfirmationRow = {
  id?: string;
  scores: AwardsData;
  confirmed_at: string;
  date_from: string;
  date_to: string;
  bonus_details?: BonusDetail[];
  effect_selection?: unknown;
  effect_preset?: unknown;
};

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

function resolveEffectForRecord(
  confirmedAt: string,
  effectSelectionValue?: unknown,
  effectPresetValue?: unknown,
): { effectSelection: CeremonyEffectSelection; effectPreset: CeremonyEffectPresetId } {
  const effectSelection = isCeremonyEffectSelection(effectSelectionValue)
    ? effectSelectionValue
    : getStoredCeremonyEffectSelection();

  return {
    effectSelection,
    effectPreset: isCeremonyEffectPresetId(effectPresetValue)
      ? effectPresetValue
      : resolveCeremonyEffect(effectSelection, confirmedAt),
  };
}

function toConfirmedCeremony(row: CeremonyConfirmationRow): ConfirmedCeremony {
  const { effectSelection, effectPreset } = resolveEffectForRecord(
    row.confirmed_at,
    row.effect_selection,
    row.effect_preset,
  );

  return {
    id: row.id,
    data: row.scores as AwardsData,
    confirmedAt: row.confirmed_at,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    bonusDetails: row.bonus_details as BonusDetail[] | undefined,
    effectSelection,
    effectPreset,
  };
}

function isMissingEffectColumnError(error: unknown): boolean {
  const message = typeof error === 'object' && error && 'message' in error
    ? String((error as { message?: unknown }).message)
    : String(error ?? '');
  return message.includes('effect_selection') || message.includes('effect_preset');
}

function updateLocalConfirmedEffect(
  id: string | undefined,
  effectSelection: CeremonyEffectSelection,
  effectPreset: CeremonyEffectPresetId,
) {
  try {
    const raw = localStorage.getItem(CONFIRMED_CEREMONY_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as ConfirmedCeremony;
    if (id && parsed.id && parsed.id !== id) return;
    localStorage.setItem(CONFIRMED_CEREMONY_KEY, JSON.stringify({
      ...parsed,
      effectSelection,
      effectPreset,
    }));
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

  const basePayload = {
    date_from: dateFrom,
    date_to: dateTo,
    scores: data,
    bonus_details: bonusDetails || [],
    confirmed_at: now,
  };

  // Supabase insert
  let { data: row, error } = await supabase
    .from('ceremony_confirmations')
    .insert({
      ...basePayload,
      effect_selection: effectSelection,
      effect_preset: effectPreset,
    })
    .select()
    .single();

  if (error && isMissingEffectColumnError(error)) {
    ({ data: row, error } = await supabase
      .from('ceremony_confirmations')
      .insert(basePayload)
      .select()
      .single());
  }

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
      return toConfirmedCeremony(data as CeremonyConfirmationRow);
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
      const { effectSelection, effectPreset } = resolveEffectForRecord(
        parsed.confirmedAt,
        parsed.effectSelection,
        parsed.effectPreset,
      );
      return {
        ...parsed,
        effectSelection,
        effectPreset,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function updateConfirmedCeremonyEffectSelection(
  confirmation: Pick<ConfirmedCeremony, 'id' | 'confirmedAt'> | null,
  effectSelection: CeremonyEffectSelection,
): Promise<CeremonyEffectPresetId> {
  const seed = confirmation?.confirmedAt ?? new Date().toISOString();
  const effectPreset = resolveCeremonyEffect(effectSelection, seed);

  setStoredCeremonyEffectSelection(effectSelection);
  updateLocalConfirmedEffect(confirmation?.id, effectSelection, effectPreset);

  if (confirmation?.id) {
    const { error } = await supabase
      .from('ceremony_confirmations')
      .update({
        effect_selection: effectSelection,
        effect_preset: effectPreset,
      })
      .eq('id', confirmation.id);

    if (error && !isMissingEffectColumnError(error)) {
      console.error('ceremony_confirmations effect update error:', error);
    }
  }

  return effectPreset;
}
