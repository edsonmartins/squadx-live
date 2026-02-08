-- =============================================
-- SquadX Live Calendar System - Database Schema
-- =============================================
-- Run this migration in your Supabase SQL Editor
-- =============================================

-- 1. Meetings Table
CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INT DEFAULT 30,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    -- Recurrence
    recurrence_rule TEXT,                    -- RRULE format (RFC 5545)
    recurrence_parent_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
    -- Google Calendar Integration
    google_event_id TEXT,
    google_calendar_id TEXT,
    -- Notifications
    reminder_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Meeting Attendees Table
CREATE TABLE IF NOT EXISTS meeting_attendees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    response_status TEXT DEFAULT 'invited' CHECK (response_status IN ('invited', 'accepted', 'declined', 'tentative')),
    responded_at TIMESTAMPTZ,
    notification_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(meeting_id, user_id)
);

-- 3. Google Calendar Tokens Table
CREATE TABLE IF NOT EXISTS user_google_tokens (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    calendar_id TEXT DEFAULT 'primary',
    email TEXT,
    sync_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Notification Queue Table
CREATE TABLE IF NOT EXISTS notification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL CHECK (notification_type IN ('reminder', 'invite', 'update', 'cancel')),
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- Indexes for Performance
-- =============================================

CREATE INDEX IF NOT EXISTS idx_meetings_organizer_id ON meetings(organizer_id);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_at ON meetings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_recurrence_parent ON meetings(recurrence_parent_id);
CREATE INDEX IF NOT EXISTS idx_meetings_google_event ON meetings(google_event_id);

CREATE INDEX IF NOT EXISTS idx_meeting_attendees_meeting_id ON meeting_attendees(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_user_id ON meeting_attendees(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_response ON meeting_attendees(response_status);

CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled ON notification_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notification_queue_meeting ON notification_queue(meeting_id);

-- =============================================
-- Row Level Security (RLS) Policies
-- =============================================

-- Enable RLS on all tables
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_google_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

-- Meetings: Users can see meetings they organize or attend
CREATE POLICY "Users can view their meetings"
    ON meetings FOR SELECT
    USING (
        organizer_id = auth.uid() OR
        id IN (
            SELECT meeting_id
            FROM meeting_attendees
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create meetings"
    ON meetings FOR INSERT
    WITH CHECK (organizer_id = auth.uid());

CREATE POLICY "Organizers can update their meetings"
    ON meetings FOR UPDATE
    USING (organizer_id = auth.uid());

CREATE POLICY "Organizers can delete their meetings"
    ON meetings FOR DELETE
    USING (organizer_id = auth.uid());

-- Meeting Attendees: Users can see attendees of meetings they're part of
CREATE POLICY "Users can view attendees of their meetings"
    ON meeting_attendees FOR SELECT
    USING (
        meeting_id IN (
            SELECT id FROM meetings WHERE organizer_id = auth.uid()
        ) OR
        meeting_id IN (
            SELECT meeting_id FROM meeting_attendees WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Organizers can add attendees"
    ON meeting_attendees FOR INSERT
    WITH CHECK (
        meeting_id IN (
            SELECT id FROM meetings WHERE organizer_id = auth.uid()
        )
    );

CREATE POLICY "Attendees can update their own response"
    ON meeting_attendees FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Organizers can remove attendees"
    ON meeting_attendees FOR DELETE
    USING (
        user_id = auth.uid() OR
        meeting_id IN (
            SELECT id FROM meetings WHERE organizer_id = auth.uid()
        )
    );

-- Google Tokens: Users can only access their own tokens
CREATE POLICY "Users can view their own google tokens"
    ON user_google_tokens FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own google tokens"
    ON user_google_tokens FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own google tokens"
    ON user_google_tokens FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own google tokens"
    ON user_google_tokens FOR DELETE
    USING (user_id = auth.uid());

-- Notification Queue: Users can see their own notifications
CREATE POLICY "Users can view their notifications"
    ON notification_queue FOR SELECT
    USING (user_id = auth.uid());

-- Service role can manage all notifications (for Edge Functions)
CREATE POLICY "Service can manage all notifications"
    ON notification_queue FOR ALL
    USING (auth.role() = 'service_role');

-- =============================================
-- Functions and Triggers
-- =============================================

-- Function to update meeting's updated_at
CREATE OR REPLACE FUNCTION update_meeting_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for meeting updates
DROP TRIGGER IF EXISTS trigger_update_meeting_timestamp ON meetings;
CREATE TRIGGER trigger_update_meeting_timestamp
    BEFORE UPDATE ON meetings
    FOR EACH ROW
    EXECUTE FUNCTION update_meeting_timestamp();

-- Function to auto-add organizer as attendee
CREATE OR REPLACE FUNCTION auto_add_organizer_as_attendee()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO meeting_attendees (meeting_id, user_id, response_status, responded_at)
    VALUES (NEW.id, NEW.organizer_id, 'accepted', NOW())
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-adding organizer
DROP TRIGGER IF EXISTS trigger_auto_add_organizer ON meetings;
CREATE TRIGGER trigger_auto_add_organizer
    AFTER INSERT ON meetings
    FOR EACH ROW
    EXECUTE FUNCTION auto_add_organizer_as_attendee();

-- Function to queue invite notifications when attendee is added
CREATE OR REPLACE FUNCTION queue_attendee_invite()
RETURNS TRIGGER AS $$
DECLARE
    meeting_time TIMESTAMPTZ;
BEGIN
    -- Get meeting time for reminder scheduling
    SELECT scheduled_at INTO meeting_time FROM meetings WHERE id = NEW.meeting_id;

    -- Queue invite notification (immediate)
    INSERT INTO notification_queue (meeting_id, user_id, notification_type, scheduled_for, status)
    VALUES (NEW.meeting_id, NEW.user_id, 'invite', NOW(), 'pending');

    -- Queue reminder notification (15 minutes before meeting)
    INSERT INTO notification_queue (meeting_id, user_id, notification_type, scheduled_for, status)
    VALUES (NEW.meeting_id, NEW.user_id, 'reminder', meeting_time - INTERVAL '15 minutes', 'pending');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for queuing notifications
DROP TRIGGER IF EXISTS trigger_queue_attendee_invite ON meeting_attendees;
CREATE TRIGGER trigger_queue_attendee_invite
    AFTER INSERT ON meeting_attendees
    FOR EACH ROW
    WHEN (NEW.user_id != (SELECT organizer_id FROM meetings WHERE id = NEW.meeting_id))
    EXECUTE FUNCTION queue_attendee_invite();

-- Function to queue update notifications
CREATE OR REPLACE FUNCTION queue_meeting_update_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- Only if scheduled_at or title changed
    IF OLD.scheduled_at != NEW.scheduled_at OR OLD.title != NEW.title THEN
        INSERT INTO notification_queue (meeting_id, user_id, notification_type, scheduled_for, status)
        SELECT NEW.id, user_id, 'update', NOW(), 'pending'
        FROM meeting_attendees
        WHERE meeting_id = NEW.id AND user_id != NEW.organizer_id;

        -- Update reminder times
        UPDATE notification_queue
        SET scheduled_for = NEW.scheduled_at - INTERVAL '15 minutes',
            status = 'pending',
            sent_at = NULL
        WHERE meeting_id = NEW.id
          AND notification_type = 'reminder'
          AND status = 'pending';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for meeting updates
DROP TRIGGER IF EXISTS trigger_queue_meeting_update ON meetings;
CREATE TRIGGER trigger_queue_meeting_update
    AFTER UPDATE ON meetings
    FOR EACH ROW
    WHEN (NEW.status = 'scheduled')
    EXECUTE FUNCTION queue_meeting_update_notification();

-- Function to queue cancel notifications
CREATE OR REPLACE FUNCTION queue_meeting_cancel_notification()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
        -- Queue cancel notifications
        INSERT INTO notification_queue (meeting_id, user_id, notification_type, scheduled_for, status)
        SELECT NEW.id, user_id, 'cancel', NOW(), 'pending'
        FROM meeting_attendees
        WHERE meeting_id = NEW.id AND user_id != NEW.organizer_id;

        -- Cancel pending reminders
        UPDATE notification_queue
        SET status = 'sent'  -- Mark as processed to skip
        WHERE meeting_id = NEW.id
          AND notification_type = 'reminder'
          AND status = 'pending';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for meeting cancellation
DROP TRIGGER IF EXISTS trigger_queue_meeting_cancel ON meetings;
CREATE TRIGGER trigger_queue_meeting_cancel
    AFTER UPDATE ON meetings
    FOR EACH ROW
    EXECUTE FUNCTION queue_meeting_cancel_notification();

-- =============================================
-- Helper Functions
-- =============================================

-- Function to get upcoming meetings for a user
CREATE OR REPLACE FUNCTION get_upcoming_meetings(p_user_id UUID, p_limit INT DEFAULT 10)
RETURNS TABLE (
    id UUID,
    title TEXT,
    scheduled_at TIMESTAMPTZ,
    duration_minutes INT,
    organizer_id UUID,
    status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT m.id, m.title, m.scheduled_at, m.duration_minutes, m.organizer_id, m.status
    FROM meetings m
    WHERE m.status = 'scheduled'
      AND m.scheduled_at > NOW()
      AND (
          m.organizer_id = p_user_id OR
          m.id IN (SELECT meeting_id FROM meeting_attendees WHERE user_id = p_user_id)
      )
    ORDER BY m.scheduled_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- Enable Realtime for tables
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_attendees;
ALTER PUBLICATION supabase_realtime ADD TABLE notification_queue;

-- =============================================
-- End of Migration
-- =============================================
