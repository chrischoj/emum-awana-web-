import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

/**
 * Supabase Realtime 연결 상태를 모니터링하는 훅.
 * 경량 heartbeat 채널을 통해 전체 realtime 연결 상태를 추적한다.
 */
export function useRealtimeConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    const channel = supabase.channel('connection-monitor');

    channel.subscribe((channelStatus) => {
      if (channelStatus === 'SUBSCRIBED') {
        setStatus('connected');
      } else if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT' || channelStatus === 'CLOSED') {
        setStatus('disconnected');
      } else {
        setStatus('connecting');
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return status;
}
