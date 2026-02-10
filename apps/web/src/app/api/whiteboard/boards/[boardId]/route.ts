import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { successResponse, errorResponse, handleApiError } from '@/lib/api';
import { z } from 'zod';

const updateBoardSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  elementsJson: z.array(z.any()).optional(),
  thumbnailUrl: z.string().url().optional(),
  isArchived: z.boolean().optional(),
});

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

    // Get the board
    const { data: board, error: boardError } = await supabase
      .from('whiteboard_boards')
      .select('*')
      .eq('id', boardId)
      .single();

    if (boardError || !board) {
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
