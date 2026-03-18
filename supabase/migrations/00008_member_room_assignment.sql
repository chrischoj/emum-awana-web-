-- 멤버에 학급(room) 배정 컬럼 추가
-- 팀(team_id)은 점수 취합 단위, 룸(room_id)은 학급 운영 단위

ALTER TABLE members
ADD COLUMN room_id uuid REFERENCES rooms(id) ON DELETE SET NULL;

-- 인덱스 추가
CREATE INDEX idx_members_room_id ON members(room_id);

COMMENT ON COLUMN members.room_id IS '배정된 학급(교실). room → team 관계로 team_id도 자동 결정됨';
