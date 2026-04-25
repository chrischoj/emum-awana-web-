export const CEREMONY_EFFECT_RANDOM = 'random' as const;

export const CEREMONY_EFFECT_PRESETS = [
  {
    id: 'champion-orbit',
    name: '챔피언 오비트',
    badge: '현재',
    description: '선수 얼굴이 중앙으로 모였다가 퍼지고, 컨페티와 함께 우승팀을 크게 보여주는 현재 연출',
  },
  {
    id: 'golden-spotlight',
    name: '골든 스포트라이트',
    badge: '신규',
    description: '금빛 조명과 별빛 파티클로 우승팀 얼굴과 점수를 더 또렷하게 띄우는 집중형 연출',
  },
] as const;

export type CeremonyEffectPresetId = (typeof CEREMONY_EFFECT_PRESETS)[number]['id'];
export type CeremonyEffectSelection = CeremonyEffectPresetId | typeof CEREMONY_EFFECT_RANDOM;

export const DEFAULT_CEREMONY_EFFECT_SELECTION: CeremonyEffectSelection = 'champion-orbit';
export const DEFAULT_CEREMONY_EFFECT_PRESET: CeremonyEffectPresetId = 'champion-orbit';

export const CEREMONY_EFFECT_OPTIONS: Array<{
  id: CeremonyEffectSelection;
  name: string;
  badge: string;
  description: string;
}> = [
  {
    id: CEREMONY_EFFECT_RANDOM,
    name: '랜덤',
    badge: '추천',
    description: '확정할 때 등록된 효과 중 하나를 자동 선택합니다',
  },
  ...CEREMONY_EFFECT_PRESETS,
];

export function isCeremonyEffectPresetId(value: unknown): value is CeremonyEffectPresetId {
  return CEREMONY_EFFECT_PRESETS.some((preset) => preset.id === value);
}

export function isCeremonyEffectSelection(value: unknown): value is CeremonyEffectSelection {
  return value === CEREMONY_EFFECT_RANDOM || isCeremonyEffectPresetId(value);
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function resolveCeremonyEffect(
  selection: CeremonyEffectSelection,
  seed = new Date().toISOString(),
): CeremonyEffectPresetId {
  if (selection !== CEREMONY_EFFECT_RANDOM) return selection;
  const index = hashSeed(seed) % CEREMONY_EFFECT_PRESETS.length;
  return CEREMONY_EFFECT_PRESETS[index]?.id ?? DEFAULT_CEREMONY_EFFECT_PRESET;
}

export function getCeremonyEffectPreset(id: CeremonyEffectPresetId) {
  return CEREMONY_EFFECT_PRESETS.find((preset) => preset.id === id) ?? CEREMONY_EFFECT_PRESETS[0];
}
