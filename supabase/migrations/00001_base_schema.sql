-- ============================================
-- Awana Club Management System - Base Schema v3
-- ============================================

-- ============================================
-- 1. ENUM TYPES
-- ============================================

CREATE TYPE club_type AS ENUM ('sparks', 'tnt');
CREATE TYPE user_role AS ENUM ('admin', 'teacher');
CREATE TYPE enrollment_status AS ENUM ('pending', 'active', 'inactive');
CREATE TYPE attendance_status AS ENUM ('present', 'late', 'absent');
CREATE TYPE scoring_category AS ENUM ('attendance', 'handbook', 'uniform', 'recitation');
CREATE TYPE badge_type AS ENUM ('handbook_completion', 'attendance_perfect', 'memorization', 'special', 'custom');
CREATE TYPE submission_status AS ENUM ('draft', 'submitted', 'approved', 'rejected');

-- ============================================
-- 2. BASE TABLES
-- ============================================

-- 2.1 Clubs
CREATE TABLE clubs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    type club_type NOT NULL UNIQUE,
    logo_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2.2 Teachers
CREATE TABLE teachers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid UNIQUE REFERENCES auth.users ON DELETE CASCADE,
    club_id uuid REFERENCES clubs,
    name text NOT NULL,
    phone text,
    role user_role NOT NULL DEFAULT 'teacher',
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2.3 Teams
CREATE TABLE teams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id uuid NOT NULL REFERENCES clubs,
    name text NOT NULL,
    color text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(club_id, name)
);

-- 2.4 Members
CREATE TABLE members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id uuid NOT NULL REFERENCES clubs,
    team_id uuid REFERENCES teams,
    name text NOT NULL,
    birthday date,
    parent_name text,
    parent_phone text,
    uniform_size text,
    enrollment_status enrollment_status NOT NULL DEFAULT 'pending',
    registered_by uuid REFERENCES teachers,
    approved_by uuid REFERENCES teachers,
    approved_at timestamptz,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ============================================
-- 3. ROOMS
-- ============================================

CREATE TABLE rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id uuid NOT NULL REFERENCES clubs,
    team_id uuid NOT NULL REFERENCES teams,
    name text NOT NULL,
    qr_code_data text UNIQUE,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE room_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL REFERENCES rooms,
    training_date date NOT NULL,
    started_at timestamptz DEFAULT now(),
    ended_at timestamptz,
    status text DEFAULT 'active',
    created_at timestamptz DEFAULT now(),
    UNIQUE(room_id, training_date)
);

CREATE TABLE room_teachers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_session_id uuid NOT NULL REFERENCES room_sessions,
    teacher_id uuid NOT NULL REFERENCES teachers,
    checked_in_at timestamptz DEFAULT now(),
    UNIQUE(room_session_id, teacher_id)
);

-- ============================================
-- 4. ATTENDANCE
-- ============================================

CREATE TABLE teacher_attendance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id uuid NOT NULL REFERENCES teachers,
    training_date date NOT NULL,
    present boolean DEFAULT false,
    note text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(teacher_id, training_date)
);

CREATE TABLE member_attendance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid NOT NULL REFERENCES members,
    training_date date NOT NULL,
    present boolean DEFAULT false,
    status attendance_status DEFAULT 'present',
    absence_reason text,
    note text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(member_id, training_date)
);

-- ============================================
-- 5. SCORING
-- ============================================

CREATE TABLE curriculum_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_type club_type NOT NULL UNIQUE,
    name text NOT NULL,
    scoring_categories jsonb NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE weekly_scores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid NOT NULL REFERENCES members,
    club_id uuid NOT NULL REFERENCES clubs,
    training_date date NOT NULL,
    category scoring_category NOT NULL,
    base_points integer NOT NULL DEFAULT 0,
    multiplier integer NOT NULL DEFAULT 1,
    total_points integer GENERATED ALWAYS AS (base_points * multiplier) STORED,
    recorded_by uuid REFERENCES teachers,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(member_id, training_date, category)
);

CREATE TABLE game_score_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES teams,
    club_id uuid NOT NULL REFERENCES clubs,
    training_date date NOT NULL,
    points integer NOT NULL,
    description text,
    recorded_by uuid REFERENCES teachers,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE weekly_score_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id uuid NOT NULL REFERENCES clubs,
    team_id uuid NOT NULL REFERENCES teams,
    training_date date NOT NULL,
    status submission_status NOT NULL DEFAULT 'draft',
    submitted_by uuid REFERENCES teachers,
    submitted_at timestamptz,
    approved_by uuid REFERENCES teachers,
    approved_at timestamptz,
    rejection_note text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(club_id, team_id, training_date)
);

