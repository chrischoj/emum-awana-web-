import type { ClubType, BadgeGroup } from '../types/awana';

// 스팍스 단계 정의
export const SPARKS_STAGES = [
  { key: 'hangglider', name: '행글라이더', sortOrder: 1 },
  { key: 'wingrunner', name: '윙러너', sortOrder: 2 },
  { key: 'skystormer', name: '스카이스토머', sortOrder: 3 },
] as const;

// T&T 단계 정의
export const TNT_STAGES = [
  { key: 'ad1', name: 'AD1 (어드벤처 1)', sortOrder: 1 },
  { key: 'ad2', name: 'AD2 (어드벤처 2)', sortOrder: 2 },
  { key: 'ch1', name: 'CH1 (챌린지 1)', sortOrder: 3 },
  { key: 'ch2', name: 'CH2 (챌린지 2)', sortOrder: 4 },
] as const;

// 클럽별 단계 매핑
export const STAGES_BY_CLUB: Record<ClubType, readonly { key: string; name: string; sortOrder: number }[]> = {
  sparks: SPARKS_STAGES,
  tnt: TNT_STAGES,
};

// 뱃지 그룹 설정
export interface BadgeGroupConfig {
  key: BadgeGroup;
  label: string;
  icon: string;       // emoji
  color: string;       // tailwind color class
  countPerStage: number;
  shared?: boolean;  // true면 단계별이 아닌 클럽 공유 리소스
}

// 스팍스 뱃지 그룹 (순서대로)
export const SPARKS_BADGE_GROUPS: BadgeGroupConfig[] = [
  { key: 'promotion', label: '승급', icon: '🏅', color: 'text-yellow-600', countPerStage: 1 },
  { key: 'podium', label: '수상대', icon: '🏆', color: 'text-purple-600', countPerStage: 1 },
  { key: 'gem', label: '보석', icon: '💎', color: 'text-red-500', countPerStage: 2 },
  { key: 'completion', label: '완성', icon: '🎖️', color: 'text-blue-600', countPerStage: 1 },
  { key: 'review', label: '복습', icon: '📖', color: 'text-green-600', countPerStage: 1 },
  { key: 'workbook', label: '워크북', icon: '📓', color: 'text-orange-600', countPerStage: 1 },
];

// T&T 뱃지 그룹 (순서대로)
export const TNT_BADGE_GROUPS: BadgeGroupConfig[] = [
  { key: 'podium', label: '수상대', icon: '🏆', color: 'text-purple-600', countPerStage: 1 },
  { key: 'completion', label: '완성', icon: '🎖️', color: 'text-blue-600', countPerStage: 1 },
  { key: 'review', label: '복습', icon: '📖', color: 'text-green-600', countPerStage: 1, shared: true },
  { key: 'currency', label: '실버/골드', icon: '🪙', color: 'text-amber-600', countPerStage: 2, shared: true },
  { key: 'multi_review', label: '멀티복습', icon: '🌟', color: 'text-indigo-600', countPerStage: 1, shared: true },
];

// 클럽별 뱃지 그룹 매핑
export const BADGE_GROUPS_BY_CLUB: Record<ClubType, BadgeGroupConfig[]> = {
  sparks: SPARKS_BADGE_GROUPS,
  tnt: TNT_BADGE_GROUPS,
};

// 모든 뱃지 그룹 라벨 매핑
export const BADGE_GROUP_LABELS: Record<BadgeGroup, string> = {
  promotion: '승급',
  podium: '수상대',
  gem: '보석',
  completion: '완성',
  review: '복습',
  workbook: '워크북',
  multi_review: '멀티복습',
  currency: '실버/골드',
  pin: '핀',
  recitation_pin: '암송핀',
};

