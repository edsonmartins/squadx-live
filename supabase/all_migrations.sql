-- Create profiles table
-- Stores user profile information linked to auth.users

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS profiles_display_name_idx ON public.profiles(display_name);
-- Create session status enum
CREATE TYPE public.session_status AS ENUM ('created', 'active', 'paused', 'ended');

-- Create sessions table
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.session_status NOT NULL DEFAULT 'created',
  join_code TEXT NOT NULL UNIQUE,
  settings JSONB NOT NULL DEFAULT '{"quality": "medium", "allowControl": true, "maxParticipants": 5}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Create function to generate unique 6-character join code
CREATE OR REPLACE FUNCTION public.generate_join_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Removed ambiguous chars: I,O,0,1
  code TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate unique join code with retry
CREATE OR REPLACE FUNCTION public.generate_unique_join_code()
RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
  max_attempts INTEGER := 10;
  attempt INTEGER := 0;
BEGIN
  LOOP
    new_code := public.generate_join_code();

    -- Check if code already exists
    IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE join_code = new_code) THEN
      RETURN new_code;
    END IF;

    attempt := attempt + 1;
    IF attempt >= max_attempts THEN
      RAISE EXCEPTION 'Failed to generate unique join code after % attempts', max_attempts;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate join code
CREATE OR REPLACE FUNCTION public.handle_new_session()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.join_code IS NULL OR NEW.join_code = '' THEN
    NEW.join_code := public.generate_unique_join_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_generate_join_code
  BEFORE INSERT ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_session();

-- Create indexes
CREATE INDEX IF NOT EXISTS sessions_host_user_id_idx ON public.sessions(host_user_id);
CREATE INDEX IF NOT EXISTS sessions_join_code_idx ON public.sessions(join_code);
CREATE INDEX IF NOT EXISTS sessions_status_idx ON public.sessions(status);
-- Create participant role enum
CREATE TYPE public.participant_role AS ENUM ('host', 'viewer');

-- Create control state enum
CREATE TYPE public.control_state AS ENUM ('view-only', 'requested', 'granted');

-- Create session_participants table
CREATE TABLE IF NOT EXISTS public.session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL for guests
  display_name TEXT NOT NULL,
  role public.participant_role NOT NULL DEFAULT 'viewer',
  control_state public.control_state NOT NULL DEFAULT 'view-only',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.session_participants ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS session_participants_session_id_idx ON public.session_participants(session_id);
CREATE INDEX IF NOT EXISTS session_participants_user_id_idx ON public.session_participants(user_id);

-- Create unique constraint: one active participation per user per session
CREATE UNIQUE INDEX IF NOT EXISTS session_participants_unique_active
  ON public.session_participants(session_id, user_id)
  WHERE left_at IS NULL AND user_id IS NOT NULL;
-- RPC function: create_session
-- Creates a new session with the authenticated user as host
CREATE OR REPLACE FUNCTION public.create_session(
  p_settings JSONB DEFAULT NULL
)
RETURNS public.sessions AS $$
DECLARE
  v_session public.sessions;
  v_default_settings JSONB := '{"quality": "medium", "allowControl": true, "maxParticipants": 5}'::jsonb;
BEGIN
  -- Ensure user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Create the session
  INSERT INTO public.sessions (host_user_id, settings, status)
  VALUES (
    auth.uid(),
    COALESCE(p_settings, v_default_settings),
    'created'
  )
  RETURNING * INTO v_session;

  -- Add host as participant
  INSERT INTO public.session_participants (session_id, user_id, display_name, role, control_state)
  SELECT
    v_session.id,
    auth.uid(),
    COALESCE(p.display_name, 'Host'),
    'host',
    'granted'
  FROM public.profiles p
  WHERE p.id = auth.uid();

  RETURN v_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function: join_session
-- Joins an existing session by join code
CREATE OR REPLACE FUNCTION public.join_session(
  p_join_code TEXT,
  p_display_name TEXT DEFAULT NULL
)
RETURNS public.session_participants AS $$
DECLARE
  v_session public.sessions;
  v_participant public.session_participants;
  v_display_name TEXT;
  v_user_id UUID;
  v_current_count INTEGER;
  v_max_participants INTEGER;
BEGIN
  v_user_id := auth.uid();

  -- Find the session by join code
  SELECT * INTO v_session
  FROM public.sessions
  WHERE join_code = UPPER(p_join_code)
    AND status IN ('created', 'active', 'paused');

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found or has ended';
  END IF;

  -- Check max participants
  v_max_participants := COALESCE((v_session.settings->>'maxParticipants')::INTEGER, 5);
  SELECT COUNT(*) INTO v_current_count
  FROM public.session_participants
  WHERE session_id = v_session.id AND left_at IS NULL;

  IF v_current_count >= v_max_participants THEN
    RAISE EXCEPTION 'Session is full';
  END IF;

  -- Determine display name
  IF v_user_id IS NOT NULL THEN
    -- Authenticated user: use provided name or profile name
    SELECT COALESCE(p_display_name, p.display_name, 'User') INTO v_display_name
    FROM public.profiles p
    WHERE p.id = v_user_id;

    -- Check if already a participant
    SELECT * INTO v_participant
    FROM public.session_participants
    WHERE session_id = v_session.id
      AND user_id = v_user_id
      AND left_at IS NULL;

    IF v_participant IS NOT NULL THEN
      -- Already joined, return existing participation
      RETURN v_participant;
    END IF;
  ELSE
    -- Guest: require display name
    IF p_display_name IS NULL OR p_display_name = '' THEN
      RAISE EXCEPTION 'Display name required for guests';
    END IF;
    v_display_name := p_display_name;
  END IF;

  -- Create participant record
  INSERT INTO public.session_participants (session_id, user_id, display_name, role, control_state)
  VALUES (v_session.id, v_user_id, v_display_name, 'viewer', 'view-only')
  RETURNING * INTO v_participant;

  RETURN v_participant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function: end_session
-- Ends a session (host only)
CREATE OR REPLACE FUNCTION public.end_session(
  p_session_id UUID
)
RETURNS public.sessions AS $$
DECLARE
  v_session public.sessions;
BEGIN
  -- Ensure user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Find and update the session (only if host)
  UPDATE public.sessions
  SET status = 'ended', ended_at = NOW()
  WHERE id = p_session_id
    AND host_user_id = auth.uid()
    AND status != 'ended'
  RETURNING * INTO v_session;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found or you are not the host';
  END IF;

  -- Mark all participants as left
  UPDATE public.session_participants
  SET left_at = NOW()
  WHERE session_id = p_session_id AND left_at IS NULL;

  RETURN v_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function: update_control_state
-- Updates control state for a participant (host only)
CREATE OR REPLACE FUNCTION public.update_control_state(
  p_session_id UUID,
  p_participant_id UUID,
  p_control_state public.control_state
)
RETURNS public.session_participants AS $$
DECLARE
  v_session public.sessions;
  v_participant public.session_participants;
BEGIN
  -- Ensure user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify user is host of this session
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id AND host_user_id = auth.uid();

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found or you are not the host';
  END IF;

  -- Update participant control state
  UPDATE public.session_participants
  SET control_state = p_control_state
  WHERE id = p_participant_id
    AND session_id = p_session_id
    AND left_at IS NULL
  RETURNING * INTO v_participant;

  IF v_participant IS NULL THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  RETURN v_participant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function: request_control
-- Allows a viewer to request control
CREATE OR REPLACE FUNCTION public.request_control(
  p_session_id UUID
)
RETURNS public.session_participants AS $$
DECLARE
  v_participant public.session_participants;
BEGIN
  -- Find and update own participant record
  UPDATE public.session_participants
  SET control_state = 'requested'
  WHERE session_id = p_session_id
    AND (user_id = auth.uid() OR (auth.uid() IS NULL AND id = p_session_id))
    AND role = 'viewer'
    AND control_state = 'view-only'
    AND left_at IS NULL
  RETURNING * INTO v_participant;

  IF v_participant IS NULL THEN
    RAISE EXCEPTION 'Cannot request control';
  END IF;

  RETURN v_participant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function: leave_session
-- Allows a participant to leave a session
CREATE OR REPLACE FUNCTION public.leave_session(
  p_session_id UUID
)
RETURNS public.session_participants AS $$
DECLARE
  v_participant public.session_participants;
BEGIN
  -- Mark participant as left
  UPDATE public.session_participants
  SET left_at = NOW()
  WHERE session_id = p_session_id
    AND user_id = auth.uid()
    AND left_at IS NULL
  RETURNING * INTO v_participant;

  IF v_participant IS NULL THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  RETURN v_participant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- RLS Policies for profiles table

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Profiles are created via trigger, no direct insert needed
-- But allow authenticated users to insert their own profile as fallback
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- RLS Policies for sessions table

