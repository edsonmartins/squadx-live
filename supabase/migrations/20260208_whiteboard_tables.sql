-- =====================================================
-- SquadX Whiteboard Tables Migration
-- Created: 2026-02-08
-- Description: Tables for collaborative whiteboard with
--              real-time sync, snapshots, and AI agent actions
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Table: whiteboard_boards
-- Main table for whiteboard boards
-- =====================================================
CREATE TABLE IF NOT EXISTS whiteboard_boards (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id    UUID NOT NULL,
  project_id    UUID,
  title         VARCHAR(255) NOT NULL DEFAULT 'Untitled Board',
  thumbnail_url TEXT,
  yjs_state     BYTEA,              -- Yjs document state (binary CRDT)
  elements_json JSONB DEFAULT '[]', -- Excalidraw elements (snapshot for quick load)
  created_by    UUID NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  is_archived   BOOLEAN DEFAULT FALSE,

  -- Constraints
  CONSTRAINT fk_whiteboard_boards_session
    FOREIGN KEY (session_id)
    REFERENCES sessions(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_whiteboard_boards_project
    FOREIGN KEY (project_id)
    REFERENCES projects(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_whiteboard_boards_created_by
    FOREIGN KEY (created_by)
    REFERENCES auth.users(id)
    ON DELETE CASCADE
);

-- Indexes for whiteboard_boards
CREATE INDEX IF NOT EXISTS idx_whiteboard_boards_session_id
  ON whiteboard_boards(session_id);
CREATE INDEX IF NOT EXISTS idx_whiteboard_boards_project_id
  ON whiteboard_boards(project_id);
CREATE INDEX IF NOT EXISTS idx_whiteboard_boards_created_by
  ON whiteboard_boards(created_by);
CREATE INDEX IF NOT EXISTS idx_whiteboard_boards_is_archived
  ON whiteboard_boards(is_archived);
CREATE INDEX IF NOT EXISTS idx_whiteboard_boards_updated_at
  ON whiteboard_boards(updated_at DESC);

-- =====================================================
-- Table: whiteboard_snapshots
-- Versioning/snapshots for boards
-- =====================================================
CREATE TABLE IF NOT EXISTS whiteboard_snapshots (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id      UUID NOT NULL,
  elements_json JSONB NOT NULL,
  thumbnail_url TEXT,
  label         VARCHAR(100),
  created_by    UUID NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT fk_whiteboard_snapshots_board
    FOREIGN KEY (board_id)
    REFERENCES whiteboard_boards(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_whiteboard_snapshots_created_by
    FOREIGN KEY (created_by)
    REFERENCES auth.users(id)
    ON DELETE CASCADE
);

-- Indexes for whiteboard_snapshots
CREATE INDEX IF NOT EXISTS idx_whiteboard_snapshots_board_id
  ON whiteboard_snapshots(board_id);
CREATE INDEX IF NOT EXISTS idx_whiteboard_snapshots_created_at
  ON whiteboard_snapshots(created_at DESC);

-- =====================================================
-- Table: whiteboard_agent_actions
-- Log of AI agent actions on boards
-- =====================================================
CREATE TABLE IF NOT EXISTS whiteboard_agent_actions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id      UUID NOT NULL,
  agent_id      VARCHAR(100) NOT NULL,
  agent_name    VARCHAR(255),
  action_type   VARCHAR(50) NOT NULL,
  action_data   JSONB,
  element_ids   TEXT[],          -- IDs of elements affected
  created_at    TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT fk_whiteboard_agent_actions_board
    FOREIGN KEY (board_id)
    REFERENCES whiteboard_boards(id)
    ON DELETE CASCADE,

  -- Valid action types
  CONSTRAINT chk_action_type CHECK (
    action_type IN (
      'create_shapes',
      'update_shapes',
      'delete_shapes',
      'add_annotation',
      'create_diagram',
      'apply_template',
      'move_shapes',
      'group_shapes'
    )
  )
);

-- Indexes for whiteboard_agent_actions
CREATE INDEX IF NOT EXISTS idx_whiteboard_agent_actions_board_id
  ON whiteboard_agent_actions(board_id);
CREATE INDEX IF NOT EXISTS idx_whiteboard_agent_actions_agent_id
  ON whiteboard_agent_actions(agent_id);
CREATE INDEX IF NOT EXISTS idx_whiteboard_agent_actions_created_at
  ON whiteboard_agent_actions(created_at DESC);

-- =====================================================
-- Table: whiteboard_permissions
-- Drawing permissions for participants (optional - for persistence)
-- =====================================================
CREATE TABLE IF NOT EXISTS whiteboard_permissions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id      UUID NOT NULL,
  user_id       UUID,
  agent_id      VARCHAR(100),
  permission    VARCHAR(20) NOT NULL DEFAULT 'none',
  granted_by    UUID,
  granted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT fk_whiteboard_permissions_board
    FOREIGN KEY (board_id)
    REFERENCES whiteboard_boards(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_whiteboard_permissions_user
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_whiteboard_permissions_granted_by
    FOREIGN KEY (granted_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  -- Valid permission states
  CONSTRAINT chk_permission CHECK (
    permission IN ('none', 'requested', 'granted')
  ),

  -- Either user_id or agent_id must be set
  CONSTRAINT chk_user_or_agent CHECK (
    (user_id IS NOT NULL AND agent_id IS NULL) OR
    (user_id IS NULL AND agent_id IS NOT NULL)
  ),

  -- Unique constraint per board/user or board/agent
  CONSTRAINT uq_whiteboard_permissions_user
    UNIQUE (board_id, user_id),
  CONSTRAINT uq_whiteboard_permissions_agent
    UNIQUE (board_id, agent_id)
);

-- Indexes for whiteboard_permissions
CREATE INDEX IF NOT EXISTS idx_whiteboard_permissions_board_id
  ON whiteboard_permissions(board_id);
CREATE INDEX IF NOT EXISTS idx_whiteboard_permissions_user_id
  ON whiteboard_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_whiteboard_permissions_agent_id
  ON whiteboard_permissions(agent_id);

-- =====================================================
-- Function: Update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_whiteboard_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for whiteboard_boards
DROP TRIGGER IF EXISTS trigger_whiteboard_boards_updated_at ON whiteboard_boards;
CREATE TRIGGER trigger_whiteboard_boards_updated_at
  BEFORE UPDATE ON whiteboard_boards
  FOR EACH ROW
  EXECUTE FUNCTION update_whiteboard_updated_at();

-- Trigger for whiteboard_permissions
DROP TRIGGER IF EXISTS trigger_whiteboard_permissions_updated_at ON whiteboard_permissions;
CREATE TRIGGER trigger_whiteboard_permissions_updated_at
  BEFORE UPDATE ON whiteboard_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_whiteboard_updated_at();

-- =====================================================
-- RLS Policies (Row Level Security)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE whiteboard_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE whiteboard_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE whiteboard_agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whiteboard_permissions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view boards in sessions they have access to
CREATE POLICY "Users can view boards in their sessions"
  ON whiteboard_boards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = whiteboard_boards.session_id
      AND (
        s.host_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM session_participants sp
          WHERE sp.session_id = s.id
          AND sp.user_id = auth.uid()
        )
      )
    )
  );

