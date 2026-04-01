-- 공개 이벤트 페이지를 위해 members/teachers 기본 정보 공개 읽기 허용
-- 기존 authenticated 정책은 유지, anon 읽기 정책 추가

DROP POLICY IF EXISTS "members_select" ON members;
CREATE POLICY "members_select" ON members FOR SELECT USING (true);

DROP POLICY IF EXISTS "teachers_select" ON teachers;
CREATE POLICY "teachers_select" ON teachers FOR SELECT USING (true);
