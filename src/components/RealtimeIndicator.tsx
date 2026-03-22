import { useRealtimeConnectionStatus } from '../hooks/useRealtimeConnectionStatus';
import { cn } from '../lib/utils';

/**
 * Realtime 연결 상태를 표시하는 작은 dot 인디케이터.
 * - connected: 표시 안 함 (정상)
 * - connecting: 노란색 깜빡임
 * - disconnected: 빨간색 + 툴팁
 */
export function RealtimeIndicator() {
  const status = useRealtimeConnectionStatus();

  if (status === 'connected') return null;

  return (
    <span
      title={status === 'connecting' ? '실시간 연결 중...' : '실시간 연결 끊김'}
      className={cn(
        'inline-block w-2 h-2 rounded-full flex-shrink-0',
        status === 'connecting' && 'bg-yellow-400 animate-pulse',
        status === 'disconnected' && 'bg-red-500',
      )}
    />
  );
}
