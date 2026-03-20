import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import {
  createBadgeRequest,
  getBadgeRequests,
  approveBadgeRequest,
  rejectBadgeRequest,
  getPendingBadgeRequestCount,
} from '../services/badgeRequestService';
import type { BadgeRequest } from '../types/awana';

type BadgeRequestWithJoins = BadgeRequest & {
  badge: { id: string; name: string; category: string | null };
  member: { id: string; name: string; avatar_url: string | null };
  requester: { id: string; name: string };
};

interface BadgeRequestsContextValue {
  requests: BadgeRequestWithJoins[];
  pendingCount: number;
  loading: boolean;
  submitRequest: (memberId: string, badgeId: string, note?: string) => Promise<void>;
  approve: (requestId: string) => Promise<void>;
  reject: (requestId: string, rejectionNote?: string) => Promise<void>;
  refresh: () => Promise<unknown>;
}

const BadgeRequestsContext = createContext<BadgeRequestsContextValue | null>(null);

export function BadgeRequestsProvider({ children }: { children: ReactNode }) {
  const { teacher } = useAuth();
  const [requests, setRequests] = useState<BadgeRequestWithJoins[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const initialLoadDone = useRef(false);

  const fetchRequests = useCallback(async () => {
    try {
      const data = await getBadgeRequests();
      setRequests(data);
    } catch (err) {
      console.error('뱃지 신청 조회 실패:', err);
    }
  }, []);

  const fetchPendingCount = useCallback(async () => {
    try {
      const count = await getPendingBadgeRequestCount();
      setPendingCount(count);
    } catch (err) {
      console.error('대기 건수 조회 실패:', err);
    }
  }, []);

  // 초기 로드 (Provider 레벨이므로 탭 전환 시 리셋되지 않음)
  useEffect(() => {
    if (!teacher?.id || initialLoadDone.current) return;
    setLoading(true);
    Promise.all([fetchRequests(), fetchPendingCount()])
      .finally(() => {
        setLoading(false);
        initialLoadDone.current = true;
      });
  }, [teacher?.id, fetchRequests, fetchPendingCount]);

  // Realtime 구독
  useEffect(() => {
    if (!teacher?.id) return;
    const channel = supabase
      .channel('badge-requests-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'badge_requests' },
        () => {
          fetchRequests();
          fetchPendingCount();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [teacher?.id, fetchRequests, fetchPendingCount]);

  const submitRequest = useCallback(
    async (memberId: string, badgeId: string, note?: string) => {
      if (!teacher?.id) return;
      try {
        await createBadgeRequest({
          memberId,
          badgeId,
          requestedBy: teacher.id,
          note,
        });
        toast.success('뱃지 신청 완료');
        await Promise.all([fetchRequests(), fetchPendingCount()]);
      } catch (err: any) {
        if (err?.code === '23505') {
          toast.error('이미 해당 뱃지를 보유하고 있습니다');
        } else {
          toast.error('뱃지 신청 실패');
        }
      }
    },
    [teacher?.id, fetchRequests, fetchPendingCount]
  );

  const approve = useCallback(
    async (requestId: string) => {
      if (!teacher?.id) return;
      try {
        await approveBadgeRequest({ requestId, approvedBy: teacher.id });
        toast.success('뱃지 승인 완료');
        await Promise.all([fetchRequests(), fetchPendingCount()]);
      } catch {
        toast.error('승인 실패');
      }
    },
    [teacher?.id, fetchRequests, fetchPendingCount]
  );

  const reject = useCallback(
    async (requestId: string, rejectionNote?: string) => {
      if (!teacher?.id) return;
      try {
        await rejectBadgeRequest({
          requestId,
          rejectedBy: teacher.id,
          rejectionNote,
        });
        toast.success('뱃지 반려 완료');
        await Promise.all([fetchRequests(), fetchPendingCount()]);
      } catch {
        toast.error('반려 실패');
      }
    },
    [teacher?.id, fetchRequests, fetchPendingCount]
  );

  const refresh = useCallback(
    () => Promise.all([fetchRequests(), fetchPendingCount()]),
    [fetchRequests, fetchPendingCount]
  );

  const value = useMemo(() => ({
    requests,
    pendingCount,
    loading,
    submitRequest,
    approve,
    reject,
    refresh,
  }), [requests, pendingCount, loading, submitRequest, approve, reject, refresh]);

  return (
    <BadgeRequestsContext.Provider value={value}>
      {children}
    </BadgeRequestsContext.Provider>
  );
}

export function useBadgeRequests() {
  const ctx = useContext(BadgeRequestsContext);
  if (!ctx) throw new Error('useBadgeRequests must be used within BadgeRequestsProvider');
  return ctx;
}
