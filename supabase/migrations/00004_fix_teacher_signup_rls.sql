-- ============================================
-- Fix: 회원가입 시 teachers 테이블 RLS 정책 수정
-- 문제: anon 사용자가 signup 과정에서 teachers SELECT/INSERT 불가
-- ============================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "teachers_select" ON teachers;
DROP POLICY IF EXISTS "teachers_insert" ON teachers;

-- SELECT: anon(회원가입 시 교사 목록 조회) + authenticated 모두 허용
CREATE POLICY "teachers_select" ON teachers
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- INSERT: anon(회원가입) + authenticated 모두 허용
CREATE POLICY "teachers_insert" ON teachers
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
