import { useState, useEffect, useCallback, useRef } from 'react';

interface NetworkStatus {
  isOnline: boolean;
  /** 오프라인일 때 true — sync 호출을 건너뛰는 데 사용 */
  isOffline: boolean;
  /** 온라인 복귀 시 호출할 콜백을 등록 */
  onReconnect: (cb: () => void) => () => void;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const reconnectCallbacks = useRef<Set<() => void>>(new Set());

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      // 등록된 콜백 실행
      for (const cb of reconnectCallbacks.current) {
        try { cb(); } catch { /* ignore */ }
      }
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const onReconnect = useCallback((cb: () => void) => {
    reconnectCallbacks.current.add(cb);
    return () => { reconnectCallbacks.current.delete(cb); };
  }, []);

  return { isOnline, isOffline: !isOnline, onReconnect };
}
