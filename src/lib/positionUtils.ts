/** 뱃지 승인 권한이 있는 position 목록 */
export const BADGE_APPROVER_POSITIONS = ['서기', '감독관', '조정관'] as const;

/** 해당 position이 뱃지 승인 가능한지 판단 */
export function isBadgeApprover(position: string | null): boolean {
  if (!position) return false;
  return BADGE_APPROVER_POSITIONS.some(p => position.includes(p));
}

/** admin role 이거나 approver position인지 판단 */
export function canApproveBadges(
  role: string,
  position: string | null
): boolean {
  return role === 'admin' || isBadgeApprover(position);
}
