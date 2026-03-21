-- 점수 제출/승인 단위를 팀(team) → 교실(room)로 변경
-- UNIQUE KEY: (room_id, training_date)
-- club_id, team_id는 비정규화 컬럼으로 유지 (쿼리 성능)

-- 1. room_id 컬럼 추가
ALTER TABLE weekly_score_submissions
  ADD COLUMN room_id uuid REFERENCES rooms;

-- 2. 기존 데이터 backfill: team_id → room_id (1:1 매핑인 경우)
UPDATE weekly_score_submissions s
SET room_id = (
  SELECT r.id FROM rooms r
  WHERE r.team_id = s.team_id AND r.club_id = s.club_id
  ORDER BY r.created_at
  LIMIT 1
);

-- 3. 기존 UNIQUE 제약 제거
ALTER TABLE weekly_score_submissions
  DROP CONSTRAINT IF EXISTS weekly_score_submissions_club_id_team_id_training_date_key;

-- 4. 새 UNIQUE 제약: 교실 + 날짜 단위
ALTER TABLE weekly_score_submissions
  ADD CONSTRAINT weekly_score_submissions_room_date_key
  UNIQUE(room_id, training_date);

-- 5. 관리자 조회용 인덱스 (club_id + training_date)
CREATE INDEX IF NOT EXISTS idx_submissions_club_date
  ON weekly_score_submissions(club_id, training_date);

-- 6. room_name 조회 편의용 코멘트
COMMENT ON COLUMN weekly_score_submissions.room_id IS '제출 단위: 교실(room). room → team → club 관계로 팀/클럽 역참조 가능';
COMMENT ON COLUMN weekly_score_submissions.team_id IS '비정규화: 쿼리 성능용. room.team_id에서 유도 가능';
COMMENT ON COLUMN weekly_score_submissions.club_id IS '비정규화: 쿼리 성능용. room.team.club_id에서 유도 가능';
