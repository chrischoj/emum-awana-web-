-- ============================================
-- Consolidated Schema Update for Awana Club Management
-- Adds: teams, game_score_entries, curriculum_templates,
--        weekly_scores, late_absence_tracking, badges,
--        member_badges, rooms, room_sessions, room_teachers
-- Modifies: members (add team_id), member_attendance (add status enum)
-- ============================================

-- New enum types
CREATE TYPE attendance_status AS ENUM ('present', 'late', 'absent');
CREATE TYPE scoring_category AS ENUM ('attendance', 'handbook', 'uniform', 'recitation');
CREATE TYPE badge_type AS ENUM ('handbook_completion', 'attendance_perfect', 'memorization', 'special', 'custom');

-- Teams table (fixed 4 teams per club: RED, BLUE, GREEN, YELLOW)
CREATE TABLE IF NOT EXISTS teams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id uuid REFERENCES clubs NOT NULL,
    name text NOT NULL,
    color text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(club_id, name)
);

-- Add team_id to members
ALTER TABLE members ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams;

-- Modify member_attendance: add status and absence_reason
ALTER TABLE member_attendance ADD COLUMN IF NOT EXISTS status attendance_status DEFAULT 'present';
ALTER TABLE member_attendance ADD COLUMN IF NOT EXISTS absence_reason text;

-- Curriculum templates
CREATE TABLE IF NOT EXISTS curriculum_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_type club_type NOT NULL UNIQUE,
    name text NOT NULL,
    scoring_categories jsonb NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Weekly scores (per member, per category, per date)
CREATE TABLE IF NOT EXISTS weekly_scores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid REFERENCES members NOT NULL,
    club_id uuid REFERENCES clubs NOT NULL,
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

-- Game score entries (team-level scores)
CREATE TABLE IF NOT EXISTS game_score_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid REFERENCES teams NOT NULL,
    club_id uuid REFERENCES clubs NOT NULL,
    training_date date NOT NULL,
    points integer NOT NULL,
    description text,
    recorded_by uuid REFERENCES teachers,
    created_at timestamptz DEFAULT now()
);

-- Late/absence tracking (3 lates = 1 absence)
CREATE TABLE IF NOT EXISTS late_absence_tracking (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid REFERENCES members NOT NULL,
    semester text NOT NULL,
    late_count integer NOT NULL DEFAULT 0,
    converted_absences integer NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(member_id, semester)
);

-- Badges definition
CREATE TABLE IF NOT EXISTS badges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    badge_type badge_type NOT NULL,
    description text,
    icon_url text,
    curriculum_template_id uuid REFERENCES curriculum_templates,
    created_at timestamptz DEFAULT now()
);

-- Member badges (awarded badges)
CREATE TABLE IF NOT EXISTS member_badges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid REFERENCES members NOT NULL,
    badge_id uuid REFERENCES badges NOT NULL,
    awarded_by uuid REFERENCES teachers,
    awarded_date date NOT NULL DEFAULT CURRENT_DATE,
    note text,
    created_at timestamptz DEFAULT now(),
    UNIQUE(member_id, badge_id)
);

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id uuid REFERENCES clubs NOT NULL,
    name text NOT NULL,
    qr_code_data text UNIQUE,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Room sessions (active class sessions)
CREATE TABLE IF NOT EXISTS room_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid REFERENCES rooms NOT NULL,
    training_date date NOT NULL,
    started_at timestamptz DEFAULT now(),
    ended_at timestamptz,
    status text DEFAULT 'active',
    created_at timestamptz DEFAULT now(),
    UNIQUE(room_id, training_date)
);