-- Host can view their own sessions
CREATE POLICY "Host can view own sessions"
  ON public.sessions FOR SELECT
  USING (auth.uid() = host_user_id);

-- Participants can view sessions they're part of
CREATE POLICY "Participants can view their sessions"
  ON public.sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.session_participants sp
      WHERE sp.session_id = sessions.id
        AND sp.user_id = auth.uid()
        AND sp.left_at IS NULL
    )
  );

-- Anyone can view session by join code (for joining)
CREATE POLICY "Anyone can lookup session by join code"
  ON public.sessions FOR SELECT
  USING (status IN ('created', 'active', 'paused'));

-- Host can create sessions (via RPC)
CREATE POLICY "Authenticated users can create sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (auth.uid() = host_user_id);

-- Host can update own sessions
CREATE POLICY "Host can update own sessions"
  ON public.sessions FOR UPDATE
  USING (auth.uid() = host_user_id)
  WITH CHECK (auth.uid() = host_user_id);

-- Host can delete own sessions
CREATE POLICY "Host can delete own sessions"
  ON public.sessions FOR DELETE
  USING (auth.uid() = host_user_id);

-- RLS Policies for session_participants table

-- Participants can view participants in their session
CREATE POLICY "Session participants can view each other"
  ON public.session_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.session_participants sp
      WHERE sp.session_id = session_participants.session_id
        AND sp.user_id = auth.uid()
        AND sp.left_at IS NULL
    )
  );

-- Host can view all participants in their sessions
CREATE POLICY "Host can view session participants"
  ON public.session_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_participants.session_id
        AND s.host_user_id = auth.uid()
    )
  );

-- Insert is handled via RPC (create_session, join_session)
-- Allow insert for authenticated users joining their own sessions
CREATE POLICY "Users can join sessions"
  ON public.session_participants FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Users can update their own participant record (e.g., request control)
CREATE POLICY "Users can update own participation"
  ON public.session_participants FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Host can update any participant in their session (for control state)
CREATE POLICY "Host can update participants"
  ON public.session_participants FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_participants.session_id
        AND s.host_user_id = auth.uid()
    )
  );

-- Host can remove participants from their session
CREATE POLICY "Host can delete participants"
  ON public.session_participants FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_participants.session_id
        AND s.host_user_id = auth.uid()
    )
  );

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.sessions TO authenticated;
GRANT ALL ON public.session_participants TO authenticated;
GRANT SELECT ON public.sessions TO anon; -- For join code lookup
GRANT INSERT ON public.session_participants TO anon; -- For guest joining

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION public.create_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_session TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_control_state TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_control TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_session TO authenticated;
-- Create message type enum
CREATE TYPE public.message_type AS ENUM ('text', 'system');

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL for guests
  display_name TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type public.message_type NOT NULL DEFAULT 'text',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS chat_messages_session_id_idx ON public.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON public.chat_messages(session_id, created_at);

-- RLS Policies

-- Anyone in the session can view messages
CREATE POLICY "Session participants can view messages"
  ON public.chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.session_participants sp
      WHERE sp.session_id = chat_messages.session_id
      AND (sp.user_id = auth.uid() OR sp.user_id IS NULL)
      AND sp.left_at IS NULL
    )
    OR
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = chat_messages.session_id
      AND s.host_user_id = auth.uid()
    )
  );

-- Authenticated users can send messages to sessions they're in
CREATE POLICY "Session participants can send messages"
  ON public.chat_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.session_participants sp
      WHERE sp.session_id = chat_messages.session_id
      AND sp.user_id = auth.uid()
      AND sp.left_at IS NULL
    )
    OR
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = chat_messages.session_id
      AND s.host_user_id = auth.uid()
    )
  );

-- RPC function to send a chat message (handles guest participants)
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_session_id UUID,
  p_content TEXT,
  p_participant_id UUID DEFAULT NULL
)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_display_name TEXT;
  v_message public.chat_messages;
BEGIN
  -- Get current user (may be NULL for service role calls)
  v_user_id := auth.uid();

  -- Validate content
  IF length(p_content) = 0 THEN
    RAISE EXCEPTION 'Message content cannot be empty';
  END IF;

  IF length(p_content) > 500 THEN
    RAISE EXCEPTION 'Message content exceeds maximum length of 500 characters';
  END IF;

  -- Check if user is authenticated participant
  IF v_user_id IS NOT NULL THEN
    -- Authenticated user - check participation
    SELECT sp.display_name INTO v_display_name
    FROM public.session_participants sp
    WHERE sp.session_id = p_session_id
    AND sp.user_id = v_user_id
    AND sp.left_at IS NULL;

    -- Also check if user is the host
    IF v_display_name IS NULL THEN
      SELECT p.display_name INTO v_display_name
      FROM public.profiles p
      JOIN public.sessions s ON s.host_user_id = p.id
      WHERE s.id = p_session_id AND s.host_user_id = v_user_id;
    END IF;

    IF v_display_name IS NULL THEN
      RAISE EXCEPTION 'User is not a participant in this session';
    END IF;
  ELSE
    -- Guest/anonymous - must provide participant_id
    IF p_participant_id IS NULL THEN
      RAISE EXCEPTION 'Participant ID required for guest users';
    END IF;

    SELECT sp.display_name INTO v_display_name
    FROM public.session_participants sp
    WHERE sp.id = p_participant_id
    AND sp.session_id = p_session_id
    AND sp.user_id IS NULL
    AND sp.left_at IS NULL;

    IF v_display_name IS NULL THEN
      RAISE EXCEPTION 'Invalid participant ID or not a guest participant';
    END IF;
  END IF;

  -- Insert the message
  INSERT INTO public.chat_messages (session_id, user_id, display_name, content, message_type)
  VALUES (p_session_id, v_user_id, v_display_name, p_content, 'text')
  RETURNING * INTO v_message;

  RETURN v_message;
END;
$$;

-- RPC function to send a system message (join/leave/control)
CREATE OR REPLACE FUNCTION public.send_system_message(
  p_session_id UUID,
  p_content TEXT,
  p_display_name TEXT DEFAULT 'System'
)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message public.chat_messages;
BEGIN
  -- Insert the system message
  INSERT INTO public.chat_messages (session_id, user_id, display_name, content, message_type)
  VALUES (p_session_id, NULL, p_display_name, p_content, 'system')
  RETURNING * INTO v_message;

  RETURN v_message;
END;
$$;

-- Enable realtime for chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
-- Fix infinite recursion in session_participants RLS policy
-- The policy "Session participants can view each other" references session_participants
-- in its own USING clause, causing infinite recursion.

-- Create a SECURITY DEFINER function to check participation without triggering RLS
CREATE OR REPLACE FUNCTION public.is_session_participant(p_session_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.session_participants
    WHERE session_id = p_session_id
      AND user_id = p_user_id
      AND left_at IS NULL
  );
$$;

-- Create helper to check if user is session host
CREATE OR REPLACE FUNCTION public.is_session_host(p_session_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE id = p_session_id
      AND host_user_id = p_user_id
  );
$$;

-- Drop the problematic policy
DROP POLICY IF EXISTS "Session participants can view each other" ON public.session_participants;

-- Recreate using the helper function
CREATE POLICY "Session participants can view each other"
  ON public.session_participants FOR SELECT
  USING (
    public.is_session_participant(session_id, auth.uid())
    OR public.is_session_host(session_id, auth.uid())
  );

-- Also fix the chat_messages policies to use the helper functions
DROP POLICY IF EXISTS "Session participants can view messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Session participants can send messages" ON public.chat_messages;

-- Recreate chat_messages policies using helper functions
CREATE POLICY "Session participants can view messages"
  ON public.chat_messages
  FOR SELECT
  USING (
    public.is_session_participant(session_id, auth.uid())
    OR public.is_session_host(session_id, auth.uid())
  );

CREATE POLICY "Session participants can send messages"
  ON public.chat_messages
  FOR INSERT
  WITH CHECK (
    public.is_session_participant(session_id, auth.uid())
    OR public.is_session_host(session_id, auth.uid())
  );

-- Grant execute on the helper functions
GRANT EXECUTE ON FUNCTION public.is_session_participant TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_session_host TO anon, authenticated;
-- Add recipient_id column for direct messages
ALTER TABLE public.chat_messages
ADD COLUMN recipient_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for efficient DM queries
CREATE INDEX IF NOT EXISTS chat_messages_recipient_idx
ON public.chat_messages(recipient_id)
WHERE recipient_id IS NOT NULL;

-- Drop existing view policies
DROP POLICY IF EXISTS "Session participants can view messages" ON public.chat_messages;

