-- 00011_badge_stages_and_groups.sql
-- 뱃지 단계(Stage) 및 그룹(Group) 시스템

-- 1. badge_group ENUM 생성
CREATE TYPE badge_group AS ENUM (
  'promotion',     -- 승급
  'podium',        -- 수상대
  'completion',    -- 완성 (메달)
  'review',        -- 복습
  'workbook',      -- 워크북
  'multi_review',  -- 멀티 복습
  'currency',      -- 실버/골드
  'pin'            -- 핀
);

-- 2. club_stages 테이블 생성
CREATE TABLE IF NOT EXISTS club_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_type club_type NOT NULL,
  stage_key TEXT NOT NULL,
  stage_name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(club_type, stage_key)
);

-- 3. club_stages 시드 데이터
INSERT INTO club_stages (club_type, stage_key, stage_name, sort_order) VALUES
  ('sparks', 'hangglider', '행글라이더', 1),
  ('sparks', 'wingrunner', '윙러너', 2),
  ('sparks', 'skystormer', '스카이스토머', 3),
  ('tnt', 'ad1', 'AD1 (어드벤처 1)', 1),
  ('tnt', 'ad2', 'AD2 (어드벤처 2)', 2),
  ('tnt', 'ch1', 'CH1 (챌린지 1)', 3),
  ('tnt', 'ch2', 'CH2 (챌린지 2)', 4)
ON CONFLICT (club_type, stage_key) DO NOTHING;

-- 4. badges 테이블에 stage_id, badge_group 컬럼 추가
ALTER TABLE badges
  ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES club_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS badge_group badge_group;

-- 5. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_badges_stage_id ON badges(stage_id);
CREATE INDEX IF NOT EXISTS idx_badges_badge_group ON badges(badge_group);
CREATE INDEX IF NOT EXISTS idx_club_stages_club_type ON club_stages(club_type);

-- 6. club_stages RLS 정책
ALTER TABLE club_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club_stages_read_authenticated"
  ON club_stages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "club_stages_write_admin"
  ON club_stages FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teachers
      WHERE teachers.user_id = auth.uid()
      AND teachers.role = 'admin'
    )
  );

-- 7. Sparks 시드 뱃지 데이터 (3단계 × 5그룹 × 1개 = 15개)
-- 행글라이더
INSERT INTO badges (name, badge_type, badge_group, stage_id, sort_order) VALUES
  ('행글라이더 승급', 'special', 'promotion', (SELECT id FROM club_stages WHERE stage_key = 'hangglider'), 1),
  ('행글라이더 수상대', 'special', 'podium', (SELECT id FROM club_stages WHERE stage_key = 'hangglider'), 1),
  ('행글라이더 완성', 'special', 'completion', (SELECT id FROM club_stages WHERE stage_key = 'hangglider'), 1),
  ('행글라이더 복습', 'special', 'review', (SELECT id FROM club_stages WHERE stage_key = 'hangglider'), 1),
  ('행글라이더 워크북', 'special', 'workbook', (SELECT id FROM club_stages WHERE stage_key = 'hangglider'), 1);

-- 윙러너
INSERT INTO badges (name, badge_type, badge_group, stage_id, sort_order) VALUES
  ('윙러너 승급', 'special', 'promotion', (SELECT id FROM club_stages WHERE stage_key = 'wingrunner'), 1),
  ('윙러너 수상대', 'special', 'podium', (SELECT id FROM club_stages WHERE stage_key = 'wingrunner'), 1),
  ('윙러너 완성', 'special', 'completion', (SELECT id FROM club_stages WHERE stage_key = 'wingrunner'), 1),
  ('윙러너 복습', 'special', 'review', (SELECT id FROM club_stages WHERE stage_key = 'wingrunner'), 1),
  ('윙러너 워크북', 'special', 'workbook', (SELECT id FROM club_stages WHERE stage_key = 'wingrunner'), 1);