-- ============================================
-- 6. LATE/ABSENCE TRACKING
-- ============================================

CREATE TABLE late_absence_tracking (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid NOT NULL REFERENCES members,
    semester text NOT NULL,
    late_count integer NOT NULL DEFAULT 0,
    converted_absences integer NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(member_id, semester)
);

-- ============================================
-- 7. BADGES
-- ============================================

CREATE TABLE badges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    badge_type badge_type NOT NULL,
    description text,
    icon_url text,
    curriculum_template_id uuid REFERENCES curriculum_templates,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE member_badges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid NOT NULL REFERENCES members,
    badge_id uuid NOT NULL REFERENCES badges,
    awarded_by uuid REFERENCES teachers,
    awarded_date date NOT NULL DEFAULT CURRENT_DATE,
    note text,
    created_at timestamptz DEFAULT now(),
    UNIQUE(member_id, badge_id)
);

-- ============================================
-- 8. TRAINING SCHEDULES
-- ============================================

CREATE TABLE training_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id uuid REFERENCES clubs,
    training_date date NOT NULL,
    is_holiday boolean DEFAULT false,
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ============================================
-- 9. INDEXES
-- ============================================

CREATE INDEX idx_teachers_user_id ON teachers(user_id);
CREATE INDEX idx_teachers_club_id ON teachers(club_id);
CREATE INDEX idx_members_club_id ON members(club_id);
CREATE INDEX idx_members_team_id ON members(team_id);
CREATE INDEX idx_members_enrollment ON members(enrollment_status);
CREATE INDEX idx_rooms_team_id ON rooms(team_id);
CREATE INDEX idx_room_sessions_date ON room_sessions(training_date);
CREATE INDEX idx_teacher_attendance_date ON teacher_attendance(training_date);
CREATE INDEX idx_member_attendance_date ON member_attendance(training_date);
CREATE INDEX idx_weekly_scores_member_date ON weekly_scores(member_id, training_date);
CREATE INDEX idx_weekly_scores_club_date ON weekly_scores(club_id, training_date);
CREATE INDEX idx_game_scores_club_date ON game_score_entries(club_id, training_date);
CREATE INDEX idx_game_scores_team_date ON game_score_entries(team_id, training_date);
CREATE INDEX idx_submissions_club_date ON weekly_score_submissions(club_id, training_date);
CREATE INDEX idx_training_schedules_date ON training_schedules(training_date);

-- ============================================
-- 10. RLS (간소화 정책)
-- ============================================

ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_score_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_score_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE late_absence_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_schedules ENABLE ROW LEVEL SECURITY;

-- clubs: 누구나 읽기, admin만 쓰기
CREATE POLICY "clubs_select" ON clubs FOR SELECT USING (true);
CREATE POLICY "clubs_all_admin" ON clubs FOR ALL USING (
    EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND role = 'admin')
);

-- teachers: 인증 사용자 읽기, 가입 시 INSERT 허용, 본인/admin 수정
CREATE POLICY "teachers_select" ON teachers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "teachers_insert" ON teachers FOR INSERT WITH CHECK (true);
CREATE POLICY "teachers_update" ON teachers FOR UPDATE USING (
    user_id = auth.uid() OR EXISTS (SELECT 1 FROM teachers t WHERE t.user_id = auth.uid() AND t.role = 'admin')
);

-- teams: 인증 읽기, admin 쓰기
CREATE POLICY "teams_select" ON teams FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "teams_all_admin" ON teams FOR ALL USING (
    EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND role = 'admin')
);

-- members: 인증 읽기/쓰기
CREATE POLICY "members_select" ON members FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "members_insert" ON members FOR INSERT WITH CHECK (true);
CREATE POLICY "members_update" ON members FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "members_delete" ON members FOR DELETE USING (
    EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND role = 'admin')
);

-- rooms: 인증 읽기, admin 쓰기
CREATE POLICY "rooms_select" ON rooms FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rooms_all_admin" ON rooms FOR ALL USING (
    EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND role = 'admin')
);

-- room_sessions: 인증 읽기/쓰기
CREATE POLICY "room_sessions_select" ON room_sessions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "room_sessions_insert" ON room_sessions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "room_sessions_update" ON room_sessions FOR UPDATE USING (auth.role() = 'authenticated');

-- room_teachers: 인증 읽기/쓰기
CREATE POLICY "room_teachers_select" ON room_teachers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "room_teachers_insert" ON room_teachers FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- teacher_attendance: 인증 읽기/쓰기
CREATE POLICY "teacher_att_select" ON teacher_attendance FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "teacher_att_insert" ON teacher_attendance FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "teacher_att_update" ON teacher_attendance FOR UPDATE USING (auth.role() = 'authenticated');