-- Create new policy that handles both public and private messages
CREATE POLICY "Session participants can view messages"
ON public.chat_messages
FOR SELECT
USING (
  -- Public messages (no recipient)
  (recipient_id IS NULL AND (
    EXISTS (
      SELECT 1 FROM public.session_participants sp
      WHERE sp.session_id = chat_messages.session_id
      AND (sp.user_id = auth.uid() OR sp.user_id IS NULL)
      AND sp.left_at IS NULL
    )
    OR
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = chat_messages.session_id
      AND s.host_user_id = auth.uid()
    )
  ))
  OR
  -- Private messages: user is sender or recipient
  (recipient_id IS NOT NULL AND (
    user_id = auth.uid() OR recipient_id = auth.uid()
  ))
);

-- Update send_chat_message function to support DMs
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_session_id UUID,
  p_content TEXT,
  p_participant_id UUID DEFAULT NULL,
  p_recipient_id UUID DEFAULT NULL
)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_display_name TEXT;
  v_message public.chat_messages;
BEGIN
  -- Get current user (may be NULL for service role calls)
  v_user_id := auth.uid();

  -- Validate content
  IF length(p_content) = 0 THEN
    RAISE EXCEPTION 'Message content cannot be empty';
  END IF;

  IF length(p_content) > 500 THEN
    RAISE EXCEPTION 'Message content exceeds maximum length of 500 characters';
  END IF;

  -- Check if user is authenticated participant
  IF v_user_id IS NOT NULL THEN
    -- Authenticated user - check participation
    SELECT sp.display_name INTO v_display_name
    FROM public.session_participants sp
    WHERE sp.session_id = p_session_id
    AND sp.user_id = v_user_id
    AND sp.left_at IS NULL;

    -- Also check if user is the host
    IF v_display_name IS NULL THEN
      SELECT p.display_name INTO v_display_name
      FROM public.profiles p
      JOIN public.sessions s ON s.host_user_id = p.id
      WHERE s.id = p_session_id AND s.host_user_id = v_user_id;
    END IF;

    IF v_display_name IS NULL THEN
      RAISE EXCEPTION 'User is not a participant in this session';
    END IF;

    -- If DM, verify recipient is also in the session
    IF p_recipient_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.session_participants sp
        WHERE sp.session_id = p_session_id
        AND sp.user_id = p_recipient_id
        AND sp.left_at IS NULL
      ) AND NOT EXISTS (
        SELECT 1 FROM public.sessions s
        WHERE s.id = p_session_id
        AND s.host_user_id = p_recipient_id
      ) THEN
        RAISE EXCEPTION 'Recipient is not a participant in this session';
      END IF;
    END IF;
  ELSE
    -- Guest/anonymous - must provide participant_id
    IF p_participant_id IS NULL THEN
      RAISE EXCEPTION 'Participant ID required for guest users';
    END IF;

    SELECT sp.display_name INTO v_display_name
    FROM public.session_participants sp
    WHERE sp.id = p_participant_id
    AND sp.session_id = p_session_id
    AND sp.user_id IS NULL
    AND sp.left_at IS NULL;

    IF v_display_name IS NULL THEN
      RAISE EXCEPTION 'Invalid participant ID or not a guest participant';
    END IF;
  END IF;

  -- Insert the message
  INSERT INTO public.chat_messages (session_id, user_id, display_name, content, message_type, recipient_id)
  VALUES (p_session_id, v_user_id, v_display_name, p_content, 'text', p_recipient_id)
  RETURNING * INTO v_message;

  RETURN v_message;
END;
$$;

-- Add comment explaining DM support
COMMENT ON COLUMN public.chat_messages.recipient_id IS 'When set, indicates this is a direct message visible only to sender and recipient';
-- Room-Centric Architecture Migration
-- Principle: A room is a durable object. A host is just a role.
-- This enables session resilience for SFU mode (Pro/Team plans)

-- =============================================================================
-- STEP 1: Modify sessions table for room-centric model
-- =============================================================================

-- Add current_host_id (nullable - room can exist without active host)
ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS current_host_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add host presence tracking
ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS host_last_seen_at TIMESTAMPTZ;

-- Add room expiration (TTL)
ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Add mode column for P2P vs SFU
CREATE TYPE public.session_mode AS ENUM ('p2p', 'sfu');
ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS mode public.session_mode NOT NULL DEFAULT 'p2p';

-- Backfill: set current_host_id to host_user_id for existing sessions
UPDATE public.sessions
SET current_host_id = host_user_id
WHERE current_host_id IS NULL AND status != 'ended';

-- Rename host_user_id to creator_id for clarity (keep for billing/ownership)
-- Note: We do this via a new column to avoid breaking existing code
ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.sessions
SET creator_id = host_user_id
WHERE creator_id IS NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN public.sessions.host_user_id IS 'DEPRECATED: Use creator_id for owner, current_host_id for active host';
COMMENT ON COLUMN public.sessions.creator_id IS 'User who created the room (for billing/ownership)';
COMMENT ON COLUMN public.sessions.current_host_id IS 'Currently active host (nullable - room survives without host)';
COMMENT ON COLUMN public.sessions.host_last_seen_at IS 'Last heartbeat from current host';
COMMENT ON COLUMN public.sessions.expires_at IS 'When room expires if inactive (TTL)';
COMMENT ON COLUMN public.sessions.mode IS 'Connection mode: p2p (free) or sfu (pro/team)';

-- Create index for presence queries
CREATE INDEX IF NOT EXISTS sessions_host_last_seen_idx ON public.sessions(host_last_seen_at);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON public.sessions(expires_at);

-- =============================================================================
-- STEP 2: Create media_sessions table (ephemeral screen shares)
-- =============================================================================

CREATE TYPE public.media_session_status AS ENUM ('active', 'paused', 'ended');

CREATE TABLE IF NOT EXISTS public.media_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  publisher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode public.session_mode NOT NULL DEFAULT 'p2p',
  status public.media_session_status NOT NULL DEFAULT 'active',

  -- SFU-specific fields
  sfu_endpoint TEXT,
  sfu_room_id TEXT,

  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paused_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  -- Metadata
  capture_source JSONB -- { type: 'screen'|'window', name: string, id: string }
);

-- Enable RLS
ALTER TABLE public.media_sessions ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS media_sessions_room_id_idx ON public.media_sessions(room_id);
CREATE INDEX IF NOT EXISTS media_sessions_publisher_id_idx ON public.media_sessions(publisher_id);
CREATE INDEX IF NOT EXISTS media_sessions_status_idx ON public.media_sessions(status);

COMMENT ON TABLE public.media_sessions IS 'Ephemeral screen share sessions within a room. Room survives when media_session ends.';

-- =============================================================================
-- STEP 3: Add presence tracking to participants
-- =============================================================================

ALTER TABLE public.session_participants
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.session_participants
ADD COLUMN IF NOT EXISTS connection_status TEXT DEFAULT 'connected'
  CHECK (connection_status IN ('connected', 'reconnecting', 'disconnected'));

-- Create index for presence queries
CREATE INDEX IF NOT EXISTS session_participants_last_seen_idx ON public.session_participants(last_seen_at);

-- =============================================================================
-- STEP 4: Add backup host designation
-- =============================================================================

ALTER TABLE public.session_participants
ADD COLUMN IF NOT EXISTS is_backup_host BOOLEAN DEFAULT FALSE;

-- =============================================================================
-- STEP 5: RLS Policies for media_sessions
-- =============================================================================

-- Publishers can manage their own media sessions
CREATE POLICY "Publishers can manage own media sessions"
  ON public.media_sessions
  FOR ALL
  TO authenticated
  USING (publisher_id = auth.uid())
  WITH CHECK (publisher_id = auth.uid());

-- Room participants can view media sessions
CREATE POLICY "Room participants can view media sessions"
  ON public.media_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.session_participants sp
      WHERE sp.session_id = room_id
        AND sp.user_id = auth.uid()
        AND sp.left_at IS NULL
    )
  );

-- Room creators can manage all media sessions in their rooms
CREATE POLICY "Room creators can manage room media sessions"
  ON public.media_sessions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = room_id
        AND s.creator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = room_id
        AND s.creator_id = auth.uid()
    )
  );

-- =============================================================================
-- STEP 6: New RPC Functions
-- =============================================================================

-- Update host presence (heartbeat)
CREATE OR REPLACE FUNCTION public.update_host_presence(
  p_session_id UUID
)
RETURNS public.sessions AS $$
DECLARE
  v_session public.sessions;
BEGIN
  -- Ensure user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Update host_last_seen_at if user is current host
  UPDATE public.sessions
  SET host_last_seen_at = NOW()
  WHERE id = p_session_id
    AND current_host_id = auth.uid()
    AND status != 'ended'
  RETURNING * INTO v_session;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found or you are not the current host';
  END IF;

  RETURN v_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update participant presence (heartbeat)
CREATE OR REPLACE FUNCTION public.update_participant_presence(
  p_session_id UUID
)
RETURNS public.session_participants AS $$
DECLARE
  v_participant public.session_participants;