-- Room teachers (teacher check-ins)
CREATE TABLE IF NOT EXISTS room_teachers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_session_id uuid REFERENCES room_sessions NOT NULL,
    teacher_id uuid REFERENCES teachers NOT NULL,
    checked_in_at timestamptz DEFAULT now(),
    UNIQUE(room_session_id, teacher_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_weekly_scores_member_date ON weekly_scores(member_id, training_date);
CREATE INDEX IF NOT EXISTS idx_weekly_scores_club_date ON weekly_scores(club_id, training_date);
CREATE INDEX IF NOT EXISTS idx_game_score_entries_club_date ON game_score_entries(club_id, training_date);
CREATE INDEX IF NOT EXISTS idx_game_score_entries_team_date ON game_score_entries(team_id, training_date);
CREATE INDEX IF NOT EXISTS idx_members_team ON members(team_id);
CREATE INDEX IF NOT EXISTS idx_member_attendance_date ON member_attendance(training_date);
CREATE INDEX IF NOT EXISTS idx_room_sessions_date ON room_sessions(training_date);

-- Enable RLS on new tables
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_score_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE late_absence_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_teachers ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Teams: everyone can read, admin can write
CREATE POLICY "Teams readable by all authenticated" ON teams
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Teams writable by admin" ON teams
    FOR ALL USING (
        EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND role = 'admin')
    );

-- Curriculum templates: everyone can read, admin can write
CREATE POLICY "Templates readable by all" ON curriculum_templates
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Templates writable by admin" ON curriculum_templates
    FOR ALL USING (
        EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND role = 'admin')
    );

-- Weekly scores: teachers can read/write their club's scores
CREATE POLICY "Weekly scores readable by authenticated" ON weekly_scores
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Weekly scores writable by teachers" ON weekly_scores
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND active = true)
    );
CREATE POLICY "Weekly scores updatable by teachers" ON weekly_scores
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND active = true)
    );

-- Game score entries: teachers can read/write
CREATE POLICY "Game scores readable by authenticated" ON game_score_entries
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Game scores writable by teachers" ON game_score_entries
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND active = true)
    );

-- Late absence tracking: teachers can read/write
CREATE POLICY "Late tracking readable by authenticated" ON late_absence_tracking
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Late tracking writable by teachers" ON late_absence_tracking
    FOR ALL USING (
        EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND active = true)
    );

-- Badges: everyone reads, admin writes
CREATE POLICY "Badges readable by all" ON badges
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Badges writable by admin" ON badges
    FOR ALL USING (
        EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND role = 'admin')
    );

-- Member badges: teachers can read/write
CREATE POLICY "Member badges readable by authenticated" ON member_badges
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Member badges writable by teachers" ON member_badges
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND active = true)
    );

-- Rooms: everyone reads, admin writes
CREATE POLICY "Rooms readable by authenticated" ON rooms
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Rooms writable by admin" ON rooms
    FOR ALL USING (
        EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND role = 'admin')
    );

-- Room sessions: teachers can read/write
CREATE POLICY "Room sessions readable by authenticated" ON room_sessions
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Room sessions writable by teachers" ON room_sessions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND active = true)
    );

-- Room teachers: teachers can read/write
CREATE POLICY "Room teachers readable by authenticated" ON room_teachers
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Room teachers writable by teachers" ON room_teachers
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM teachers WHERE user_id = auth.uid() AND active = true)
    );

-- Seed: Sparks curriculum template
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
]'::jsonb)
ON CONFLICT (club_type) DO NOTHING;

-- Seed: Default 4 teams for each club
-- We use a DO block because we need to reference club IDs dynamically
DO $$
DECLARE
    v_club_id uuid;
BEGIN
    -- Create teams for each club
    FOR v_club_id IN SELECT id FROM clubs LOOP
        INSERT INTO teams (club_id, name, color) VALUES
            (v_club_id, 'RED', '#EF4444'),
            (v_club_id, 'BLUE', '#3B82F6'),
            (v_club_id, 'GREEN', '#22C55E'),
            (v_club_id, 'YELLOW', '#EAB308')
        ON CONFLICT (club_id, name) DO NOTHING;
    END LOOP;
END $$;
