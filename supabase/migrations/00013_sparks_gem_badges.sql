-- 00013_sparks_gem_badges.sql
-- 스팍스 보석 뱃지 그룹 추가 (빨간보석, 초록보석)

-- 1. badge_group ENUM에 gem 추가
ALTER TYPE badge_group ADD VALUE IF NOT EXISTS 'gem';

-- 2. 스팍스 보석 시드 데이터 (3단계 × 2개 = 6개)
-- 각 단계별로 빨간보석(sort_order=1), 초록보석(sort_order=2)
INSERT INTO badges (name, badge_type, badge_group, stage_id, sort_order) VALUES
  ('행글라이더 빨간보석', 'special', 'gem', (SELECT id FROM club_stages WHERE stage_key = 'hangglider'), 1),
  ('행글라이더 초록보석', 'special', 'gem', (SELECT id FROM club_stages WHERE stage_key = 'hangglider'), 2),
  ('윙러너 빨간보석', 'special', 'gem', (SELECT id FROM club_stages WHERE stage_key = 'wingrunner'), 1),
  ('윙러너 초록보석', 'special', 'gem', (SELECT id FROM club_stages WHERE stage_key = 'wingrunner'), 2),
  ('스카이스토머 빨간보석', 'special', 'gem', (SELECT id FROM club_stages WHERE stage_key = 'skystormer'), 1),
  ('스카이스토머 초록보석', 'special', 'gem', (SELECT id FROM club_stages WHERE stage_key = 'skystormer'), 2);
