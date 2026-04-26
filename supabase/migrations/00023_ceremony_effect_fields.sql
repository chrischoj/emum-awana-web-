-- 시상식 공개 페이지가 브라우저 localStorage 없이도 확정된 효과를 재생할 수 있도록 저장

ALTER TABLE ceremony_confirmations
  ADD COLUMN IF NOT EXISTS effect_selection text,
  ADD COLUMN IF NOT EXISTS effect_preset text;

COMMENT ON COLUMN ceremony_confirmations.effect_selection IS 'Admin-selected ceremony effect option, including random';
COMMENT ON COLUMN ceremony_confirmations.effect_preset IS 'Resolved effect preset used by public ceremony playback';
