import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';

/**
 * 오프라인 큐: 실패한 write 요청을 localStorage에 저장하고
 * 온라인 복귀 시 자동으로 재전송합니다.
 */

interface QueuedAction {
  id: string;
  type: 'upsertScore' | 'recordAttendance' | 'addGameScore' | 'updateGameScore' | 'deleteGameScore';
  params: Record<string, unknown>;
  createdAt: string;
}

const QUEUE_KEY = 'awana-offline-queue';

function loadQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedAction[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // 용량 초과 등 무시
  }
}

// 액션 실행기 (동적 import로 순환참조 방지)
async function executeAction(action: QueuedAction): Promise<void> {
  const { upsertScore } = await import('../services/scoringService');
  const { recordAttendance } = await import('../services/attendanceService');
  const {
    addGameScoreToMultipleTeams,
    updateGameScore,
    deleteGameScore,
  } = await import('../services/gameScoreService');

  const p = action.params;
  switch (action.type) {
    case 'upsertScore':
      await upsertScore(p as Parameters<typeof upsertScore>[0]);
      break;
    case 'recordAttendance':
      await recordAttendance(p as Parameters<typeof recordAttendance>[0]);
      break;
    case 'addGameScore':
      await addGameScoreToMultipleTeams(p as Parameters<typeof addGameScoreToMultipleTeams>[0]);
      break;
    case 'updateGameScore':
      await updateGameScore(p.id as string, p.updates as Parameters<typeof updateGameScore>[1]);
      break;
    case 'deleteGameScore':
      await deleteGameScore(p.id as string);
      break;
  }
}

export function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(() => loadQueue().length);
  const processingRef = useRef(false);

  // 큐에 추가
  const enqueue = useCallback((type: QueuedAction['type'], params: Record<string, unknown>) => {
    const queue = loadQueue();
    const action: QueuedAction = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      params,
      createdAt: new Date().toISOString(),
    };
    queue.push(action);
    saveQueue(queue);
    setPendingCount(queue.length);
  }, []);

  // 큐 처리 (FIFO, 순차 실행)
  const processQueue = useCallback(async () => {
    if (processingRef.current || !navigator.onLine) return;
    processingRef.current = true;

    const queue = loadQueue();
    if (queue.length === 0) {
      processingRef.current = false;
      return;
    }

    let processed = 0;
    const remaining: QueuedAction[] = [];

    for (const action of queue) {
      try {
        await executeAction(action);
        processed++;
      } catch {
        // 실패한 항목은 남김 (최대 3번 시도 후 버림)
        const retryCount = ((action.params._retryCount as number) || 0) + 1;
        if (retryCount < 3) {
          remaining.push({ ...action, params: { ...action.params, _retryCount: retryCount } });
        }
        // 하나 실패하면 나머지도 나중에 재시도
        remaining.push(...queue.slice(queue.indexOf(action) + 1));
        break;
      }
    }

    saveQueue(remaining);
    setPendingCount(remaining.length);
    processingRef.current = false;

    if (processed > 0) {
      toast.success(`오프라인 대기 ${processed}건 동기화 완료`);
    }
  }, []);

  // 온라인 복귀 시 자동 처리
  useEffect(() => {
    function handleOnline() {
      // 약간의 지연 후 처리 (네트워크 안정화)
      setTimeout(processQueue, 1000);
    }

    window.addEventListener('online', handleOnline);

    // 마운트 시 이미 온라인이고 큐가 있으면 처리
    if (navigator.onLine && loadQueue().length > 0) {
      setTimeout(processQueue, 1000);
    }

    return () => window.removeEventListener('online', handleOnline);
  }, [processQueue]);

  return { enqueue, pendingCount, processQueue };
}
