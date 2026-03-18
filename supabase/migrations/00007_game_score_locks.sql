-- ============================================
-- Game Score Locks (게임 점수 날짜별 잠금)
-- ============================================

CREATE TABLE IF NOT EXISTS game_score_locks (
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  training_date DATE NOT NULL,
  locked_by UUID REFERENCES teachers(id),
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, training_date)
);

-- RLS
ALTER TABLE game_score_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "game_score_locks_select" ON game_score_locks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "game_score_locks_insert" ON game_score_locks
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "game_score_locks_delete" ON game_score_locks
  FOR DELETE TO authenticated USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE game_score_locks;
