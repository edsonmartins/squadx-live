import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { successResponse, errorResponse, handleApiError } from '@/lib/api';
import { z } from 'zod';

const updateBoardSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  elementsJson: z.array(z.any()).optional(),
  thumbnailUrl: z.string().url().optional(),
  isArchived: z.boolean().optional(),
});

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

// GET /api/whiteboard/boards/[boardId] - Get a specific board
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { boardId } = await params;
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

    const { board } = accessResult;

    // Transform to camelCase
    const response = {
      id: board.id,
      sessionId: board.session_id,
      projectId: board.project_id,
      title: board.title,
      thumbnailUrl: board.thumbnail_url,
      elementsJson: board.elements_json,
      createdBy: board.created_by,
      createdAt: board.created_at,
      updatedAt: board.updated_at,
      isArchived: board.is_archived,
    };

    return successResponse(response);
  } catch (error) {
    return handleApiError(error);
  }
}

// Internal update function used by both PATCH and POST
async function updateBoard(
  request: Request,
  params: Promise<{ boardId: string }>
) {
  try {
    const { boardId } = await params;
    const body: unknown = await request.json().catch(() => ({}));
    const data = updateBoardSchema.parse(body);

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

    // Only host or creator can modify the board
    if (!isHost && !isCreator) {
      return errorResponse('Only the host or board creator can modify this board', 403);
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.title !== undefined) {
      updateData.title = data.title;
    }
    if (data.elementsJson !== undefined) {
      updateData.elements_json = data.elementsJson;
    }
    if (data.thumbnailUrl !== undefined) {
      updateData.thumbnail_url = data.thumbnailUrl;
    }
    if (data.isArchived !== undefined) {
      updateData.is_archived = data.isArchived;
    }

    // Update the board
    const { data: board, error: boardError } = await supabase
      .from('whiteboard_boards')
      .update(updateData)
      .eq('id', boardId)
      .select()
      .single();

    if (boardError) {
      console.error('Update board error:', boardError);
      return errorResponse(boardError.message, 400);
    }

    if (!board) {
      return errorResponse('Board not found', 404);
    }

    // Transform to camelCase
    const response = {
      id: board.id,
      sessionId: board.session_id,
      projectId: board.project_id,
      title: board.title,
      thumbnailUrl: board.thumbnail_url,
      elementsJson: board.elements_json,
      createdBy: board.created_by,
      createdAt: board.created_at,
      updatedAt: board.updated_at,
      isArchived: board.is_archived,
    };

    return successResponse(response);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/whiteboard/boards/[boardId] - Update a board (for sendBeacon)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  return updateBoard(request, params);
}

// PATCH /api/whiteboard/boards/[boardId] - Update a board
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  return updateBoard(request, params);
}

// DELETE /api/whiteboard/boards/[boardId] - Archive a board
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { boardId } = await params;
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

    // Only host or creator can delete the board
    if (!isHost && !isCreator) {
      return errorResponse('Only the host or board creator can delete this board', 403);
    }

    // Archive the board (soft delete)
    const { error: boardError } = await supabase
      .from('whiteboard_boards')
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq('id', boardId);

    if (boardError) {
      console.error('Delete board error:', boardError);
      return errorResponse(boardError.message, 400);
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
