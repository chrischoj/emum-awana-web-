-- ============================================
-- Events & Event Participants
-- ============================================

-- events 테이블
CREATE TABLE events (
    id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text         NOT NULL,
    description     text,
    start_date      date         NOT NULL,
    end_date        date,
    status          text         NOT NULL DEFAULT 'upcoming',
    visibility      boolean      NOT NULL DEFAULT true,
    metadata        jsonb        DEFAULT '{}'::jsonb,
    created_by      uuid         REFERENCES teachers(id) ON DELETE SET NULL,
    created_at      timestamptz  DEFAULT now(),
    updated_at      timestamptz  DEFAULT now()
);

-- event_participants 테이블
CREATE TABLE event_participants (
    id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        uuid         NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    member_id       uuid         REFERENCES members(id) ON DELETE CASCADE,
    teacher_id      uuid         REFERENCES teachers(id) ON DELETE CASCADE,
    club_type       text         NOT NULL,
    role            text         NOT NULL DEFAULT 'player',
    sub_group       text,
    metadata        jsonb        DEFAULT '{}'::jsonb,
    created_at      timestamptz  DEFAULT now(),
    CONSTRAINT participant_check CHECK (
        (member_id IS NOT NULL AND teacher_id IS NULL) OR
        (member_id IS NULL AND teacher_id IS NOT NULL)
    ),
    UNIQUE(event_id, member_id),
    UNIQUE(event_id, teacher_id)
);

CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_dates ON events(start_date, end_date);
CREATE INDEX idx_event_participants_event ON event_participants(event_id);
CREATE INDEX idx_event_participants_member ON event_participants(member_id);
CREATE INDEX idx_event_participants_teacher ON event_participants(teacher_id);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_select" ON events FOR SELECT USING (true);
CREATE POLICY "events_insert" ON events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "events_update" ON events FOR UPDATE TO authenticated USING (true);
CREATE POLICY "events_delete" ON events FOR DELETE TO authenticated USING (true);

CREATE POLICY "event_participants_select" ON event_participants FOR SELECT USING (true);
CREATE POLICY "event_participants_insert" ON event_participants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "event_participants_update" ON event_participants FOR UPDATE TO authenticated USING (true);
CREATE POLICY "event_participants_delete" ON event_participants FOR DELETE TO authenticated USING (true);
