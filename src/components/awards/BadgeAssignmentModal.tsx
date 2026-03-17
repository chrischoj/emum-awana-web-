import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { getBadges, awardBadge } from '../../services/badgeService';
import type { Badge, Member } from '../../types/awana';

interface BadgeAssignmentModalProps {
  open: boolean;
  onClose: () => void;
  member: Member;
  awardedBy?: string;
  onAwarded?: () => void;
}

export function BadgeAssignmentModal({
  open,
  onClose,
  member,
  awardedBy,
  onAwarded,
}: BadgeAssignmentModalProps) {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      getBadges().then(setBadges).catch(() => toast.error('뱃지 목록 로드 실패'));
    }
  }, [open]);

  const handleAward = async () => {
    if (!selectedBadgeId) {
      toast.error('뱃지를 선택하세요');
      return;
    }
    setSubmitting(true);
    try {
      await awardBadge({
        memberId: member.id,
        badgeId: selectedBadgeId,
        awardedBy,
        note: note || undefined,
      });
      toast.success(`${member.name}에게 뱃지 부여 완료`);
      onAwarded?.();
      onClose();
    } catch {
      toast.error('뱃지 부여 실패');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="뱃지 부여">
      <p className="text-sm text-gray-500 mb-4">
        <strong>{member.name}</strong>에게 뱃지를 부여합니다.
      </p>

      <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
        {badges.map((badge) => (
          <button
            key={badge.id}
            onClick={() => setSelectedBadgeId(badge.id)}
            className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
              selectedBadgeId === badge.id
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <p className="font-medium text-sm">{badge.name}</p>
            {badge.description && (
              <p className="text-xs text-gray-500 mt-0.5">{badge.description}</p>
            )}
          </button>
        ))}
        {badges.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">등록된 뱃지가 없습니다</p>
        )}
      </div>

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="메모 (선택사항)"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
      />

      <div className="flex gap-2">
        <Button variant="secondary" onClick={onClose} className="flex-1">
          취소
        </Button>
        <Button
          variant="primary"
          onClick={handleAward}
          isLoading={submitting}
          disabled={!selectedBadgeId}
          className="flex-1"
        >
          부여
        </Button>
      </div>
    </Modal>
  );
}
