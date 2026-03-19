import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Avatar } from '../ui/Avatar';
import { useMemberProfile } from '../../contexts/MemberProfileContext';
import type { BadgeRequest, BadgeRequestStatus } from '../../types/awana';

// ---- Constants ----

const CATEGORY_ICONS: Record<string, string> = {
  jewel: '💎',
  promotion: '🏆',
  citation: '📜',
  special: '⭐',
};

// ---- Types ----

type EnrichedBadgeRequest = BadgeRequest & {
  badge: { id: string; name: string; category: string | null };
  member: { id: string; name: string; avatar_url: string | null };
  requester: { id: string; name: string };
};

interface BadgeReviewBannerProps {
  pendingCount: number;
  requests: EnrichedBadgeRequest[];
  onApprove: (requestId: string) => Promise<void>;
  onReject: (requestId: string, rejectionNote?: string) => Promise<void>;
}

// ---- Helpers ----

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getCategoryIcon(category: string | null): string {
  if (!category) return '🏅';
  return CATEGORY_ICONS[category] ?? '🏅';
}

// ---- Sub-component: RequestItem ----

interface RequestItemProps {
  request: EnrichedBadgeRequest;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, note?: string) => Promise<void>;
}

const RequestItem: React.FC<RequestItemProps> = ({ request, onApprove, onReject }) => {
  const { openMemberProfile } = useMemberProfile();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState('');
  const [loadingAction, setLoadingAction] = useState<'approve' | 'reject' | null>(null);

  const isRejecting = rejectingId === request.id;
  const isLoading = loadingAction !== null;

  const categoryIcon = getCategoryIcon(request.badge.category);

  const handleApprove = async () => {
    if (isLoading) return;
    setLoadingAction('approve');
    try {
      await onApprove(request.id);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (isLoading) return;
    setLoadingAction('reject');
    try {
      await onReject(request.id, rejectionNote.trim() || undefined);
      setRejectingId(null);
      setRejectionNote('');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRejectCancel = () => {
    setRejectingId(null);
    setRejectionNote('');
  };

  return (
    <div className="p-3 border-b border-gray-100 last:border-b-0">
      {/* 멤버명 → 뱃지명 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => openMemberProfile(request.member.id)}
          className="flex items-center gap-1.5 hover:opacity-80"
        >
          <Avatar name={request.member.name} src={request.member.avatar_url} size="sm" />
          <span className="font-semibold text-gray-900 text-sm">{request.member.name}</span>
        </button>
        <span className="text-gray-400 text-xs">→</span>
        <span className="text-sm text-amber-700">
          {categoryIcon} {request.badge.name}
        </span>
      </div>

      {/* 신청자 · 날짜 */}
      <p className="text-xs text-gray-500 mt-0.5">
        신청자: {request.requester.name} · {formatDate(request.created_at)}
      </p>

      {/* 메모 */}
      {request.note && (
        <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded mt-1">
          &ldquo;{request.note}&rdquo;
        </p>
      )}

      {/* 반려 사유 인라인 입력 */}
      {isRejecting ? (
        <div className="mt-2 space-y-1.5">
          <input
            type="text"
            data-testid={`badge-rejection-note-${request.id}`}
            value={rejectionNote}
            onChange={(e) => setRejectionNote(e.target.value)}
            placeholder="반려 사유 (선택)"
            maxLength={200}
            autoFocus
            className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-red-200 bg-white placeholder-gray-400 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-300"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              data-testid={`badge-reject-confirm-${request.id}`}
              onClick={handleRejectConfirm}
              disabled={isLoading}
              className={`px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg touch-manipulation transition-all active:scale-95 ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loadingAction === 'reject' ? '처리 중...' : '반려 확인'}
            </button>
            <button
              type="button"
              onClick={handleRejectCancel}
              disabled={isLoading}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg touch-manipulation active:scale-95"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        /* 승인 / 반려 버튼 */
        <div className="mt-2 flex gap-1.5 justify-end">
          <button
            type="button"
            data-testid={`badge-approve-${request.id}`}
            onClick={handleApprove}
            disabled={isLoading}
            className={`px-3 py-1.5 bg-green-500 text-white text-xs rounded-lg touch-manipulation transition-all active:scale-95 ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loadingAction === 'approve' ? '처리 중...' : '✅ 승인'}
          </button>
          <button
            type="button"
            data-testid={`badge-reject-${request.id}`}
            onClick={() => setRejectingId(request.id)}
            disabled={isLoading}
            className={`px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg touch-manipulation transition-all active:scale-95 ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            ❌ 반려
          </button>
        </div>
      )}
    </div>
  );
};

// ---- Main Component ----

const BadgeReviewBanner: React.FC<BadgeReviewBannerProps> = ({
  pendingCount,
  requests,
  onApprove,
  onReject,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (pendingCount === 0) return null;

  return (
    <>
      {/* 상단 배너 */}
      <div data-testid="badge-review-banner" className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
        <p className="text-sm text-amber-800 font-medium">
          🏅 {pendingCount}건의 뱃지 신청이 대기 중입니다
        </p>
        <button
          type="button"
          data-testid="badge-review-open-modal"
          onClick={() => setIsModalOpen(true)}
          className="text-xs text-amber-700 underline font-medium touch-manipulation"
        >
          모아보기
        </button>
      </div>

      {/* 모아보기 모달 */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="뱃지 신청 목록"
      >
        <div className="-mx-6 -mb-6">
          {requests.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              대기 중인 신청이 없습니다
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              {requests.map((request) => (
                <RequestItem
                  key={request.id}
                  request={request}
                  onApprove={onApprove}
                  onReject={onReject}
                />
              ))}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};

export default BadgeReviewBanner;