-- member_attendance: 인증 읽기/쓰기
CREATE POLICY "member_att_select" ON member_attendance FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "member_att_insert" ON member_attendance FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "member_att_update" ON member_attendance FOR UPDATE USING (auth.role() = 'authenticated');

-- curriculum_templates: 인증 읽기, admin 쓰기
CREATE POLICY "curriculum_select" ON curriculum_templates FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "curriculum_all_admin" ON curriculum_templates FOR ALL USING (
    EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND role = 'admin')
);

-- weekly_scores: 인증 읽기/쓰기
CREATE POLICY "scores_select" ON weekly_scores FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "scores_insert" ON weekly_scores FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "scores_update" ON weekly_scores FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "scores_delete" ON weekly_scores FOR DELETE USING (auth.role() = 'authenticated');

-- game_score_entries: 인증 읽기/쓰기/삭제
CREATE POLICY "game_scores_select" ON game_score_entries FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_scores_insert" ON game_score_entries FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "game_scores_delete" ON game_score_entries FOR DELETE USING (auth.role() = 'authenticated');

-- weekly_score_submissions: 인증 읽기/쓰기
CREATE POLICY "submissions_select" ON weekly_score_submissions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "submissions_insert" ON weekly_score_submissions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "submissions_update" ON weekly_score_submissions FOR UPDATE USING (auth.role() = 'authenticated');

-- late_absence_tracking: 인증 읽기/쓰기
CREATE POLICY "late_tracking_select" ON late_absence_tracking FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "late_tracking_insert" ON late_absence_tracking FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "late_tracking_update" ON late_absence_tracking FOR UPDATE USING (auth.role() = 'authenticated');

-- badges: 인증 읽기, admin 쓰기
CREATE POLICY "badges_select" ON badges FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "badges_all_admin" ON badges FOR ALL USING (
    EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND role = 'admin')
);

-- member_badges: 인증 읽기/쓰기, admin 삭제
CREATE POLICY "member_badges_select" ON member_badges FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "member_badges_insert" ON member_badges FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "member_badges_delete" ON member_badges FOR DELETE USING (
    EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND role = 'admin')
);

-- training_schedules: 인증 읽기, admin 쓰기
CREATE POLICY "schedules_select" ON training_schedules FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "schedules_all_admin" ON training_schedules FOR ALL USING (
    EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND role = 'admin')
);

-- ============================================
-- 11. SEED DATA
-- ============================================

-- 클럽 2개
INSERT INTO clubs (name, type) VALUES
    ('스팍스', 'sparks'),
    ('티앤티', 'tnt');

-- 각 클럽별 4팀 (총 8팀) + 각 팀별 기본 룸 (총 8룸)
DO $$
DECLARE
    v_club RECORD;
    v_team_id uuid;
    v_teams text[] := ARRAY['RED', 'BLUE', 'GREEN', 'YELLOW'];
    v_colors text[] := ARRAY['#EF4444', '#3B82F6', '#22C55E', '#EAB308'];
    i integer;
BEGIN
    FOR v_club IN SELECT id, name FROM clubs LOOP
        FOR i IN 1..4 LOOP
            INSERT INTO teams (club_id, name, color)
            VALUES (v_club.id, v_teams[i], v_colors[i])
            RETURNING id INTO v_team_id;

            INSERT INTO rooms (club_id, team_id, name)
            VALUES (v_club.id, v_team_id, v_club.name || ' ' || v_teams[i] || ' 룸');
        END LOOP;
    END LOOP;
END $$;

-- 커리큘럼 템플릿
INSERT INTO curriculum_templates (club_type, name, scoring_categories) VALUES
('sparks', 'Sparks 기본 커리큘럼', '[
    {"key": "attendance", "label": "출석", "basePoints": 50, "multiplier": false},
    {"key": "handbook", "label": "핸드북", "basePoints": 50, "multiplier": false},
    {"key": "uniform", "label": "단복", "basePoints": 50, "multiplier": false},
    {"key": "recitation", "label": "암송", "basePoints": 100, "multiplier": true, "multiplierLabel": "구절 수"}
]'::jsonb),
('tnt', 'T&T 기본 커리큘럼', '[
    {"key": "attendance", "label": "출석", "basePoints": 50, "multiplier": false},
    {"key": "handbook", "label": "핸드북", "basePoints": 50, "multiplier": false},
    {"key": "uniform", "label": "단복", "basePoints": 50, "multiplier": false},
    {"key": "recitation", "label": "암송", "basePoints": 100, "multiplier": true, "multiplierLabel": "구절 수"}
]'::jsonb);

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS position text;