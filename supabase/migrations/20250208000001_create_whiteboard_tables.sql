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