BEGIN
  UPDATE public.session_participants
  SET
    last_seen_at = NOW(),
    connection_status = 'connected'
  WHERE session_id = p_session_id
    AND user_id = auth.uid()
    AND left_at IS NULL
  RETURNING * INTO v_participant;

  IF v_participant IS NULL THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  RETURN v_participant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Start a media session (begin screen sharing)
CREATE OR REPLACE FUNCTION public.start_media_session(
  p_room_id UUID,
  p_mode public.session_mode DEFAULT 'p2p',
  p_capture_source JSONB DEFAULT NULL
)
RETURNS public.media_sessions AS $$
DECLARE
  v_session public.sessions;
  v_media_session public.media_sessions;
BEGIN
  -- Ensure user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify room exists and is not ended
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_room_id AND status != 'ended';

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Room not found or has ended';
  END IF;

  -- End any existing active media sessions from this publisher in this room
  UPDATE public.media_sessions
  SET status = 'ended', ended_at = NOW()
  WHERE room_id = p_room_id
    AND publisher_id = auth.uid()
    AND status = 'active';

  -- Create new media session
  INSERT INTO public.media_sessions (room_id, publisher_id, mode, capture_source)
  VALUES (p_room_id, auth.uid(), p_mode, p_capture_source)
  RETURNING * INTO v_media_session;

  -- Update room: set current host and activate room
  UPDATE public.sessions
  SET
    current_host_id = auth.uid(),
    host_last_seen_at = NOW(),
    status = 'active',
    mode = p_mode
  WHERE id = p_room_id;

  RETURN v_media_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Pause media session (host disconnecting gracefully)
CREATE OR REPLACE FUNCTION public.pause_media_session(
  p_media_session_id UUID
)
RETURNS public.media_sessions AS $$
DECLARE
  v_media_session public.media_sessions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.media_sessions
  SET status = 'paused', paused_at = NOW()
  WHERE id = p_media_session_id
    AND publisher_id = auth.uid()
    AND status = 'active'
  RETURNING * INTO v_media_session;

  IF v_media_session IS NULL THEN
    RAISE EXCEPTION 'Media session not found or not yours';
  END IF;

  -- Update room status
  UPDATE public.sessions
  SET status = 'paused'
  WHERE id = v_media_session.room_id
    AND current_host_id = auth.uid();

  RETURN v_media_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- End media session
CREATE OR REPLACE FUNCTION public.end_media_session(
  p_media_session_id UUID
)
RETURNS public.media_sessions AS $$
DECLARE
  v_media_session public.media_sessions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.media_sessions
  SET status = 'ended', ended_at = NOW()
  WHERE id = p_media_session_id
    AND publisher_id = auth.uid()
    AND status IN ('active', 'paused')
  RETURNING * INTO v_media_session;

  IF v_media_session IS NULL THEN
    RAISE EXCEPTION 'Media session not found or not yours';
  END IF;

  -- Note: Room stays alive! Just clear the current host if this was their stream
  UPDATE public.sessions
  SET
    current_host_id = NULL,
    status = 'paused'
  WHERE id = v_media_session.room_id
    AND current_host_id = auth.uid();

  RETURN v_media_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Transfer host role to another participant
CREATE OR REPLACE FUNCTION public.transfer_host(
  p_session_id UUID,
  p_new_host_participant_id UUID
)
RETURNS public.sessions AS $$
DECLARE
  v_session public.sessions;
  v_new_host public.session_participants;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify caller is current host or room creator
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
    AND (current_host_id = auth.uid() OR creator_id = auth.uid())
    AND status != 'ended';

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found or you are not authorized to transfer host';
  END IF;

  -- Get the new host participant (must be active in session)
  SELECT * INTO v_new_host
  FROM public.session_participants
  WHERE id = p_new_host_participant_id
    AND session_id = p_session_id
    AND left_at IS NULL
    AND user_id IS NOT NULL; -- Must be authenticated user, not guest

  IF v_new_host IS NULL THEN
    RAISE EXCEPTION 'New host participant not found or is a guest';
  END IF;

  -- Demote old host to viewer
  UPDATE public.session_participants
  SET role = 'viewer'
  WHERE session_id = p_session_id
    AND role = 'host'
    AND left_at IS NULL;

  -- Promote new host
  UPDATE public.session_participants
  SET role = 'host', control_state = 'granted'
  WHERE id = p_new_host_participant_id;

  -- Update session
  UPDATE public.sessions
  SET current_host_id = v_new_host.user_id
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Designate backup host
CREATE OR REPLACE FUNCTION public.set_backup_host(
  p_session_id UUID,
  p_participant_id UUID,
  p_is_backup BOOLEAN DEFAULT TRUE
)
RETURNS public.session_participants AS $$
DECLARE
  v_session public.sessions;
  v_participant public.session_participants;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify caller is current host or room creator
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
    AND (current_host_id = auth.uid() OR creator_id = auth.uid())
    AND status != 'ended';

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found or you are not authorized';
  END IF;

  -- If setting as backup, clear any existing backup first
  IF p_is_backup THEN
    UPDATE public.session_participants
    SET is_backup_host = FALSE
    WHERE session_id = p_session_id AND is_backup_host = TRUE;
  END IF;

  -- Update the participant
  UPDATE public.session_participants
  SET is_backup_host = p_is_backup
  WHERE id = p_participant_id
    AND session_id = p_session_id
    AND left_at IS NULL
    AND user_id IS NOT NULL -- Must be authenticated
  RETURNING * INTO v_participant;

  IF v_participant IS NULL THEN
    RAISE EXCEPTION 'Participant not found or is a guest';
  END IF;

  RETURN v_participant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-promote backup host (called when host is detected offline)
CREATE OR REPLACE FUNCTION public.auto_promote_backup_host(
  p_session_id UUID
)
RETURNS public.sessions AS $$
DECLARE
  v_session public.sessions;
  v_backup public.session_participants;
BEGIN
  -- This should be called by a service role or edge function
  -- Verify session exists and has no active host
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
    AND status != 'ended'
    AND (
      current_host_id IS NULL
      OR host_last_seen_at < NOW() - INTERVAL '2 minutes'
    );

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found or host is still active';
  END IF;

  -- Find backup host
  SELECT * INTO v_backup
  FROM public.session_participants
  WHERE session_id = p_session_id
    AND is_backup_host = TRUE
    AND left_at IS NULL
    AND user_id IS NOT NULL
    AND connection_status = 'connected';

  IF v_backup IS NULL THEN
    -- No backup host, try to find any connected authenticated participant
    SELECT * INTO v_backup
    FROM public.session_participants
    WHERE session_id = p_session_id
      AND left_at IS NULL
      AND user_id IS NOT NULL
      AND connection_status = 'connected'
      AND role != 'host'
    ORDER BY joined_at ASC
    LIMIT 1;
  END IF;

  IF v_backup IS NOT NULL THEN
    -- Demote old host
    UPDATE public.session_participants
    SET role = 'viewer'
    WHERE session_id = p_session_id
      AND role = 'host'
      AND left_at IS NULL;

    -- Promote backup
    UPDATE public.session_participants
    SET role = 'host', control_state = 'granted', is_backup_host = FALSE
    WHERE id = v_backup.id;

    -- Update session
    UPDATE public.sessions
    SET
      current_host_id = v_backup.user_id,
      host_last_seen_at = NULL -- New host needs to send heartbeat
    WHERE id = p_session_id
    RETURNING * INTO v_session;
  ELSE
    -- No one to promote, just mark session as paused (no host)
    UPDATE public.sessions
    SET
      current_host_id = NULL,
      status = 'paused'
    WHERE id = p_session_id
    RETURNING * INTO v_session;
  END IF;

  RETURN v_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get session with host status
