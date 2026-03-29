import type { AwardsData } from '../types/awana';

const CONFIRMED_KEY = 'awana-ceremony-confirmed';

export interface ConfirmedCeremony {
  data: AwardsData;
  confirmedAt: string;      // ISO date string
  dateFrom: string;         // aggregation date range
  dateTo: string;
}

/** Save confirmed ceremony data */
export function saveConfirmedCeremony(
  data: AwardsData,
  dateFrom: string,
  dateTo: string
): ConfirmedCeremony {
  const confirmed: ConfirmedCeremony = {
    data,
    confirmedAt: new Date().toISOString(),
    dateFrom,
    dateTo,
  };
  localStorage.setItem(CONFIRMED_KEY, JSON.stringify(confirmed));
  return confirmed;
}

/** Load the latest confirmed ceremony data */
export function loadConfirmedCeremony(): ConfirmedCeremony | null {
  try {
    const raw = localStorage.getItem(CONFIRMED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConfirmedCeremony;
    if (parsed?.data?.handbook?.sparks && parsed?.data?.game?.sparks) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Check if there is a confirmed ceremony */
export function hasConfirmedCeremony(): boolean {
  return loadConfirmedCeremony() !== null;
}

/** Clear confirmed ceremony data */
export function clearConfirmedCeremony(): void {
  localStorage.removeItem(CONFIRMED_KEY);
}
