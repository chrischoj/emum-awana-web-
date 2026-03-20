-- 00012_recitation_pins.sql
-- 공통 암송핀(recitation_pin) ENUM 값 추가 및 시드 데이터
-- NOTE: ALTER TYPE ADD VALUE는 별도 트랜잭션에서 커밋되어야 하므로 00011과 분리

-- 1. recitation_pin ENUM 값 추가
ALTER TYPE badge_group ADD VALUE IF NOT EXISTS 'recitation_pin';

-- 2. 공통 암송핀 시드 데이터 (클럽/단계 무관, stage_id = NULL)
-- 총 27개
INSERT INTO badges (name, badge_type, badge_group, stage_id, icon_url, sort_order) VALUES
  ('암송핀 - 로마서 8:1-17', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-01.jpg', 1),
  ('암송핀 - 로마서 8:18-39', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-02.jpg', 2),
  ('암송핀 - 요한복음 5:19-30', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-03.jpg', 3),
  ('암송핀 - 신명기 30:8-20', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-04.jpg', 4),
  ('복음의 수레바퀴', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-05.jpg', 5),
  ('암송핀 - 마태복음 (영문)', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-06.png', 6),
  ('암송핀 - 요한1서 4:7-21', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-07.png', 7),
  ('암송핀 - 고린도전서 13장', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-08.png', 8),
  ('암송핀 - 시편 34편', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-09.png', 9),
  ('암송핀 - 시편 23편', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-10.png', 10),
  ('암송핀 - 출애굽기 20:3-17', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-11.png', 11),
  ('암송핀 - 시편 100:1-5', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-12.png', 12),
  ('암송핀 - 시편 1편', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-13.png', 13),
  ('암송핀 - 로마서 6:1-13', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-14.png', 14),
  ('암송핀 - 요한복음 10:1-15', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-15.png', 15),
  ('암송핀 - 고린도전서 15:1-11', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-16.png', 16),
  ('암송핀 - 잠언 3:1-13', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-17.png', 17),
  ('암송핀 - 시편 62:1-12', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-18.png', 18),
  ('암송핀 - 빌립보서 4:1-13', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-19.png', 19),
  ('암송핀 - 마태복음 5:13-26', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-20.png', 20),
  ('암송핀 - 이사야 53장', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-21.png', 21),
  ('암송핀 - 이사야 40:1-8', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-22.jpg', 22),
  ('암송핀 - 갈라디아서 2:11-21', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-23.png', 23),
  ('암송핀 - 히브리서', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-24.png', 24),
  ('암송핀 - 에베소서', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-25.png', 25),
  ('암송핀 - 베드로전서 1:13-25', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-26.png', 26),
  ('암송핀 - 마가복음', 'memorization', 'recitation_pin', NULL, '/badges/common/pins/pin-27.png', 27);
