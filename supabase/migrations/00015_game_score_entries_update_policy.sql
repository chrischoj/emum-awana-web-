-- game_score_entries: UPDATE 정책 추가 (누락되어 점수 수정이 DB에 반영되지 않았음)
CREATE POLICY "game_scores_update" ON game_score_entries
  FOR UPDATE USING (auth.role() = 'authenticated');
