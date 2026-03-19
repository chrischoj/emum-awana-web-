import { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getNotifications, getUnreadNotifications, markAsRead as markAsReadApi, markAllAsRead as markAllAsReadApi } from '../services/notificationService';
import type { Notification } from '../types/awana';

const NOTIFICATION_TOAST_MESSAGES: Record<string, string> = {
  score_submitted: '📝 새 점수 제출이 있습니다',
  score_approved: '✅ 점수가 승인되었습니다',
  score_rejected: '❌ 점수가 반려되었습니다',
  game_score_locked: '🔒 게임 점수가 잠금되었습니다',
  game_score_unlocked: '🔓 게임 점수 잠금이 해제되었습니다',
};

export function useNotifications() {
  const { teacher } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const initialLoadDone = useRef(false);

  const fetchNotifications = useCallback(async () => {
    if (!teacher?.id) return;
    try {
      const data = await getNotifications(teacher.id, 50);
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.read).length);
    } catch (err) {
      console.error('알림 조회 실패:', err);
    }
  }, [teacher?.id]);

  // Initial load
  useEffect(() => {
    if (!teacher?.id || initialLoadDone.current) return;
    setLoading(true);
    fetchNotifications().finally(() => {
      setLoading(false);
      initialLoadDone.current = true;
    });
  }, [teacher?.id, fetchNotifications]);

  // Realtime subscription
  useEffect(() => {
    if (!teacher?.id) return;

    const channel = supabase
      .channel(`notifications-${teacher.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${teacher.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          setNotifications((prev) => [newNotification, ...prev]);
          setUnreadCount((prev) => prev + 1);

          // Toast notification
          const toastMsg = NOTIFICATION_TOAST_MESSAGES[newNotification.type];
          if (toastMsg) {
            toast(newNotification.title, {
              icon: toastMsg.split(' ')[0],
              duration: 4000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teacher?.id]);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await markAsReadApi(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('읽음 처리 실패:', err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!teacher?.id) return;
    try {
      await markAllAsReadApi(teacher.id);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('전체 읽음 처리 실패:', err);
    }
  }, [teacher?.id]);

  const refresh = useCallback(async () => {
    await fetchNotifications();
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refresh,
  };
}