CREATE OR REPLACE FUNCTION public.get_session_status(
  p_session_id UUID
)
RETURNS TABLE (
  session_id UUID,
  status public.session_status,
  mode public.session_mode,
  host_online BOOLEAN,
  host_last_seen TIMESTAMPTZ,
  current_host_name TEXT,
  participant_count BIGINT,
  has_active_media BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS session_id,
    s.status,
    s.mode,
    s.current_host_id IS NOT NULL
      AND s.host_last_seen_at > NOW() - INTERVAL '1 minute' AS host_online,
    s.host_last_seen_at AS host_last_seen,
    p.display_name AS current_host_name,
    (SELECT COUNT(*) FROM public.session_participants sp
     WHERE sp.session_id = s.id AND sp.left_at IS NULL) AS participant_count,
    EXISTS (
      SELECT 1 FROM public.media_sessions ms
      WHERE ms.room_id = s.id AND ms.status = 'active'
    ) AS has_active_media
  FROM public.sessions s
  LEFT JOIN public.session_participants p
    ON p.session_id = s.id
    AND p.user_id = s.current_host_id
    AND p.left_at IS NULL
  WHERE s.id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set room TTL (expiration)
CREATE OR REPLACE FUNCTION public.set_room_expiration(
  p_session_id UUID,
  p_hours INTEGER DEFAULT 24
)
RETURNS public.sessions AS $$
DECLARE
  v_session public.sessions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.sessions
  SET expires_at = NOW() + (p_hours || ' hours')::INTERVAL
  WHERE id = p_session_id
    AND creator_id = auth.uid()
  RETURNING * INTO v_session;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found or you are not the creator';
  END IF;

  RETURN v_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- STEP 7: Cleanup function for expired rooms (run via cron/edge function)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_rooms()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- End sessions that have expired
  WITH expired AS (
    UPDATE public.sessions
    SET status = 'ended', ended_at = NOW()
    WHERE status != 'ended'
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM expired;

  -- Also mark participants as left
  UPDATE public.session_participants sp
  SET left_at = NOW()
  FROM public.sessions s
  WHERE sp.session_id = s.id
    AND s.status = 'ended'
    AND sp.left_at IS NULL;

  -- End orphaned media sessions
  UPDATE public.media_sessions ms
  SET status = 'ended', ended_at = NOW()
  FROM public.sessions s
  WHERE ms.room_id = s.id
    AND s.status = 'ended'
    AND ms.status != 'ended';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- STEP 8: Mark stale participants as disconnected
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mark_stale_participants()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Mark participants as disconnected if no heartbeat for 1 minute
  WITH stale AS (
    UPDATE public.session_participants
    SET connection_status = 'disconnected'
    WHERE left_at IS NULL
      AND connection_status = 'connected'
      AND last_seen_at < NOW() - INTERVAL '1 minute'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM stale;

  -- Mark hosts as offline if no heartbeat for 2 minutes
  UPDATE public.sessions
  SET current_host_id = NULL, status = 'paused'
  WHERE status = 'active'
    AND host_last_seen_at < NOW() - INTERVAL '2 minutes';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Add mode parameter to create_session RPC
-- This allows setting P2P vs SFU mode at session creation time

-- Drop the old function with single parameter signature
DROP FUNCTION IF EXISTS public.create_session(JSONB);

CREATE OR REPLACE FUNCTION public.create_session(
  p_settings JSONB DEFAULT NULL,
  p_mode public.session_mode DEFAULT 'p2p'
)
RETURNS public.sessions AS $$
DECLARE
  v_session public.sessions;
  v_default_settings JSONB := '{"quality": "medium", "allowControl": true, "maxParticipants": 5}'::jsonb;
BEGIN
  -- Ensure user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Create the session with mode
  INSERT INTO public.sessions (host_user_id, creator_id, current_host_id, settings, status, mode)
  VALUES (
    auth.uid(),
    auth.uid(),
    auth.uid(),
    COALESCE(p_settings, v_default_settings),
    'created',
    p_mode
  )
  RETURNING * INTO v_session;

  -- Add host as participant
  INSERT INTO public.session_participants (session_id, user_id, display_name, role, control_state)
  SELECT
    v_session.id,
    auth.uid(),
    COALESCE(p.display_name, 'Host'),
    'host',
    'granted'
  FROM public.profiles p
  WHERE p.id = auth.uid();

  RETURN v_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.create_session(JSONB, public.session_mode) IS 'Creates a new session/room with the authenticated user as host. Supports P2P or SFU mode.';
-- RPC function: kick_participant
-- Allows the host to remove a participant from the session
CREATE OR REPLACE FUNCTION public.kick_participant(
  p_session_id UUID,
  p_participant_id UUID
)
RETURNS public.session_participants AS $$
DECLARE
  v_session public.sessions;
  v_participant public.session_participants;
BEGIN
  -- Ensure user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify user is host of this session
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
    AND (host_user_id = auth.uid() OR current_host_id = auth.uid());

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found or you are not the host';
  END IF;

  -- Verify participant exists and is not the host
  SELECT * INTO v_participant
  FROM public.session_participants
  WHERE id = p_participant_id
    AND session_id = p_session_id
    AND left_at IS NULL;

  IF v_participant IS NULL THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  IF v_participant.role = 'host' THEN
    RAISE EXCEPTION 'Cannot kick the host';
  END IF;

  -- Mark participant as left
  UPDATE public.session_participants
  SET left_at = NOW(), control_state = 'view-only'
  WHERE id = p_participant_id
  RETURNING * INTO v_participant;

  RETURN v_participant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add the function to the Database type definition (this is just documentation)
COMMENT ON FUNCTION public.kick_participant IS 'Kicks a participant from the session (host only)';
-- Fix remaining infinite recursion in RLS policies
-- The recursion happens when:
-- 1. Query sessions → "Participants can view their sessions" → EXISTS on session_participants
-- 2. session_participants RLS → "Host can view session participants" → EXISTS on sessions
-- This creates a circular dependency.

-- The is_session_participant and is_session_host functions already exist from
-- migration 20250123000002, but they haven't been applied to all problematic policies.

-- =============================================================================
-- STEP 1: Fix sessions table policies that query session_participants
-- =============================================================================

-- Drop the problematic policy on sessions table
DROP POLICY IF EXISTS "Participants can view their sessions" ON public.sessions;

-- Recreate using SECURITY DEFINER helper function
CREATE POLICY "Participants can view their sessions"
  ON public.sessions FOR SELECT
  USING (
    public.is_session_participant(id, auth.uid())
  );

-- =============================================================================
-- STEP 2: Fix session_participants policies that query sessions
-- =============================================================================

-- Drop and recreate "Host can view session participants"
DROP POLICY IF EXISTS "Host can view session participants" ON public.session_participants;

CREATE POLICY "Host can view session participants"
  ON public.session_participants FOR SELECT
  USING (
    public.is_session_host(session_id, auth.uid())
  );

-- Drop and recreate "Host can update participants"
DROP POLICY IF EXISTS "Host can update participants" ON public.session_participants;

CREATE POLICY "Host can update participants"
  ON public.session_participants FOR UPDATE
  USING (
    public.is_session_host(session_id, auth.uid())
  );

-- Drop and recreate "Host can delete participants"
DROP POLICY IF EXISTS "Host can delete participants" ON public.session_participants;

CREATE POLICY "Host can delete participants"
  ON public.session_participants FOR DELETE
  USING (
    public.is_session_host(session_id, auth.uid())
  );

-- =============================================================================
-- STEP 3: Fix media_sessions policies that query session_participants or sessions
-- =============================================================================

-- Drop and recreate "Room participants can view media sessions"
DROP POLICY IF EXISTS "Room participants can view media sessions" ON public.media_sessions;

CREATE POLICY "Room participants can view media sessions"
  ON public.media_sessions
  FOR SELECT
  TO authenticated
  USING (
    public.is_session_participant(room_id, auth.uid())
    OR public.is_session_host(room_id, auth.uid())
  );

-- =============================================================================
-- STEP 4: Add a helper function to check creator status
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_session_creator(p_session_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE id = p_session_id
      AND creator_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_session_creator TO anon, authenticated;

-- Update "Room creators can manage room media sessions" to use helper
DROP POLICY IF EXISTS "Room creators can manage room media sessions" ON public.media_sessions;

CREATE POLICY "Room creators can manage room media sessions"
  ON public.media_sessions
  FOR ALL
  TO authenticated
  USING (
    public.is_session_creator(room_id, auth.uid())
  )
  WITH CHECK (
    public.is_session_creator(room_id, auth.uid())
  );
-- Add settings column to profiles table
-- Stores user preferences as JSONB

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.settings IS 'User preferences and settings stored as JSON';
-- Fix join_session race condition by using ON CONFLICT
-- This ensures idempotent behavior when the same user joins from multiple devices

CREATE OR REPLACE FUNCTION public.join_session(
  p_join_code TEXT,
  p_display_name TEXT DEFAULT NULL
)
RETURNS public.session_participants AS $$
DECLARE
  v_session public.sessions;
  v_participant public.session_participants;
  v_display_name TEXT;
  v_user_id UUID;
  v_current_count INTEGER;
  v_max_participants INTEGER;
BEGIN
  v_user_id := auth.uid();

  -- Find the session by join code
  SELECT * INTO v_session
  FROM public.sessions
  WHERE join_code = UPPER(p_join_code)
    AND status IN ('created', 'active', 'paused');

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found or has ended';
  END IF;

  -- Determine display name first (needed for both paths)
  IF v_user_id IS NOT NULL THEN
    -- Authenticated user: use provided name or profile name
    SELECT COALESCE(p_display_name, p.display_name, 'User') INTO v_display_name
    FROM public.profiles p
    WHERE p.id = v_user_id;

    -- For authenticated users, use INSERT ... ON CONFLICT to handle race conditions
    -- First check if already a participant (as host or viewer)
    SELECT * INTO v_participant
    FROM public.session_participants
    WHERE session_id = v_session.id
      AND user_id = v_user_id
      AND left_at IS NULL;

    IF v_participant IS NOT NULL THEN
      -- Already joined (possibly as host), return existing participation
      RETURN v_participant;
    END IF;

    -- Check max participants before inserting
    v_max_participants := COALESCE((v_session.settings->>'maxParticipants')::INTEGER, 5);
    SELECT COUNT(*) INTO v_current_count
    FROM public.session_participants
    WHERE session_id = v_session.id AND left_at IS NULL;

    IF v_current_count >= v_max_participants THEN
      RAISE EXCEPTION 'Session is full';
    END IF;

    -- Insert with ON CONFLICT to handle race condition
    INSERT INTO public.session_participants (session_id, user_id, display_name, role, control_state)
    VALUES (v_session.id, v_user_id, v_display_name, 'viewer', 'view-only')
    ON CONFLICT (session_id, user_id) WHERE left_at IS NULL AND user_id IS NOT NULL
    DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING * INTO v_participant;

  ELSE
    -- Guest: require display name
    IF p_display_name IS NULL OR p_display_name = '' THEN
      RAISE EXCEPTION 'Display name required for guests';
    END IF;
    v_display_name := p_display_name;

    -- Check max participants for guests too
    v_max_participants := COALESCE((v_session.settings->>'maxParticipants')::INTEGER, 5);
    SELECT COUNT(*) INTO v_current_count
    FROM public.session_participants
    WHERE session_id = v_session.id AND left_at IS NULL;

    IF v_current_count >= v_max_participants THEN
      RAISE EXCEPTION 'Session is full';
    END IF;

    -- Create participant record for guest (no conflict possible with NULL user_id)
    INSERT INTO public.session_participants (session_id, user_id, display_name, role, control_state)
    VALUES (v_session.id, NULL, v_display_name, 'viewer', 'view-only')
    RETURNING * INTO v_participant;
  END IF;

  RETURN v_participant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Allow guest participants to view other participants in their session
-- Guests have user_id = NULL but have a valid participant ID

-- Create a helper function to check if someone is a participant by participant_id
-- This is used for guests who don't have a user_id
CREATE OR REPLACE FUNCTION public.is_guest_participant(p_session_id UUID, p_participant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.session_participants
    WHERE id = p_participant_id
      AND session_id = p_session_id
      AND user_id IS NULL
      AND left_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_guest_participant TO anon, authenticated;

-- Add policy for anonymous users to view participants
-- This allows the API to fetch participants for guest viewers
-- Note: The actual guest validation happens in the API layer using participant ID
CREATE POLICY "Anonymous can view session participants"
  ON public.session_participants FOR SELECT
  TO anon
  USING (
    -- Anonymous users can view participants of active sessions
    -- The API layer handles proper guest authentication via participant ID
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_participants.session_id
        AND s.status IN ('created', 'active', 'paused')
    )
  );

-- Also allow anonymous to view sessions (for the join flow)
CREATE POLICY "Anonymous can view active sessions"
  ON public.sessions FOR SELECT
  TO anon
  USING (
    status IN ('created', 'active', 'paused')
  );
-- Create session_usage table for tracking bandwidth and connection metrics
-- Used for usage-based billing and analytics

CREATE TABLE IF NOT EXISTS public.session_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Role at time of report
  role TEXT NOT NULL CHECK (role IN ('host', 'viewer')),

  -- Bandwidth metrics (cumulative since last report)
  bytes_sent BIGINT NOT NULL DEFAULT 0,
  bytes_received BIGINT NOT NULL DEFAULT 0,

  -- Packet metrics
  packets_sent BIGINT NOT NULL DEFAULT 0,
  packets_received BIGINT NOT NULL DEFAULT 0,
  packets_lost BIGINT NOT NULL DEFAULT 0,

  -- Quality metrics (point-in-time)
  round_trip_time REAL, -- milliseconds
  jitter REAL, -- milliseconds
  frame_rate REAL,
  frame_width INTEGER,
  frame_height INTEGER,

  -- Connection state at time of report
  connection_state TEXT NOT NULL CHECK (connection_state IN ('connecting', 'connected', 'disconnected', 'failed', 'closed')),

  -- Time between reports (for calculating rates)
  report_interval_ms INTEGER NOT NULL DEFAULT 30000,

  -- Timestamps
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_session_usage_session_id ON public.session_usage(session_id);
CREATE INDEX idx_session_usage_user_id ON public.session_usage(user_id);
CREATE INDEX idx_session_usage_participant_id ON public.session_usage(participant_id);
CREATE INDEX idx_session_usage_reported_at ON public.session_usage(reported_at);
CREATE INDEX idx_session_usage_session_reported ON public.session_usage(session_id, reported_at);

-- Index for billing queries (by user and time period)
CREATE INDEX idx_session_usage_user_time ON public.session_usage(user_id, reported_at) WHERE user_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.session_usage ENABLE ROW LEVEL SECURITY;

-- Policies

-- Hosts can view usage for their sessions
CREATE POLICY "Hosts can view session usage"
  ON public.session_usage FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_usage.session_id
      AND s.host_user_id = auth.uid()
    )
  );

-- Users can view their own usage across all sessions
CREATE POLICY "Users can view own usage"
  ON public.session_usage FOR SELECT
  USING (user_id = auth.uid());

-- Anyone can insert usage (validated at API level)
-- This allows guests without auth to report stats
CREATE POLICY "Anyone can insert usage"
  ON public.session_usage FOR INSERT
  WITH CHECK (true);

-- Create a view for aggregated user usage (for billing)
CREATE OR REPLACE VIEW public.user_usage_summary AS
SELECT
  user_id,
  DATE_TRUNC('month', reported_at) AS month,
  COUNT(DISTINCT session_id) AS session_count,
  SUM(bytes_sent) AS total_bytes_sent,
  SUM(bytes_received) AS total_bytes_received,
  SUM(bytes_sent + bytes_received) AS total_bytes_transferred,
  COUNT(*) AS report_count,
  AVG(round_trip_time) AS avg_round_trip_time
FROM public.session_usage
WHERE user_id IS NOT NULL
GROUP BY user_id, DATE_TRUNC('month', reported_at);

-- Create a view for session usage summary
CREATE OR REPLACE VIEW public.session_usage_summary AS
SELECT
  session_id,
  COUNT(DISTINCT participant_id) AS participant_count,
  SUM(bytes_sent) AS total_bytes_sent,
  SUM(bytes_received) AS total_bytes_received,
  SUM(bytes_sent + bytes_received) AS total_bytes_transferred,
  MIN(reported_at) AS first_report,
  MAX(reported_at) AS last_report,
  EXTRACT(EPOCH FROM (MAX(reported_at) - MIN(reported_at))) AS duration_seconds,
  COUNT(*) AS report_count
FROM public.session_usage
GROUP BY session_id;

-- Function to get user's monthly usage (for billing API)
CREATE OR REPLACE FUNCTION public.get_user_monthly_usage(
  p_user_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER,
  p_month INTEGER DEFAULT EXTRACT(MONTH FROM NOW())::INTEGER
)
RETURNS TABLE (
  user_id UUID,
  month_start DATE,
  month_end DATE,
  session_count BIGINT,
  total_bytes_sent BIGINT,
  total_bytes_received BIGINT,
  total_bytes_transferred BIGINT,
  total_gb_transferred NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    su.user_id,
    DATE_TRUNC('month', MAKE_DATE(p_year, p_month, 1))::DATE AS month_start,
    (DATE_TRUNC('month', MAKE_DATE(p_year, p_month, 1)) + INTERVAL '1 month' - INTERVAL '1 day')::DATE AS month_end,
    COUNT(DISTINCT su.session_id) AS session_count,
    COALESCE(SUM(su.bytes_sent), 0)::BIGINT AS total_bytes_sent,
    COALESCE(SUM(su.bytes_received), 0)::BIGINT AS total_bytes_received,
    COALESCE(SUM(su.bytes_sent + su.bytes_received), 0)::BIGINT AS total_bytes_transferred,
    ROUND(COALESCE(SUM(su.bytes_sent + su.bytes_received), 0) / 1073741824.0, 3) AS total_gb_transferred
  FROM public.session_usage su
  WHERE su.user_id = p_user_id
    AND su.reported_at >= MAKE_DATE(p_year, p_month, 1)
    AND su.reported_at < MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month'
  GROUP BY su.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_monthly_usage TO authenticated;

COMMENT ON TABLE public.session_usage IS 'Tracks bandwidth and connection metrics for usage-based billing';
COMMENT ON VIEW public.user_usage_summary IS 'Monthly aggregated usage per user for billing';
COMMENT ON VIEW public.session_usage_summary IS 'Aggregated usage per session for analytics';
-- Push Subscriptions Table
-- Stores Web Push subscription info per device/browser per user
-- Supports both authenticated users and guests (via participant_id)

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES public.session_participants(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(endpoint)
);

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_participant_id_idx ON public.push_subscriptions(participant_id);

-- RLS Policies

-- Authenticated users can view their own subscriptions
CREATE POLICY "Users can view own push subscriptions"
  ON public.push_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Authenticated users can insert their own subscriptions
CREATE POLICY "Users can create push subscriptions"
  ON public.push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Authenticated users can delete their own subscriptions
CREATE POLICY "Users can delete own push subscriptions"
  ON public.push_subscriptions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Guests can insert subscriptions (user_id must be NULL, participant_id required)
CREATE POLICY "Guests can create push subscriptions"
  ON public.push_subscriptions FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL AND participant_id IS NOT NULL);

-- Guests can delete their own subscriptions by endpoint (via RPC only)
CREATE POLICY "Guests can delete own push subscriptions"
  ON public.push_subscriptions FOR DELETE
  TO anon
  USING (user_id IS NULL AND participant_id IS NOT NULL);

-- Updated_at trigger
CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Grant permissions
GRANT ALL ON public.push_subscriptions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO anon;

-- RPC: Upsert push subscription (handles re-subscribe on same endpoint)
CREATE OR REPLACE FUNCTION public.upsert_push_subscription(
  p_endpoint TEXT,
  p_p256dh TEXT,
  p_auth TEXT,
  p_user_agent TEXT DEFAULT NULL,
  p_participant_id UUID DEFAULT NULL
)
RETURNS public.push_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_subscription public.push_subscriptions;
BEGIN
  v_user_id := auth.uid();

  -- Either user_id or participant_id must be provided
  IF v_user_id IS NULL AND p_participant_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required or participant ID must be provided';
  END IF;

  -- Upsert: insert or update on conflict (same endpoint)
  INSERT INTO public.push_subscriptions (user_id, participant_id, endpoint, p256dh, auth, user_agent)
  VALUES (v_user_id, p_participant_id, p_endpoint, p_p256dh, p_auth, p_user_agent)
  ON CONFLICT (endpoint) DO UPDATE SET
    user_id = COALESCE(v_user_id, push_subscriptions.user_id),
    participant_id = COALESCE(p_participant_id, push_subscriptions.participant_id),
    p256dh = p_p256dh,
    auth = p_auth,
    user_agent = COALESCE(p_user_agent, push_subscriptions.user_agent),
    updated_at = NOW()
  RETURNING * INTO v_subscription;

  RETURN v_subscription;
END;
$$;

-- RPC: Remove push subscription by endpoint
CREATE OR REPLACE FUNCTION public.remove_push_subscription(
  p_endpoint TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted BOOLEAN;
BEGIN
  DELETE FROM public.push_subscriptions
  WHERE endpoint = p_endpoint
    AND (user_id = auth.uid() OR (auth.uid() IS NULL AND user_id IS NULL))
  RETURNING TRUE INTO v_deleted;

  RETURN COALESCE(v_deleted, FALSE);
END;
$$;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION public.upsert_push_subscription TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_push_subscription TO anon, authenticated;
-- ===========================================
-- Add SFU endpoint/room parameters to start_media_session
-- ===========================================
-- When mode='sfu', allow storing the LiveKit endpoint and room ID
-- so viewers can discover the SFU server to connect to.
-- ===========================================

CREATE OR REPLACE FUNCTION public.start_media_session(
  p_room_id UUID,
  p_mode public.session_mode DEFAULT 'p2p',
  p_capture_source JSONB DEFAULT NULL,
  p_sfu_endpoint TEXT DEFAULT NULL,
  p_sfu_room_id TEXT DEFAULT NULL
)
RETURNS public.media_sessions AS $$
DECLARE
  v_session public.sessions;
  v_media_session public.media_sessions;
BEGIN
  -- Ensure user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify room exists and is not ended
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_room_id AND status != 'ended';

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Room not found or has ended';
  END IF;

  -- End any existing active media sessions from this publisher in this room
  UPDATE public.media_sessions
  SET status = 'ended', ended_at = NOW()
  WHERE room_id = p_room_id
    AND publisher_id = auth.uid()
    AND status = 'active';

  -- Create new media session (include SFU info when mode is 'sfu')
  INSERT INTO public.media_sessions (room_id, publisher_id, mode, capture_source, sfu_endpoint, sfu_room_id)
  VALUES (p_room_id, auth.uid(), p_mode, p_capture_source, p_sfu_endpoint, p_sfu_room_id)
  RETURNING * INTO v_media_session;

  -- Update room: set current host and activate room
  UPDATE public.sessions
  SET
    current_host_id = auth.uid(),
    host_last_seen_at = NOW(),
    status = 'active',
    mode = p_mode
  WHERE id = p_room_id;

  RETURN v_media_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Persistent Sessions Migration
-- Sessions no longer hard-end from the UI. The host "leaves" instead of "ending".
-- Join URLs remain valid indefinitely. Hosts can regenerate join codes to rotate access.

-- =============================================================================
-- STEP 1: host_leave_session RPC
-- Host disconnects gracefully but room stays alive for viewers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.host_leave_session(
  p_session_id UUID
)
RETURNS public.sessions AS $$
DECLARE
  v_session public.sessions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify caller is current host, creator, or original host
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
    AND (current_host_id = auth.uid() OR creator_id = auth.uid() OR host_user_id = auth.uid())
    AND status != 'ended';

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found or you are not the host';
  END IF;

  -- End any active media sessions for this host
  UPDATE public.media_sessions
  SET status = 'ended', ended_at = NOW()
  WHERE room_id = p_session_id
    AND publisher_id = auth.uid()
    AND status IN ('active', 'paused');

  -- Clear current host and pause the room (room stays alive!)
  UPDATE public.sessions
  SET
    current_host_id = NULL,
    status = 'paused'
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  -- NOTE: We do NOT set ended_at
  -- NOTE: We do NOT mark participants as left
  -- The room survives for viewers to keep chatting

  RETURN v_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- STEP 2: regenerate_join_code RPC
-- Generates a new join code, invalidating the old invite URL
-- =============================================================================

CREATE OR REPLACE FUNCTION public.regenerate_join_code(
  p_session_id UUID
)
RETURNS public.sessions AS $$
DECLARE
  v_session public.sessions;
  v_new_code TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Only creator or original host can regenerate
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
    AND (creator_id = auth.uid() OR host_user_id = auth.uid())
    AND status != 'ended';

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found or you are not the creator';
  END IF;

  -- Generate new unique code using existing utility function
  v_new_code := public.generate_unique_join_code();

  -- Update the session with new code
  UPDATE public.sessions
  SET join_code = v_new_code
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- STEP 3: Update join_session to support rejoining
-- When an authenticated user with a previous left_at tries to rejoin,
-- re-activate their existing participant row instead of creating a duplicate
-- =============================================================================

CREATE OR REPLACE FUNCTION public.join_session(
  p_join_code TEXT,
  p_display_name TEXT DEFAULT NULL
)
RETURNS public.session_participants AS $$
DECLARE
  v_session public.sessions;
  v_participant public.session_participants;
  v_display_name TEXT;
  v_user_id UUID;
  v_current_count INTEGER;
  v_max_participants INTEGER;
BEGIN
  v_user_id := auth.uid();

  -- Find the session by join code
  SELECT * INTO v_session
  FROM public.sessions
  WHERE join_code = UPPER(p_join_code)
    AND status IN ('created', 'active', 'paused');

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Session not found or has ended';
  END IF;

  -- Determine display name first (needed for both paths)
  IF v_user_id IS NOT NULL THEN
    -- Authenticated user: use provided name or profile name
    SELECT COALESCE(p_display_name, p.display_name, 'User') INTO v_display_name
    FROM public.profiles p
    WHERE p.id = v_user_id;

    -- For authenticated users, use INSERT ... ON CONFLICT to handle race conditions
    -- First check if already a participant (as host or viewer)
    SELECT * INTO v_participant
    FROM public.session_participants
    WHERE session_id = v_session.id
      AND user_id = v_user_id
      AND left_at IS NULL;

    IF v_participant IS NOT NULL THEN
      -- Already joined (possibly as host), return existing participation
      RETURN v_participant;
    END IF;

    -- Check if previously left and wants to rejoin
    SELECT * INTO v_participant
    FROM public.session_participants
    WHERE session_id = v_session.id
      AND user_id = v_user_id
      AND left_at IS NOT NULL
    ORDER BY left_at DESC
    LIMIT 1;

    IF v_participant IS NOT NULL THEN
      -- Check max participants before reactivating
      v_max_participants := COALESCE((v_session.settings->>'maxParticipants')::INTEGER, 5);
      SELECT COUNT(*) INTO v_current_count
      FROM public.session_participants
      WHERE session_id = v_session.id AND left_at IS NULL;

      IF v_current_count >= v_max_participants THEN
        RAISE EXCEPTION 'Session is full';
      END IF;

      -- Rejoin: clear left_at, update display name and connection status
      UPDATE public.session_participants
      SET left_at = NULL,
          display_name = COALESCE(p_display_name, v_participant.display_name),
          connection_status = 'connected',
          last_seen_at = NOW()
      WHERE id = v_participant.id
      RETURNING * INTO v_participant;
      RETURN v_participant;
    END IF;

    -- Check max participants before inserting
    v_max_participants := COALESCE((v_session.settings->>'maxParticipants')::INTEGER, 5);
    SELECT COUNT(*) INTO v_current_count
    FROM public.session_participants
    WHERE session_id = v_session.id AND left_at IS NULL;

    IF v_current_count >= v_max_participants THEN
      RAISE EXCEPTION 'Session is full';
    END IF;

    -- Insert with ON CONFLICT to handle race condition
    INSERT INTO public.session_participants (session_id, user_id, display_name, role, control_state)
    VALUES (v_session.id, v_user_id, v_display_name, 'viewer', 'view-only')
    ON CONFLICT (session_id, user_id) WHERE left_at IS NULL AND user_id IS NOT NULL
    DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING * INTO v_participant;

  ELSE
    -- Guest: require display name
    IF p_display_name IS NULL OR p_display_name = '' THEN
      RAISE EXCEPTION 'Display name required for guests';
    END IF;
    v_display_name := p_display_name;

    -- Check max participants for guests too
    v_max_participants := COALESCE((v_session.settings->>'maxParticipants')::INTEGER, 5);
    SELECT COUNT(*) INTO v_current_count
    FROM public.session_participants
    WHERE session_id = v_session.id AND left_at IS NULL;

    IF v_current_count >= v_max_participants THEN
      RAISE EXCEPTION 'Session is full';
    END IF;

    -- Create participant record for guest (no conflict possible with NULL user_id)
    INSERT INTO public.session_participants (session_id, user_id, display_name, role, control_state)
    VALUES (v_session.id, NULL, v_display_name, 'viewer', 'view-only')
    RETURNING * INTO v_participant;
  END IF;

  RETURN v_participant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Migration: Create whiteboard tables for SquadX Live
-- Description: Adds support for collaborative whiteboard with Excalidraw + Yjs

-- Create whiteboard_boards table
CREATE TABLE IF NOT EXISTS whiteboard_boards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES sessions(id) ON DELETE CASCADE,
  project_id    UUID, -- Future: references projects(id)
  title         VARCHAR(255) NOT NULL DEFAULT 'Untitled Board',
  thumbnail_url TEXT,
  yjs_state     BYTEA,              -- Yjs document state (binary)
  elements_json JSONB DEFAULT '[]', -- Excalidraw elements (snapshot)
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  is_archived   BOOLEAN DEFAULT FALSE
);

-- Create indexes for whiteboard_boards
CREATE INDEX idx_whiteboard_boards_session_id ON whiteboard_boards(session_id);
CREATE INDEX idx_whiteboard_boards_created_by ON whiteboard_boards(created_by);
CREATE INDEX idx_whiteboard_boards_is_archived ON whiteboard_boards(is_archived);
CREATE INDEX idx_whiteboard_boards_updated_at ON whiteboard_boards(updated_at DESC);

-- Create whiteboard_snapshots table for versioning
CREATE TABLE IF NOT EXISTS whiteboard_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id      UUID REFERENCES whiteboard_boards(id) ON DELETE CASCADE,
  elements_json JSONB NOT NULL,
  thumbnail_url TEXT,
  label         VARCHAR(100),
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for whiteboard_snapshots
CREATE INDEX idx_whiteboard_snapshots_board_id ON whiteboard_snapshots(board_id);
CREATE INDEX idx_whiteboard_snapshots_created_at ON whiteboard_snapshots(created_at DESC);

-- Create whiteboard_agent_actions table for AI agent activity logging
CREATE TABLE IF NOT EXISTS whiteboard_agent_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id      UUID REFERENCES whiteboard_boards(id) ON DELETE CASCADE,
  agent_id      VARCHAR(100) NOT NULL,
  action_type   VARCHAR(50) NOT NULL,
  action_data   JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for whiteboard_agent_actions
CREATE INDEX idx_whiteboard_agent_actions_board_id ON whiteboard_agent_actions(board_id);
CREATE INDEX idx_whiteboard_agent_actions_agent_id ON whiteboard_agent_actions(agent_id);
CREATE INDEX idx_whiteboard_agent_actions_created_at ON whiteboard_agent_actions(created_at DESC);

-- Enable RLS on all tables
ALTER TABLE whiteboard_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE whiteboard_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE whiteboard_agent_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for whiteboard_boards

-- Users can view boards from sessions they participate in
CREATE POLICY "Users can view boards from their sessions"
  ON whiteboard_boards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM session_participants sp
      WHERE sp.session_id = whiteboard_boards.session_id
      AND sp.user_id = auth.uid()
      AND sp.left_at IS NULL
    )
    OR
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = whiteboard_boards.session_id
      AND s.host_user_id = auth.uid()
    )
  );

