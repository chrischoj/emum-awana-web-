-- ============================================
-- Migration 00010: Badge Requests (배지 신청 시스템)
-- ============================================
-- 변경 내용:
--   1. badges 테이블 확장 (category, level, sort_order 컬럼 추가)
--   2. badge_requests 테이블 생성
--   3. 인덱스 생성
--   4. RLS 정책 설정
--   5. notification_type ENUM 확장 (badge_requested, badge_approved, badge_rejected)
--   6. updated_at 자동 갱신 트리거
--   7. Realtime 활성화
-- ============================================


-- ============================================
-- 1. BADGES 테이블 확장
-- ============================================

-- 1.1 category 컬럼 추가 (jewel, promotion, citation, special 또는 NULL)
ALTER TABLE badges
  ADD COLUMN IF NOT EXISTS category TEXT
    CHECK (category IN ('jewel', 'promotion', 'citation', 'special'));

-- 1.2 level 컬럼 추가 (배지 단계/레벨)
ALTER TABLE badges
  ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 0;

-- 1.3 sort_order 컬럼 추가 (목록 정렬 순서)
ALTER TABLE badges
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

COMMENT ON COLUMN badges.category   IS '배지 분류: jewel(보석), promotion(진급), citation(공로), special(특별), NULL(미분류)';
COMMENT ON COLUMN badges.level      IS '배지 단계/레벨 (0: 기본)';
COMMENT ON COLUMN badges.sort_order IS '목록 표시 순서';


-- ============================================
-- 2. BADGES 테이블 인덱스
-- ============================================

CREATE INDEX IF NOT EXISTS idx_badges_category
    ON badges (category);

CREATE INDEX IF NOT EXISTS idx_badges_sort_order
    ON badges (sort_order);


-- ============================================
-- 3. BADGE_REQUESTS 테이블 생성
-- ============================================

-- 배지 신청 테이블
--   교사가 멤버를 대신하여 배지를 신청하고 관리자가 승인/거절하는 워크플로우
CREATE TABLE badge_requests (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id       UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    badge_id        UUID        NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    requested_by    UUID        NOT NULL REFERENCES teachers(id),
    status          TEXT        NOT NULL DEFAULT 'requested'
                                CHECK (status IN ('requested', 'approved', 'rejected')),
    approved_by     UUID        REFERENCES teachers(id),
    note            TEXT,
    rejection_note  TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  badge_requests                IS '배지 신청 워크플로우 (교사 신청 → 관리자 승인/거절)';
COMMENT ON COLUMN badge_requests.requested_by   IS '배지를 신청한 교사';
COMMENT ON COLUMN badge_requests.status         IS 'requested: 신청됨, approved: 승인됨, rejected: 거절됨';
COMMENT ON COLUMN badge_requests.approved_by    IS '승인 또는 거절 처리한 교사 (관리자)';
COMMENT ON COLUMN badge_requests.note           IS '신청 시 추가 메모';
COMMENT ON COLUMN badge_requests.rejection_note IS '거절 사유';


-- ============================================
-- 4. BADGE_REQUESTS 인덱스
-- ============================================

CREATE INDEX idx_badge_requests_member_id
    ON badge_requests (member_id);

CREATE INDEX idx_badge_requests_status
    ON badge_requests (status);

CREATE INDEX idx_badge_requests_requested_by
    ON badge_requests (requested_by);

CREATE INDEX idx_badge_requests_created_at
    ON badge_requests (created_at DESC);

-- 동일 멤버+뱃지 조합에 대해 'requested' 상태는 하나만 허용
CREATE UNIQUE INDEX idx_badge_requests_pending_unique
    ON badge_requests (member_id, badge_id)
    WHERE status = 'requested';


-- ============================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE badge_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: 인증된 사용자 전체 조회 허용
CREATE POLICY "badge_requests_select"
    ON badge_requests
    FOR SELECT
    TO authenticated
    USING (true);

-- INSERT: 인증된 사용자는 본인 명의로만 신청 가능
CREATE POLICY "badge_requests_insert"
    ON badge_requests
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM teachers
            WHERE teachers.user_id = auth.uid()
              AND teachers.id = badge_requests.requested_by
        )
    );

-- UPDATE: 신청자 본인, 관리자(admin), 또는 서기/감독관/조정관만 수정 가능
CREATE POLICY "badge_requests_update"
    ON badge_requests
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM teachers
            WHERE teachers.user_id = auth.uid()
              AND (
                teachers.id = badge_requests.requested_by
                OR teachers.role = 'admin'
                OR teachers.position IN ('서기', '감독관', '조정관')
              )
        )
    );


-- ============================================
-- 6. NOTIFICATION_TYPE ENUM 확장
-- ============================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'badge_requested';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'badge_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'badge_rejected';


-- ============================================
-- 7. UPDATED_AT 자동 갱신 트리거
-- ============================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER badge_requests_set_updated_at
  BEFORE UPDATE ON badge_requests
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();


-- ============================================
-- 8. REALTIME 활성화
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE badge_requests;
