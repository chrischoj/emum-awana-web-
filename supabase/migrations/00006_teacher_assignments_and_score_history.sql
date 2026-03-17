-- ============================================
-- Migration 00006: Teacher Room Assignments & Score Edit History
-- ============================================
-- 변경 내용:
--   1. assignment_type ENUM 추가
--   2. teacher_room_assignments 테이블 생성
--   3. score_edit_history 테이블 생성
--   4. 인덱스 생성
--   5. RLS 정책 설정
--   6. active_teacher_assignments 뷰 생성
-- ============================================


-- ============================================
-- 1. ENUM TYPES
-- ============================================

CREATE TYPE assignment_type AS ENUM ('primary', 'temporary');


-- ============================================
-- 2. TABLES
-- ============================================

-- 2.1 교사-방 배정 테이블
--     교사가 어떤 방을 담당하는지 기록 (기본 배정 / 임시 배정 구분)
CREATE TABLE teacher_room_assignments (
    id               uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id       uuid             NOT NULL REFERENCES teachers ON DELETE CASCADE,
    room_id          uuid             NOT NULL REFERENCES rooms ON DELETE CASCADE,
    assignment_type  assignment_type  NOT NULL DEFAULT 'primary',
    effective_date   date             NOT NULL DEFAULT CURRENT_DATE,
    end_date         date,
    created_by       uuid             REFERENCES teachers,
    created_at       timestamptz      DEFAULT now(),
    updated_at       timestamptz      DEFAULT now(),

    -- 같은 교사-방 조합에 동일 배정 유형 중복 방지
    UNIQUE (teacher_id, room_id, assignment_type),

    -- 종료일은 시작일 이후여야 함
    CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date >= effective_date)
);

COMMENT ON TABLE  teacher_room_assignments                IS '교사-방 배정 이력 (기본 배정 및 임시 배정)';
COMMENT ON COLUMN teacher_room_assignments.assignment_type IS 'primary: 기본 담당, temporary: 임시 대리';
COMMENT ON COLUMN teacher_room_assignments.effective_date  IS '배정 시작일';
COMMENT ON COLUMN teacher_room_assignments.end_date        IS '배정 종료일 (NULL이면 현재 진행 중)';
COMMENT ON COLUMN teacher_room_assignments.created_by      IS '배정을 등록한 교사 (관리자)';


-- 2.2 점수 수정 이력 테이블
--     weekly_scores 수정 시 변경 전후 값을 기록하여 감사 추적 가능
CREATE TABLE score_edit_history (
    id                 uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    weekly_score_id    uuid             NOT NULL REFERENCES weekly_scores ON DELETE CASCADE,
    member_id          uuid             NOT NULL REFERENCES members,
    club_id            uuid             NOT NULL REFERENCES clubs,
    training_date      date             NOT NULL,
    category           scoring_category NOT NULL,
    old_base_points    integer          NOT NULL,
    old_multiplier     integer          NOT NULL,
    old_total_points   integer          NOT NULL,
    new_base_points    integer          NOT NULL,
    new_multiplier     integer          NOT NULL,
    new_total_points   integer          NOT NULL,
    edited_by          uuid             NOT NULL REFERENCES teachers,
    edit_reason        text,
    created_at         timestamptz      DEFAULT now()
);

COMMENT ON TABLE  score_edit_history               IS '점수 수정 감사 이력';
COMMENT ON COLUMN score_edit_history.edit_reason   IS '수정 사유 (선택 입력)';
COMMENT ON COLUMN score_edit_history.edited_by     IS '점수를 수정한 교사';


-- ============================================
-- 3. INDEXES
-- ============================================

-- teacher_room_assignments 인덱스
CREATE INDEX idx_tra_teacher_id
    ON teacher_room_assignments (teacher_id);

CREATE INDEX idx_tra_room_id
    ON teacher_room_assignments (room_id);

CREATE INDEX idx_tra_effective_date
    ON teacher_room_assignments (effective_date);

-- 현재 활성 배정만 대상으로 하는 부분 인덱스 (end_date 없는 레코드)
CREATE INDEX idx_tra_active
    ON teacher_room_assignments (teacher_id, room_id)
    WHERE end_date IS NULL;

-- score_edit_history 인덱스
CREATE INDEX idx_seh_weekly_score_id
    ON score_edit_history (weekly_score_id);

CREATE INDEX idx_seh_member_training_date
    ON score_edit_history (member_id, training_date);

CREATE INDEX idx_seh_edited_by
    ON score_edit_history (edited_by);


-- ============================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE teacher_room_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_edit_history       ENABLE ROW LEVEL SECURITY;

-- ---- teacher_room_assignments ----

-- 인증된 사용자는 모든 배정 조회 가능
CREATE POLICY "teacher_room_assignments_select"
    ON teacher_room_assignments
    FOR SELECT
    TO authenticated
    USING (true);

-- 관리자(admin)만 배정 생성 가능
CREATE POLICY "teacher_room_assignments_insert"
    ON teacher_room_assignments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM teachers
            WHERE teachers.user_id = auth.uid()
              AND teachers.role = 'admin'
        )
    );

-- 관리자(admin)만 배정 수정 가능
CREATE POLICY "teacher_room_assignments_update"
    ON teacher_room_assignments
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM teachers
            WHERE teachers.user_id = auth.uid()
              AND teachers.role = 'admin'
        )
    );

-- 관리자(admin)만 배정 삭제 가능
CREATE POLICY "teacher_room_assignments_delete"
    ON teacher_room_assignments
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM teachers
            WHERE teachers.user_id = auth.uid()
              AND teachers.role = 'admin'
        )
    );

-- ---- score_edit_history ----

-- 인증된 사용자는 모든 수정 이력 조회 가능
CREATE POLICY "score_edit_history_select"
    ON score_edit_history
    FOR SELECT
    TO authenticated
    USING (true);

-- 인증된 사용자는 수정 이력 삽입 가능 (점수 수정 시 자동 기록)
CREATE POLICY "score_edit_history_insert"
    ON score_edit_history
    FOR INSERT
    TO authenticated
    WITH CHECK (
        -- 본인(교사) 명의로만 기록 가능
        EXISTS (
            SELECT 1 FROM teachers
            WHERE teachers.user_id = auth.uid()
              AND teachers.id = score_edit_history.edited_by
        )
    );


-- ============================================
-- 5. VIEWS
-- ============================================

-- 현재 날짜 기준 활성 상태인 교사-방 배정 뷰
CREATE OR REPLACE VIEW active_teacher_assignments AS
SELECT
    tra.id,
    tra.teacher_id,
    tra.room_id,
    tra.assignment_type,
    tra.effective_date,
    tra.end_date,
    r.club_id,
    r.team_id,
    r.name  AS room_name,
    t.name  AS team_name,
    t.color AS team_color
FROM teacher_room_assignments tra
JOIN rooms r ON r.id = tra.room_id
JOIN teams t ON t.id = r.team_id
WHERE tra.effective_date <= CURRENT_DATE
  AND (tra.end_date IS NULL OR tra.end_date >= CURRENT_DATE)
  AND r.active = true;

COMMENT ON VIEW active_teacher_assignments IS '현재 활성 상태인 교사-방 배정 (오늘 날짜 기준)';