-- Session hosts can create boards
CREATE POLICY "Session hosts can create boards"
  ON whiteboard_boards
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id
      AND s.host_user_id = auth.uid()
    )
  );

-- Board creators and session hosts can update boards
CREATE POLICY "Board creators and session hosts can update boards"
  ON whiteboard_boards
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id
      AND s.host_user_id = auth.uid()
    )
  );

-- Board creators and session hosts can delete boards
CREATE POLICY "Board creators and session hosts can delete boards"
  ON whiteboard_boards
  FOR DELETE
  USING (
    created_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id
      AND s.host_user_id = auth.uid()
    )
  );

-- RLS Policies for whiteboard_snapshots

-- Users can view snapshots from boards they can access
CREATE POLICY "Users can view snapshots from accessible boards"
  ON whiteboard_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM whiteboard_boards wb
      WHERE wb.id = whiteboard_snapshots.board_id
      AND (
        EXISTS (
          SELECT 1 FROM session_participants sp
          WHERE sp.session_id = wb.session_id
          AND sp.user_id = auth.uid()
          AND sp.left_at IS NULL
        )
        OR
        EXISTS (
          SELECT 1 FROM sessions s
          WHERE s.id = wb.session_id
          AND s.host_user_id = auth.uid()
        )
      )
    )
  );

