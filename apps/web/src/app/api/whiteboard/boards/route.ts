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

    // sessionId is required to prevent IDOR - users can only list boards for sessions they have access to
    if (!sessionId) {
      return errorResponse('sessionId is required', 400);
    }

    // Verify user has access to the session (host or participant)
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, host_user_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return errorResponse('Session not found', 404);
    }

    // Check if user is host or participant
    const isHost = session.host_user_id === user.id;
    if (!isHost) {
      const { data: participant } = await supabase
        .from('session_participants')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (!participant) {
        return errorResponse('Access denied', 403);
      }
    }

    // Build query - now always filtered by sessionId
    const { data: boards, error: boardsError } = await supabase
      .from('whiteboard_boards')
      .select('*')
      .eq('is_archived', false)
      .eq('session_id', sessionId)
      .order('updated_at', { ascending: false });

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
