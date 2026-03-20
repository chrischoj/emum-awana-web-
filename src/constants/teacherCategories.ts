import type { Teacher } from '../types/awana';

/** 직책 기반 카테고리 정의 (우선순위 순) */
export const TEACHER_CATEGORIES = [
  { key: 'leadership', label: '리더십', emoji: '👑', color: '#8B5CF6', positions: ['조정관', '감독관', '총괄'] },
  { key: 'game', label: '게임팀', emoji: '🎮', color: '#F59E0B', positions: ['게임디렉터'] },
  { key: 'secretary', label: '서기/행정', emoji: '📋', color: '#3B82F6', positions: ['서기', '회계'] },
  { key: 'education', label: '교육팀', emoji: '📚', color: '#10B981', positions: ['교육팀'] },
  { key: 'media', label: '설교/방송', emoji: '🎙️', color: '#EC4899', positions: ['설교', '방송'] },
] as const;

/** 교사의 카테고리 결정 (직책 → 클럽 → 기타 순) */
export function getTeacherCategory(teacher: Teacher, clubs?: { id: string; type: string }[]): string {
  const pos = teacher.position;

  // 1. 직책 기반 카테고리 우선
  if (pos) {
    for (const cat of TEACHER_CATEGORIES) {
      if (cat.positions.some(p => pos.includes(p))) return cat.key;
    }
  }

  // 2. 클럽 기반 (스팍스/티앤티)
  if (teacher.club_id && clubs) {
    const club = clubs.find(c => c.id === teacher.club_id);
    if (club?.type === 'sparks') return 'sparks';
    if (club?.type === 'tnt') return 'tnt';
  }

  return 'other';
}

/** 리더 여부 판단 (팀장, 조정관, 감독관, 총괄 등) */
export function isLeader(position: string | null): boolean {
  if (!position) return false;
  return ['팀장', '조정관', '감독관', '총괄'].some(k => position.includes(k));
}

/** 교사 목록을 카테고리별로 그룹핑 (리더를 앞에 배치) */
export function groupTeachersByCategory(
  teachers: Teacher[],
  clubs: { id: string; name: string; type: string }[],
  assignments?: { teacher_id: string; room_name: string; team_name: string; team_color: string }[]
): { key: string; label: string; emoji: string; color: string; teachers: Teacher[] }[] {
  const groups: Record<string, Teacher[]> = {};

  for (const t of teachers) {
    if (!t.active) continue;
    const cat = getTeacherCategory(t, clubs);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(t);
  }

  // 각 그룹 내에서 정렬
  for (const key of Object.keys(groups)) {
    if ((key === 'sparks' || key === 'tnt') && assignments?.length) {
      // 스팍스/T&T: 담임 → 팀별(가나다순) → 리더우선 → 이름순, 비담임은 이후 이름순
      groups[key].sort((a, b) => {
        const aAssign = assignments.find(x => x.teacher_id === a.id);
        const bAssign = assignments.find(x => x.teacher_id === b.id);
        // 1. 담임 우선
        if (aAssign && !bAssign) return -1;
        if (!aAssign && bAssign) return 1;
        // 2. 둘 다 담임: 팀명 가나다순
        if (aAssign && bAssign) {
          const teamCmp = (aAssign.team_name || '').localeCompare(bAssign.team_name || '', 'ko');
          if (teamCmp !== 0) return teamCmp;
          // 같은 팀: 리더 우선
          const aL = isLeader(a.position) ? 0 : 1;
          const bL = isLeader(b.position) ? 0 : 1;
          if (aL !== bL) return aL - bL;
        }
        // 3. 이름 가나다순
        return (a.name || '').localeCompare(b.name || '', 'ko');
      });
    } else {
      // 기타 그룹: 리더 우선 → 이름순
      groups[key].sort((a, b) => {
        const aLeader = isLeader(a.position) ? 0 : 1;
        const bLeader = isLeader(b.position) ? 0 : 1;
        if (aLeader !== bLeader) return aLeader - bLeader;
        return (a.name || '').localeCompare(b.name || '', 'ko');
      });
    }
  }

  const result: { key: string; label: string; emoji: string; color: string; teachers: Teacher[] }[] = [];

  // 직책 기반 카테고리 순서대로
  for (const cat of TEACHER_CATEGORIES) {
    if (groups[cat.key]?.length) {
      result.push({ key: cat.key, label: cat.label, emoji: cat.emoji, color: cat.color, teachers: groups[cat.key] });
    }
  }

  // 클럽 기반 카테고리
  const sparksClub = clubs.find(c => c.type === 'sparks');
  const tntClub = clubs.find(c => c.type === 'tnt');

  if (groups['sparks']?.length) {
    result.push({
      key: 'sparks',
      label: sparksClub?.name || '스팍스',
      emoji: '🔴',
      color: '#EF4444',
      teachers: groups['sparks'],
    });
  }
  if (groups['tnt']?.length) {
    result.push({
      key: 'tnt',
      label: tntClub?.name || '티앤티',
      emoji: '🔵',
      color: '#3B82F6',
      teachers: groups['tnt'],
    });
  }

  // 기타
  if (groups['other']?.length) {
    result.push({ key: 'other', label: '기타', emoji: '👤', color: '#6B7280', teachers: groups['other'] });
  }

  return result;
}
