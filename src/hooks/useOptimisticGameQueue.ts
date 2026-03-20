import { useState, useCallback, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import type { GameScoreEntry } from '../types/awana';

interface GameQueueAction {
  id: string;
  type: 'addGameScore' | 'updateGameScore' | 'deleteGameScore';
  params: Record<string, unknown>;
  rollback: {
    teamTotals: Record<string, number>;
    recentEntries: GameScoreEntry[];
  };
  createdAt: string;
  retryCount: number;
}

interface UseOptimisticGameQueueOptions {
  clubId: string | undefined;
  date: string;
  teamTotals: Record<string, number>;
  recentEntries: GameScoreEntry[];
  setTeamTotals: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setRecentEntries: React.Dispatch<React.SetStateAction<GameScoreEntry[]>>;
  loadData: () => Promise<void>;
}

function getQueueKey(clubId: string, date: string) {
  return `awana-game-queue-${clubId}-${date}`;
}

function loadQueue(clubId: string, date: string): GameQueueAction[] {
  try {
    const raw = localStorage.getItem(getQueueKey(clubId, date));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(clubId: string, date: string, queue: GameQueueAction[]) {
  try {
    if (queue.length === 0) {
      localStorage.removeItem(getQueueKey(clubId, date));
    } else {
      localStorage.setItem(getQueueKey(clubId, date), JSON.stringify(queue));
    }
  } catch {
    // storage full — ignore
  }
}

export function useOptimisticGameQueue(options: UseOptimisticGameQueueOptions) {
  const {
    clubId,
    date,
    setTeamTotals,
    setRecentEntries,
  } = options;

  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const processingRef = useRef(false);

  // Keep latest references for async callbacks
  const loadDataRef = useRef(options.loadData);
  loadDataRef.current = options.loadData;
  const teamTotalsRef = useRef(options.teamTotals);
  teamTotalsRef.current = options.teamTotals;
  const recentEntriesRef = useRef(options.recentEntries);
  recentEntriesRef.current = options.recentEntries;

  // Initialize pending count from localStorage
  useEffect(() => {
    if (!clubId) return;
    setPendingCount(loadQueue(clubId, date).length);
  }, [clubId, date]);

  // ── Queue processor (FIFO, sequential) ──────────────────────────
  const processQueue = useCallback(async () => {
    if (!clubId || processingRef.current || !navigator.onLine) return;
    processingRef.current = true;
    setIsSyncing(true);

    const {
      addGameScoreToMultipleTeams,
      updateGameScore,
      deleteGameScore,
      getGameScoreLock,
    } = await import('../services/gameScoreService');

    let queue = loadQueue(clubId, date);
    if (queue.length === 0) {
      processingRef.current = false;
      setIsSyncing(false);
      return;
    }

    // Lock check — once before processing
    try {
      const lock = await getGameScoreLock(clubId, date);
      if (lock) {
        toast.error('관리자가 점수를 잠금 처리했습니다. 변경사항이 취소됩니다.');
        setTeamTotals(queue[0].rollback.teamTotals);
        setRecentEntries(queue[0].rollback.recentEntries);
        saveQueue(clubId, date, []);
        setPendingCount(0);
        processingRef.current = false;
        setIsSyncing(false);
        await loadDataRef.current();
        return;
      }
    } catch {
      // Network error — stop, retry later
      processingRef.current = false;
      setIsSyncing(false);
      return;
    }

    // Process head of queue one by one
    let safety = 100;
    while (safety-- > 0) {
      if (!navigator.onLine) break;
      queue = loadQueue(clubId, date);
      if (queue.length === 0) break;

      const action = queue[0];
      try {
        const p = action.params;
        switch (action.type) {
          case 'addGameScore':
            await addGameScoreToMultipleTeams(
              p as Parameters<typeof addGameScoreToMultipleTeams>[0],
            );
            break;
          case 'updateGameScore':
            await updateGameScore(
              p.id as string,
              p.updates as Parameters<typeof updateGameScore>[1],
            );
            break;
          case 'deleteGameScore':
            await deleteGameScore(p.id as string);
            break;
        }

        // Success — remove head
        const remaining = queue.slice(1);
        saveQueue(clubId, date, remaining);
        setPendingCount(remaining.length);
      } catch {
        // Failure — increment retry
        const retryCount = action.retryCount + 1;
        if (retryCount >= 3) {
          toast.error('서버 동기화 실패. 변경사항이 취소됩니다.');
          setTeamTotals(action.rollback.teamTotals);
          setRecentEntries(action.rollback.recentEntries);
          saveQueue(clubId, date, []);
          setPendingCount(0);
          processingRef.current = false;
          setIsSyncing(false);
          await loadDataRef.current();
          return;
        }
        // Save updated retry count, stop processing
        queue[0] = { ...action, retryCount };
        saveQueue(clubId, date, queue);
        setPendingCount(queue.length);
        break;
      }
    }

    processingRef.current = false;
    setIsSyncing(false);

    // Queue fully drained → reconcile with server
    if (loadQueue(clubId, date).length === 0) {
      await loadDataRef.current();
    }
  }, [clubId, date, setTeamTotals, setRecentEntries]);

  // ── Online event & mount init ───────────────────────────────────
  useEffect(() => {
    if (!clubId) return;
    const handleOnline = () => setTimeout(processQueue, 1000);
    window.addEventListener('online', handleOnline);

    // Mount: if online and queue has items, process
    if (navigator.onLine && loadQueue(clubId, date).length > 0) {
      setTimeout(processQueue, 1000);
    }

    return () => window.removeEventListener('online', handleOnline);
  }, [clubId, date, processQueue]);

  // ── Enqueue: Add ────────────────────────────────────────────────
  const enqueueAdd = useCallback(
    (params: {
      teamIds: string[];
      clubId: string;
      trainingDate: string;
      points: number;
      description?: string;
      recordedBy?: string;
    }) => {
      if (!clubId) return;

      // 1. Snapshot for rollback
      const snapshot = {
        teamTotals: { ...teamTotalsRef.current },
        recentEntries: recentEntriesRef.current.slice(0, 20),
      };

      // 2. Optimistic local update
      navigator.vibrate?.(20);
      setTeamTotals((prev) => {
        const next = { ...prev };
        for (const tid of params.teamIds) {
          next[tid] = (next[tid] || 0) + params.points;
        }
        return next;
      });

      const now = new Date().toISOString();
      const newEntries: GameScoreEntry[] = params.teamIds.map((tid) => ({
        id: `local-${Date.now()}-${tid}`,
        team_id: tid,
        club_id: params.clubId,
        training_date: params.trainingDate,
        points: params.points,
        description: params.description || null,
        recorded_by: params.recordedBy || null,
        created_at: now,
      }));
      setRecentEntries((prev) => [...newEntries, ...prev]);

      // 3. Persist to queue
      const queue = loadQueue(clubId, date);
      queue.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'addGameScore',
        params,
        rollback: snapshot,
        createdAt: now,
        retryCount: 0,
      });
      saveQueue(clubId, date, queue);
      setPendingCount(queue.length);

      // 4. Trigger background processing
      processQueue();
    },
    [clubId, date, setTeamTotals, setRecentEntries, processQueue],
  );

  // ── Enqueue: Update ─────────────────────────────────────────────
  const enqueueUpdate = useCallback(
    (
      id: string,
      updates: { points?: number; description?: string },
      original: GameScoreEntry,
    ) => {
      if (!clubId) return;

      const snapshot = {
        teamTotals: { ...teamTotalsRef.current },
        recentEntries: recentEntriesRef.current.slice(0, 20),
      };

      // Optimistic local update
      const diff = (updates.points ?? original.points) - original.points;
      setRecentEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                points: updates.points ?? e.points,
                description: updates.description ?? e.description,
              }
            : e,
        ),
      );
      if (diff !== 0) {
        setTeamTotals((prev) => ({
          ...prev,
          [original.team_id]: (prev[original.team_id] || 0) + diff,
        }));
      }

      const queue = loadQueue(clubId, date);
      queue.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'updateGameScore',
        params: { id, updates },
        rollback: snapshot,
        createdAt: new Date().toISOString(),
        retryCount: 0,
      });
      saveQueue(clubId, date, queue);
      setPendingCount(queue.length);

      processQueue();
    },
    [clubId, date, setTeamTotals, setRecentEntries, processQueue],
  );

  // ── Enqueue: Delete ─────────────────────────────────────────────
  const enqueueDelete = useCallback(
    (id: string, entry: GameScoreEntry) => {
      if (!clubId) return;

      const snapshot = {
        teamTotals: { ...teamTotalsRef.current },
        recentEntries: recentEntriesRef.current.slice(0, 20),
      };

      // Optimistic local removal
      setRecentEntries((prev) => prev.filter((e) => e.id !== id));
      setTeamTotals((prev) => ({
        ...prev,
        [entry.team_id]: (prev[entry.team_id] || 0) - entry.points,
      }));

      const queue = loadQueue(clubId, date);
      queue.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'deleteGameScore',
        params: { id },
        rollback: snapshot,
        createdAt: new Date().toISOString(),
        retryCount: 0,
      });
      saveQueue(clubId, date, queue);
      setPendingCount(queue.length);

      processQueue();
    },
    [clubId, date, setTeamTotals, setRecentEntries, processQueue],
  );

  return { enqueueAdd, enqueueUpdate, enqueueDelete, pendingCount, isSyncing };
}
