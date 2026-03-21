import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatPoints(points: number): string {
  return points.toLocaleString('ko-KR');
}

export function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 팀 이름 정렬: R, B, G, Y 순 */
const TEAM_NAME_ORDER: Record<string, number> = { R: 0, B: 1, G: 2, Y: 3 };
export function teamColorOrder(name: string): number {
  return TEAM_NAME_ORDER[name.charAt(0).toUpperCase()] ?? 99;
}
export function sortTeamsByColor<T extends { name: string }>(teams: T[]): T[] {
  return [...teams].sort((a, b) => teamColorOrder(a.name) - teamColorOrder(b.name) || a.name.localeCompare(b.name));
}
