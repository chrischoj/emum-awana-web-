-- 00016: 핸드북 PDF 뷰어 + 게임 보조 역할
-- 1. teachers 테이블에 is_game_assistant 필드 추가
-- 2. club_handbooks 테이블 생성
-- 3. Supabase Storage handbooks 버킷 생성

-- ============================================
-- 1. teachers.is_game_assistant
-- ============================================
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS is_game_assistant boolean DEFAULT false;

-- ============================================
-- 2. club_handbooks 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS club_handbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE,
  title text NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  uploaded_by uuid REFERENCES teachers(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS 활성화
ALTER TABLE club_handbooks ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자: SELECT
CREATE POLICY "Authenticated users can view handbooks"
  ON club_handbooks FOR SELECT
  TO authenticated
  USING (true);

-- admin만 INSERT
CREATE POLICY "Admin can insert handbooks"
  ON club_handbooks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teachers
      WHERE teachers.user_id = auth.uid()
        AND teachers.role = 'admin'
    )
  );

-- admin만 UPDATE
CREATE POLICY "Admin can update handbooks"
  ON club_handbooks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teachers
      WHERE teachers.user_id = auth.uid()
        AND teachers.role = 'admin'
    )
  );

-- admin만 DELETE
CREATE POLICY "Admin can delete handbooks"
  ON club_handbooks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teachers
      WHERE teachers.user_id = auth.uid()
        AND teachers.role = 'admin'
    )
  );

-- ============================================
-- 3. Storage 버킷 (handbooks)
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('handbooks', 'handbooks', true)
ON CONFLICT (id) DO NOTHING;

-- 인증된 사용자: 읽기
CREATE POLICY "Authenticated users can read handbooks storage"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'handbooks');

-- admin만 업로드
CREATE POLICY "Admin can upload handbooks storage"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'handbooks'
    AND EXISTS (
      SELECT 1 FROM teachers
      WHERE teachers.user_id = auth.uid()
        AND teachers.role = 'admin'
    )
  );

-- admin만 수정
CREATE POLICY "Admin can update handbooks storage"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'handbooks'
    AND EXISTS (
      SELECT 1 FROM teachers
      WHERE teachers.user_id = auth.uid()
        AND teachers.role = 'admin'
    )
  );

-- admin만 삭제
CREATE POLICY "Admin can delete handbooks storage"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'handbooks'
    AND EXISTS (
      SELECT 1 FROM teachers
      WHERE teachers.user_id = auth.uid()
        AND teachers.role = 'admin'
    )
  );