-- Users can create snapshots for boards they can access
CREATE POLICY "Users can create snapshots for accessible boards"
  ON whiteboard_snapshots
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM whiteboard_boards wb
      WHERE wb.id = board_id
      AND (
        EXISTS (
          SELECT 1 FROM session_participants sp
          WHERE sp.session_id = wb.session_id
          AND sp.user_id = auth.uid()
          AND sp.left_at IS NULL
        )
        OR
        EXISTS (
          SELECT 1 FROM sessions s
          WHERE s.id = wb.session_id
          AND s.host_user_id = auth.uid()
        )
      )
    )
  );

-- Snapshot creators can delete their own snapshots
CREATE POLICY "Snapshot creators can delete their snapshots"
  ON whiteboard_snapshots
  FOR DELETE
  USING (created_by = auth.uid());

-- RLS Policies for whiteboard_agent_actions

-- Users can view agent actions from boards they can access
CREATE POLICY "Users can view agent actions from accessible boards"
  ON whiteboard_agent_actions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM whiteboard_boards wb
      WHERE wb.id = whiteboard_agent_actions.board_id
      AND (
        EXISTS (
          SELECT 1 FROM session_participants sp
          WHERE sp.session_id = wb.session_id
          AND sp.user_id = auth.uid()
          AND sp.left_at IS NULL
        )
        OR
        EXISTS (
          SELECT 1 FROM sessions s
          WHERE s.id = wb.session_id
          AND s.host_user_id = auth.uid()
        )
      )
    )
  );

-- Allow authenticated users to insert agent actions (typically via service role)
CREATE POLICY "Service can insert agent actions"
  ON whiteboard_agent_actions
  FOR INSERT
  WITH CHECK (TRUE);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_whiteboard_board_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER whiteboard_boards_updated_at
  BEFORE UPDATE ON whiteboard_boards
  FOR EACH ROW
  EXECUTE FUNCTION update_whiteboard_board_updated_at();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON whiteboard_boards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON whiteboard_snapshots TO authenticated;
GRANT SELECT, INSERT ON whiteboard_agent_actions TO authenticated;
