import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { successResponse, errorResponse, handleApiError } from '@/lib/api';

// Helper to verify user access to a board's session
async function verifyBoardAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boardId: string,
  userId: string
): Promise<{ board: Record<string, unknown>; isHost: boolean; isCreator: boolean } | { error: string; status: number }> {
  // Get the board with session info
  const { data: board, error: boardError } = await supabase
    .from('whiteboard_boards')
    .select('*, sessions!inner(id, host_user_id)')
    .eq('id', boardId)
    .single();

  if (boardError || !board) {
    return { error: 'Board not found', status: 404 };
  }

  const session = board.sessions as { id: string; host_user_id: string };
  const isHost = session.host_user_id === userId;
  const isCreator = board.created_by === userId;

  // Check if user is host, creator, or participant
  if (!isHost && !isCreator) {
    const { data: participant } = await supabase
      .from('session_participants')
      .select('id')
      .eq('session_id', session.id)
      .eq('user_id', userId)
      .single();

    if (!participant) {
      return { error: 'Access denied', status: 403 };
    }
  }

  return { board, isHost, isCreator };
}

// GET /api/whiteboard/boards/[boardId]/snapshots/[snapshotId] - Get a specific snapshot
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ boardId: string; snapshotId: string }> }
) {
  try {
    const { boardId, snapshotId } = await params;
    const supabase = await createClient();

    // Check authentication
    const { user, error: authError } = await getAuthenticatedUser(supabase);

    if (authError || !user) {
      return errorResponse('Authentication required', 401);
    }

    // Verify user has access to the board's session
    const accessResult = await verifyBoardAccess(supabase, boardId, user.id);
    if ('error' in accessResult) {
      return errorResponse(accessResult.error, accessResult.status);
    }

    // Get the snapshot
    const { data: snapshot, error: snapshotError } = await supabase
      .from('whiteboard_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .eq('board_id', boardId)
      .single();

    if (snapshotError || !snapshot) {
      return errorResponse('Snapshot not found', 404);
    }

    // Transform to camelCase
    const response = {
      id: snapshot.id,
      boardId: snapshot.board_id,
      elementsJson: snapshot.elements_json,
      label: snapshot.label,
      thumbnailUrl: snapshot.thumbnail_url,
      createdBy: snapshot.created_by,
      createdAt: snapshot.created_at,
    };

    return successResponse(response);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/whiteboard/boards/[boardId]/snapshots/[snapshotId] - Delete a snapshot
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ boardId: string; snapshotId: string }> }
) {
  try {
    const { boardId, snapshotId } = await params;
    const supabase = await createClient();

    // Check authentication
    const { user, error: authError } = await getAuthenticatedUser(supabase);

    if (authError || !user) {
      return errorResponse('Authentication required', 401);
    }

    // Verify user has write access to the board (host or creator only)
    const accessResult = await verifyBoardAccess(supabase, boardId, user.id);
    if ('error' in accessResult) {
      return errorResponse(accessResult.error, accessResult.status);
    }

    const { isHost, isCreator } = accessResult;

    // Only host or creator can delete snapshots
    if (!isHost && !isCreator) {
      return errorResponse('Only the host or board creator can delete snapshots', 403);
    }

    // Delete the snapshot
    const { error: snapshotError } = await supabase
      .from('whiteboard_snapshots')
      .delete()
      .eq('id', snapshotId)
      .eq('board_id', boardId);

    if (snapshotError) {
      console.error('Delete snapshot error:', snapshotError);
      return errorResponse(snapshotError.message, 400);
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
