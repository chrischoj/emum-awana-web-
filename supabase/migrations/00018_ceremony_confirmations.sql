-- ============================================
-- Migration 00018: 시상식 확정 데이터 테이블
-- ============================================

CREATE TABLE ceremony_confirmations (
    id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    date_from       date         NOT NULL,
    date_to         date         NOT NULL,
    scores          jsonb        NOT NULL,       -- AwardsData: {handbook:{sparks:{...},tnt:{...}}, game:{sparks:{...},tnt:{...}}}
    bonus_details   jsonb,                       -- [{team, club, points, reason}]
    confirmed_by    uuid         REFERENCES teachers(id) ON DELETE SET NULL,
    confirmed_at    timestamptz  NOT NULL DEFAULT now(),
    created_at      timestamptz  DEFAULT now()
);

-- 최신 확정 데이터를 빠르게 조회하기 위한 인덱스
CREATE INDEX idx_ceremony_conf_confirmed_at ON ceremony_confirmations (confirmed_at DESC);
CREATE INDEX idx_ceremony_conf_dates ON ceremony_confirmations (date_from, date_to);

-- RLS
ALTER TABLE ceremony_confirmations ENABLE ROW LEVEL SECURITY;

-- 누구나 읽기 가능 (공개 시상식 플레이용)
CREATE POLICY "ceremony_confirmations_select"
    ON ceremony_confirmations
    FOR SELECT
    USING (true);

-- 인증된 사용자만 쓰기
CREATE POLICY "ceremony_confirmations_insert"
    ON ceremony_confirmations
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "ceremony_confirmations_update"
    ON ceremony_confirmations
    FOR UPDATE
    TO authenticated
    USING (true);
