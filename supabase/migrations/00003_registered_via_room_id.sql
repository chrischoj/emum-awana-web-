-- ============================================
-- Migration: Add registered_via_room_id to members
-- ============================================

ALTER TABLE members
  ADD COLUMN registered_via_room_id uuid REFERENCES rooms(id) ON DELETE SET NULL;

CREATE INDEX idx_members_registered_via_room ON members(registered_via_room_id);
