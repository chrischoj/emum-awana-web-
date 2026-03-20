import React, { useState, useMemo } from 'react';
import { Avatar } from '../ui/Avatar';
import { useMemberProfile } from '../../contexts/MemberProfileContext';
import { BADGE_GROUP_LABELS } from '../../constants/badgeConstants';
import type { Badge, BadgeRequest, BadgeRequestStatus } from '../../types/awana';

// ---- Constants ----

const CATEGORY_LABELS: Record<string, string> = {
  jewel: '💎 보석',
  promotion: '🏆 진급',
  citation: '📜 표창',
  special: '⭐ 특별',
};

const GROUP_LABELS: Record<string, string> = {
  ...CATEGORY_LABELS,
  ...Object.fromEntries(
    Object.entries(BADGE_GROUP_LABELS).map(([k, v]) => {
      const icons: Record<string, string> = {
        promotion: '🏅', podium: '🏆', completion: '🎖️',
        review: '📖', workbook: '📓', multi_review: '🌟',
        currency: '🪙', pin: '📌',
      };
      return [k, `${icons[k] || '🏅'} ${v}`];
    })
  ),
};

const GROUP_ORDER = [
  // 새 badge_group 키들
  'promotion', 'podium', 'completion', 'review', 'workbook', 'multi_review', 'currency',
  // 기존 category 키들 (fallback)
  'jewel', 'citation', 'special',
] as const;

const STATUS_CONFIG: Record<BadgeRequestStatus, { icon: string; label: string; color: string }> = {
  requested: { icon: '🟡', label: '대기중', color: 'text-amber-600' },
  approved:  { icon: '🟢', label: '승인됨', color: 'text-green-600' },
  rejected:  { icon: '🔴', label: '반려됨', color: 'text-red-600' },
};

// ---- Types ----

interface BadgeRequestPanelProps {
  memberId: string;
  memberName: string;
  memberAvatarUrl?: string | null;
  isOpen: boolean;
  onClose: () => void;
  badges: Badge[];
  existingBadgeIds: string[];
  existingRequestIds: string[];
  memberRequests: (BadgeRequest & {
    badge: { id: string; name: string; category: string | null };
  })[];
  onSubmit: (badgeId: string, note?: string) => Promise<void>;
}

// ---- Component ----

const BadgeRequestPanel: React.FC<BadgeRequestPanelProps> = ({
  memberId,
  memberName,
  memberAvatarUrl,
  isOpen,
  onClose,
  badges,
  existingBadgeIds,
  existingRequestIds,
  memberRequests,
  onSubmit,
}) => {
  const { openMemberProfile } = useMemberProfile();
  const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // badges를 그룹으로 분류 (badge_group 우선, 없으면 category fallback)
  const groupedBadges = useMemo(() => {
    const groups: Record<string, Badge[]> = {};
    for (const badge of badges) {
      const groupKey = badge.badge_group || badge.category || 'special';
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(badge);
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
    }
    return groups;
  }, [badges]);

  const recentRequests = useMemo(
    () => [...memberRequests]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3),
    [memberRequests],
  );

  const handleSubmit = async () => {
    if (!selectedBadgeId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(selectedBadgeId, note.trim() || undefined);
      setSelectedBadgeId(null);
      setNote('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  if (!isOpen) return null;

  return (
    <div className="mt-2 p-3 bg-amber-50 rounded-lg">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => openMemberProfile(memberId)}
          className="flex items-center gap-1.5 hover:opacity-80"
        >
          <Avatar name={memberName} src={memberAvatarUrl} size="sm" />
          <span className="text-xs font-semibold text-amber-700">🏅 {memberName} 뱃지 신청</span>
        </button>
      </div>
      {/* 그룹별 뱃지 선택 */}
      <div className="space-y-2.5">
        {GROUP_ORDER.filter((key) => groupedBadges[key]?.length > 0).map((key) => (
          <div key={key}>
            {/* 그룹 라벨 */}
            <p className="text-xs font-semibold text-gray-500 mb-1">
              {GROUP_LABELS[key] || key}
            </p>

            {/* 칩 목록 */}
            <div className="flex flex-wrap gap-1.5">
              {groupedBadges[key].map((badge) => {
                const isOwned     = existingBadgeIds.includes(badge.id);
                const isPending   = existingRequestIds.includes(badge.id);
                const isDisabled  = isOwned || isPending;
                const isSelected  = selectedBadgeId === badge.id;

                let chipClass =
                  'px-2.5 py-1.5 text-xs rounded-full border font-medium touch-manipulation select-none transition-all active:scale-95 ';

                if (isDisabled) {
                  chipClass +=
                    'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60';
                } else if (isSelected) {
                  chipClass +=
                    'bg-amber-500 text-white border-amber-500 shadow-sm';
                } else {
                  chipClass +=
                    'bg-white text-gray-700 border-gray-300 cursor-pointer hover:border-amber-400 hover:text-amber-700';
                }

                return (
                  <button
                    key={badge.id}
                    type="button"
                    data-testid={`badge-chip-${badge.id}`}
                    disabled={isDisabled}
                    onClick={() =>
                      setSelectedBadgeId(isSelected ? null : badge.id)
                    }
                    className={chipClass}
                    title={
                      isOwned
                        ? '이미 보유한 뱃지입니다'
                        : isPending
                        ? '이미 신청 대기 중입니다'
                        : badge.description ?? ''
                    }
                  >
                    {badge.name}
                    {isOwned && (
                      <span className="ml-1 text-[10px] text-gray-400">보유</span>
                    )}
                    {isPending && (
                      <span className="ml-1 text-[10px] text-amber-400">대기</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 메모 입력 */}
      <div className="mt-3">
        <input
          type="text"
          data-testid="badge-request-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="메모 (선택)"
          maxLength={200}
          className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white placeholder-gray-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
        />
      </div>

      {/* 신청하기 / 닫기 버튼 */}
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-none px-3 py-2 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg active:scale-95 touch-manipulation"
        >
          닫기
        </button>
        <button
          type="button"
          data-testid="badge-request-submit"
          disabled={!selectedBadgeId || isSubmitting}
          onClick={handleSubmit}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg active:scale-95 touch-manipulation transition-colors ${
            selectedBadgeId && !isSubmitting
              ? 'bg-amber-500 text-white'
              : 'bg-amber-200 text-amber-400 cursor-not-allowed'
          }`}
        >
          {isSubmitting ? '신청 중...' : '신청하기'}
        </button>
      </div>

      {/* 신청 이력 */}
      {recentRequests.length > 0 && (
        <>
          <div className="mt-3 border-t border-amber-200" />
          <div className="mt-2 space-y-1.5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              최근 신청 이력
            </p>
            {recentRequests.map((req) => {
              const cfg = STATUS_CONFIG[req.status];
              return (
                <div
                  key={req.id}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <span>{cfg.icon}</span>
                  <span className="flex-1 text-gray-700 truncate">
                    {req.badge.name}
                  </span>
                  <span className={`font-medium ${cfg.color}`}>
                    {cfg.label}
                  </span>
                  <span className="text-gray-400 text-[10px]">
                    {formatDate(req.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default BadgeRequestPanel;
