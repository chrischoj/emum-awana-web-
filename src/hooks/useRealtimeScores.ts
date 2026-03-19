import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { WeeklyScore } from '../types/awana';

export function useRealtimeScores(clubId: string | undefined, trainingDate: string) {
  const [scores, setScores] = useState<WeeklyScore[]>([]);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!clubId) return;

    const fetchScores = async () => {
      const { data } = await supabase
        .from('weekly_scores')
        .select('*')
        .eq('club_id', clubId)
        .eq('training_date', trainingDate);
      setScores((data as WeeklyScore[]) || []);
    };

    // Initial load
    fetchScores();

    // Subscribe to changes - full refetch with debounce
    const channel = supabase
      .channel(`scores-${clubId}-${trainingDate}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'weekly_scores',
          filter: `club_id=eq.${clubId}`,
        },
        () => {
          if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
          realtimeTimerRef.current = setTimeout(fetchScores, 300);
        }
      )
      .subscribe();

    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [clubId, trainingDate]);

  return scores;
}