-- Policy: Session host can create boards
CREATE POLICY "Session host can create boards"
  ON whiteboard_boards
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id
      AND s.host_user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM session_participants sp
      WHERE sp.session_id = session_id
      AND sp.user_id = auth.uid()
    )
  );

-- Policy: Board creator or session host can update boards
CREATE POLICY "Board creator or host can update boards"
  ON whiteboard_boards
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = whiteboard_boards.session_id
      AND s.host_user_id = auth.uid()
    )
  );

-- Policy: Board creator or session host can delete boards
CREATE POLICY "Board creator or host can delete boards"
  ON whiteboard_boards
  FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = whiteboard_boards.session_id
      AND s.host_user_id = auth.uid()
    )
  );

-- Policy: Users can view snapshots of boards they can access
CREATE POLICY "Users can view snapshots"
  ON whiteboard_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM whiteboard_boards b
      WHERE b.id = whiteboard_snapshots.board_id
      AND EXISTS (
        SELECT 1 FROM sessions s
        WHERE s.id = b.session_id
        AND (
          s.host_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM session_participants sp
            WHERE sp.session_id = s.id
            AND sp.user_id = auth.uid()
          )
        )
      )
    )
  );

-- Policy: Users with board access can create snapshots
CREATE POLICY "Users can create snapshots"
  ON whiteboard_snapshots
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM whiteboard_boards b
      WHERE b.id = board_id
      AND EXISTS (
        SELECT 1 FROM sessions s
        WHERE s.id = b.session_id
        AND (
          s.host_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM session_participants sp
            WHERE sp.session_id = s.id
            AND sp.user_id = auth.uid()
          )
        )
      )
    )
  );

-- Policy: Snapshot creator can delete their snapshots
CREATE POLICY "Snapshot creator can delete"
  ON whiteboard_snapshots
  FOR DELETE
  USING (created_by = auth.uid());

-- Policy: Users can view agent actions on boards they can access
CREATE POLICY "Users can view agent actions"
  ON whiteboard_agent_actions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM whiteboard_boards b
      WHERE b.id = whiteboard_agent_actions.board_id
      AND EXISTS (
        SELECT 1 FROM sessions s
        WHERE s.id = b.session_id
        AND (
          s.host_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM session_participants sp
            WHERE sp.session_id = s.id
            AND sp.user_id = auth.uid()
          )
        )
      )
    )
  );

-- Policy: Service role can insert agent actions (MCP server)
CREATE POLICY "Service role can insert agent actions"
  ON whiteboard_agent_actions
  FOR INSERT
  WITH CHECK (true);

-- Policy: Users can view permissions
CREATE POLICY "Users can view permissions"
  ON whiteboard_permissions
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM whiteboard_boards b
      WHERE b.id = whiteboard_permissions.board_id
      AND EXISTS (
        SELECT 1 FROM sessions s
        WHERE s.id = b.session_id
        AND s.host_user_id = auth.uid()
      )
    )
  );

-- Policy: Session host can manage permissions
CREATE POLICY "Session host can manage permissions"
  ON whiteboard_permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM whiteboard_boards b
      WHERE b.id = whiteboard_permissions.board_id
      AND EXISTS (
        SELECT 1 FROM sessions s
        WHERE s.id = b.session_id
        AND s.host_user_id = auth.uid()
      )
    )
  );

-- =====================================================
-- Comments
-- =====================================================
COMMENT ON TABLE whiteboard_boards IS 'Whiteboard boards for collaborative drawing';
COMMENT ON TABLE whiteboard_snapshots IS 'Version snapshots of whiteboard states';
COMMENT ON TABLE whiteboard_agent_actions IS 'Log of AI agent actions on whiteboards';
COMMENT ON TABLE whiteboard_permissions IS 'Drawing permissions for users and agents';

COMMENT ON COLUMN whiteboard_boards.yjs_state IS 'Binary Yjs CRDT document state';
COMMENT ON COLUMN whiteboard_boards.elements_json IS 'Excalidraw elements JSON snapshot';
COMMENT ON COLUMN whiteboard_agent_actions.action_type IS 'Type of action: create_shapes, update_shapes, delete_shapes, add_annotation, create_diagram, apply_template';