-- 스카이스토머
INSERT INTO badges (name, badge_type, badge_group, stage_id, sort_order) VALUES
  ('스카이스토머 승급', 'special', 'promotion', (SELECT id FROM club_stages WHERE stage_key = 'skystormer'), 1),
  ('스카이스토머 수상대', 'special', 'podium', (SELECT id FROM club_stages WHERE stage_key = 'skystormer'), 1),
  ('스카이스토머 완성', 'special', 'completion', (SELECT id FROM club_stages WHERE stage_key = 'skystormer'), 1),
  ('스카이스토머 복습', 'special', 'review', (SELECT id FROM club_stages WHERE stage_key = 'skystormer'), 1),
  ('스카이스토머 워크북', 'special', 'workbook', (SELECT id FROM club_stages WHERE stage_key = 'skystormer'), 1);

-- 8. T&T 시드 뱃지 데이터 (4단계)
-- 각 단계별: podium×1, completion×1, review×1, currency(실버)×1, currency(골드)×1, multi_review×1 = 6개
-- 총 4×6 = 24개

-- AD1
INSERT INTO badges (name, badge_type, badge_group, stage_id, sort_order) VALUES
  ('AD1 수상대', 'special', 'podium', (SELECT id FROM club_stages WHERE stage_key = 'ad1'), 1),
  ('AD1 완성', 'special', 'completion', (SELECT id FROM club_stages WHERE stage_key = 'ad1'), 1),
  ('AD1 복습', 'special', 'review', (SELECT id FROM club_stages WHERE stage_key = 'ad1'), 1),
  ('AD1 실버', 'special', 'currency', (SELECT id FROM club_stages WHERE stage_key = 'ad1'), 1),
  ('AD1 골드', 'special', 'currency', (SELECT id FROM club_stages WHERE stage_key = 'ad1'), 2),
  ('AD1 멀티복습', 'special', 'multi_review', (SELECT id FROM club_stages WHERE stage_key = 'ad1'), 1);

-- AD2
INSERT INTO badges (name, badge_type, badge_group, stage_id, sort_order) VALUES
  ('AD2 수상대', 'special', 'podium', (SELECT id FROM club_stages WHERE stage_key = 'ad2'), 1),
  ('AD2 완성', 'special', 'completion', (SELECT id FROM club_stages WHERE stage_key = 'ad2'), 1),
  ('AD2 복습', 'special', 'review', (SELECT id FROM club_stages WHERE stage_key = 'ad2'), 1),
  ('AD2 실버', 'special', 'currency', (SELECT id FROM club_stages WHERE stage_key = 'ad2'), 1),
  ('AD2 골드', 'special', 'currency', (SELECT id FROM club_stages WHERE stage_key = 'ad2'), 2),
  ('AD2 멀티복습', 'special', 'multi_review', (SELECT id FROM club_stages WHERE stage_key = 'ad2'), 1);

-- CH1
INSERT INTO badges (name, badge_type, badge_group, stage_id, sort_order) VALUES
  ('CH1 수상대', 'special', 'podium', (SELECT id FROM club_stages WHERE stage_key = 'ch1'), 1),
  ('CH1 완성', 'special', 'completion', (SELECT id FROM club_stages WHERE stage_key = 'ch1'), 1),
  ('CH1 복습', 'special', 'review', (SELECT id FROM club_stages WHERE stage_key = 'ch1'), 1),
  ('CH1 실버', 'special', 'currency', (SELECT id FROM club_stages WHERE stage_key = 'ch1'), 1),
  ('CH1 골드', 'special', 'currency', (SELECT id FROM club_stages WHERE stage_key = 'ch1'), 2),
  ('CH1 멀티복습', 'special', 'multi_review', (SELECT id FROM club_stages WHERE stage_key = 'ch1'), 1);

-- CH2
INSERT INTO badges (name, badge_type, badge_group, stage_id, sort_order) VALUES
  ('CH2 수상대', 'special', 'podium', (SELECT id FROM club_stages WHERE stage_key = 'ch2'), 1),
  ('CH2 완성', 'special', 'completion', (SELECT id FROM club_stages WHERE stage_key = 'ch2'), 1),
  ('CH2 복습', 'special', 'review', (SELECT id FROM club_stages WHERE stage_key = 'ch2'), 1),
  ('CH2 실버', 'special', 'currency', (SELECT id FROM club_stages WHERE stage_key = 'ch2'), 1),
  ('CH2 골드', 'special', 'currency', (SELECT id FROM club_stages WHERE stage_key = 'ch2'), 2),
  ('CH2 멀티복습', 'special', 'multi_review', (SELECT id FROM club_stages WHERE stage_key = 'ch2'), 1);

