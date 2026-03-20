-- ============================================
-- Notifications System (알림 시스템)
-- ============================================

-- 알림 유형 ENUM
CREATE TYPE notification_type AS ENUM (
  'score_submitted',
  'score_approved',
  'score_rejected',
  'game_score_locked',
  'game_score_unlocked'
);

-- 알림 테이블
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX idx_notifications_recipient_unread ON notifications(recipient_id) WHERE read = false;
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- RLS 활성화
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 본인 알림만 조회
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (
    recipient_id IN (
      SELECT id FROM teachers WHERE user_id = auth.uid()
    )
  );

-- RLS 정책: 본인 알림만 수정 (읽음 처리)
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (
    recipient_id IN (
      SELECT id FROM teachers WHERE user_id = auth.uid()
    )
  );

-- RLS 정책: 인증 사용자 INSERT 허용 (서비스에서 알림 생성)
CREATE POLICY "notifications_insert_authenticated" ON notifications
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- RLS 정책: 본인 알림 삭제 허용
CREATE POLICY "notifications_delete_own" ON notifications
  FOR DELETE USING (
    recipient_id IN (
      SELECT id FROM teachers WHERE user_id = auth.uid()
    )
  );

-- Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- 3일 이상 된 읽은 알림 자동 정리 함수
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM notifications
  WHERE read = true AND created_at < now() - interval '3 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