// 공통 암송핀 목록 (클럽/단계 무관)
export const RECITATION_PINS = [
  { index: 1, name: '암송핀 - 로마서 8:1-17', ext: 'jpg' },
  { index: 2, name: '암송핀 - 로마서 8:18-39', ext: 'jpg' },
  { index: 3, name: '암송핀 - 요한복음 5:19-30', ext: 'jpg' },
  { index: 4, name: '암송핀 - 신명기 30:8-20', ext: 'jpg' },
  { index: 5, name: '복음의 수레바퀴', ext: 'jpg' },
  { index: 6, name: '암송핀 - 마태복음 (영문)', ext: 'png' },
  { index: 7, name: '암송핀 - 요한1서 4:7-21', ext: 'png' },
  { index: 8, name: '암송핀 - 고린도전서 13장', ext: 'png' },
  { index: 9, name: '암송핀 - 시편 34편', ext: 'png' },
  { index: 10, name: '암송핀 - 시편 23편', ext: 'png' },
  { index: 11, name: '암송핀 - 출애굽기 20:3-17', ext: 'png' },
  { index: 12, name: '암송핀 - 시편 100:1-5', ext: 'png' },
  { index: 13, name: '암송핀 - 시편 1편', ext: 'png' },
  { index: 14, name: '암송핀 - 로마서 6:1-13', ext: 'png' },
  { index: 15, name: '암송핀 - 요한복음 10:1-15', ext: 'png' },
  { index: 16, name: '암송핀 - 고린도전서 15:1-11', ext: 'png' },
  { index: 17, name: '암송핀 - 잠언 3:1-13', ext: 'png' },
  { index: 18, name: '암송핀 - 시편 62:1-12', ext: 'png' },
  { index: 19, name: '암송핀 - 빌립보서 4:1-13', ext: 'png' },
  { index: 20, name: '암송핀 - 마태복음 5:13-26', ext: 'png' },
  { index: 21, name: '암송핀 - 이사야 53장', ext: 'png' },
  { index: 22, name: '암송핀 - 이사야 40:1-8', ext: 'jpg' },
  { index: 23, name: '암송핀 - 갈라디아서 2:11-21', ext: 'png' },
  { index: 24, name: '암송핀 - 히브리서', ext: 'png' },
  { index: 25, name: '암송핀 - 에베소서', ext: 'png' },
  { index: 26, name: '암송핀 - 베드로전서 1:13-25', ext: 'png' },
  { index: 27, name: '암송핀 - 마가복음', ext: 'png' },
] as const;

/**
 * 암송핀 아이콘 경로
 * @example getRecitationPinIconPath(1) → "/badges/common/pins/pin-01.jpg"
 */
export const getRecitationPinIconPath = (index: number, ext: string = 'png'): string =>
  `/badges/common/pins/pin-${String(index).padStart(2, '0')}.${ext}`;

/**
 * 뱃지 아이콘 경로 생성
 * - Sparks: /badges/sparks/{stageKey}/{group}.png
 * - T&T 단계별: /badges/tnt/{stageKey}/{group}.png
 * - T&T 공유: /badges/tnt/{group}.png
 * - 암송핀 공통: /badges/common/pins/pin-01.png (기본값, 실제로는 getRecitationPinIconPath 사용)
 */
export const getBadgeIconPath = (
  clubType: ClubType,
  stageKey: string,
  badgeGroup: BadgeGroup,
  badgeName?: string,
): string => {
  // 공통 암송핀은 별도 경로
  if (badgeGroup === 'recitation_pin') {
    return '/badges/common/pins/pin-01.png'; // 기본값, 실제로는 getRecitationPinIconPath 사용
  }
  // T&T 공유 리소스 체크
  if (clubType === 'tnt') {
    const tntSharedGroups: BadgeGroup[] = ['review', 'currency', 'multi_review', 'pin'];
    if (tntSharedGroups.includes(badgeGroup)) {
      // 실버/골드 구분
      if (badgeGroup === 'currency' && badgeName) {
        if (badgeName.includes('실버')) return `/badges/tnt/currency-silver.png`;
        if (badgeName.includes('골드')) return `/badges/tnt/currency-gold.png`;
      }
      return `/badges/tnt/${badgeGroup}.png`;
    }
  }
  return `/badges/${clubType}/${stageKey}/${badgeGroup}.png`;
};

/**
 * 뱃지 아이콘 fallback 경로
 */
export const BADGE_FALLBACK_ICON = '/badges/default-badge.svg';
