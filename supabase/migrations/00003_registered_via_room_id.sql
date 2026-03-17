-- ============================================
-- Migration: Add registered_via_room_id to members
-- ============================================

ALTER TABLE members
  ADD COLUMN registered_via_room_id uuid REFERENCES rooms(id) ON DELETE SET NULL;

CREATE INDEX idx_members_registered_via_room ON members(registered_via_room_id);

-- Fix: members INSERT 정책을 teachers와 동일하게 변경
-- signUp 후 이메일 확인 전에는 세션이 anon이므로 authenticated 체크 시 실패
DROP POLICY IF EXISTS "members_insert" ON members;
CREATE POLICY "members_insert" ON members FOR INSERT WITH CHECK (true);
