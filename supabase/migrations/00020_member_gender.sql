-- 성별 컬럼 추가
ALTER TABLE members ADD COLUMN IF NOT EXISTS gender text;
-- gender: 'M' | 'F' | null
