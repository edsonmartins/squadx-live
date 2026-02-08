import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { successResponse, errorResponse, handleApiError } from '@/lib/api';
import { z } from 'zod';

const createBoardSchema = z.object({
  sessionId: z.string().uuid(),
  title: z.string().min(1).max(255).optional().default('Untitled Board'),
  projectId: z.string().uuid().optional(),
});

// POST /api/whiteboard/boards - Create a new board
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => ({}));
    const data = createBoardSchema.parse(body);

    const supabase = await createClient();

    // Check authentication
    const { user, error: authError } = await getAuthenticatedUser(supabase);

    if (authError || !user) {
      return errorResponse('Authentication required', 401);
    }

    // Verify user has access to the session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, host_user_id')
      .eq('id', data.sessionId)
      .single();

    if (sessionError || !session) {
      return errorResponse('Session not found', 404);
    }

    // Create the board
    const { data: board, error: boardError } = await supabase
      .from('whiteboard_boards')
      .insert({
        session_id: data.sessionId,
        project_id: data.projectId || null,
        title: data.title,
        created_by: user.id,
        elements_json: [],
      })
      .select()
      .single();

    if (boardError) {
      console.error('Create board error:', boardError);
      return errorResponse(boardError.message, 400);
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

    return successResponse(response, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

// GET /api/whiteboard/boards - List boards
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    const supabase = await createClient();

    // Check authentication
    const { user, error: authError } = await getAuthenticatedUser(supabase);

    if (authError || !user) {
      return errorResponse('Authentication required', 401);
    }

    // Build query
    let query = supabase
      .from('whiteboard_boards')
      .select('*')
      .eq('is_archived', false)
      .order('updated_at', { ascending: false });

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { data: boards, error: boardsError } = await query;

    if (boardsError) {
      console.error('List boards error:', boardsError);
      return errorResponse(boardsError.message, 400);
    }

    // Transform to camelCase
    const response = (boards || []).map((board) => ({
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
    }));

    return successResponse({ boards: response });
  } catch (error) {
    return handleApiError(error);
  }
}
