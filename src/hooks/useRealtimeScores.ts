import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { WeeklyScore } from '../types/awana';

export function useRealtimeScores(clubId: string | undefined, trainingDate: string) {
  const [scores, setScores] = useState<WeeklyScore[]>([]);

  useEffect(() => {
    if (!clubId) return;

    // Initial load
    supabase
      .from('weekly_scores')
      .select('*')
      .eq('club_id', clubId)
      .eq('training_date', trainingDate)
      .then(({ data }) => setScores((data as WeeklyScore[]) || []));

    // Subscribe to changes
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
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setScores((prev) => [...prev, payload.new as WeeklyScore]);
          } else if (payload.eventType === 'UPDATE') {
            setScores((prev) =>
              prev.map((s) => (s.id === (payload.new as WeeklyScore).id ? (payload.new as WeeklyScore) : s))
            );
          } else if (payload.eventType === 'DELETE') {
            setScores((prev) => prev.filter((s) => s.id !== (payload.old as { id: string }).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clubId, trainingDate]);

  return scores;
}
