-- 핸드북 기본 보기 모드 설정 (reflow=텍스트, original=원본보기)
ALTER TABLE club_handbooks
  ADD COLUMN IF NOT EXISTS default_view_mode text NOT NULL DEFAULT 'reflow'
  CHECK (default_view_mode IN ('reflow', 'original'));
