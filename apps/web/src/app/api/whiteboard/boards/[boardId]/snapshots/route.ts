import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { successResponse, errorResponse, handleApiError } from '@/lib/api';
import { z } from 'zod';

const createSnapshotSchema = z.object({
  elementsJson: z.array(z.any()),
  label: z.string().max(100).optional(),
  thumbnailUrl: z.string().url().optional(),
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

// POST /api/whiteboard/boards/[boardId]/snapshots - Create a snapshot
export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { boardId } = await params;
    const body: unknown = await request.json().catch(() => ({}));
    const data = createSnapshotSchema.parse(body);

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

    const { isHost, isCreator } = accessResult;

    // Only host or creator can create snapshots
    if (!isHost && !isCreator) {
      return errorResponse('Only the host or board creator can create snapshots', 403);
    }

    // Create the snapshot
    const { data: snapshot, error: snapshotError } = await supabase
      .from('whiteboard_snapshots')
      .insert({
        board_id: boardId,
        elements_json: data.elementsJson,
        label: data.label,
        thumbnail_url: data.thumbnailUrl,
        created_by: user.id,
      })
      .select()
      .single();

    if (snapshotError) {
      console.error('Create snapshot error:', snapshotError);
      return errorResponse(snapshotError.message, 400);
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

    return successResponse(response, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

// GET /api/whiteboard/boards/[boardId]/snapshots - List snapshots
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

    // Get snapshots for the board
    const { data: snapshots, error: snapshotsError } = await supabase
      .from('whiteboard_snapshots')
      .select('*')
      .eq('board_id', boardId)
      .order('created_at', { ascending: false });

    if (snapshotsError) {
      console.error('List snapshots error:', snapshotsError);
      return errorResponse(snapshotsError.message, 400);
    }

    // Transform to camelCase
    const response = (snapshots || []).map((snapshot) => ({
      id: snapshot.id,
      boardId: snapshot.board_id,
      elementsJson: snapshot.elements_json,
      label: snapshot.label,
      thumbnailUrl: snapshot.thumbnail_url,
      createdBy: snapshot.created_by,
      createdAt: snapshot.created_at,
    }));

    return successResponse({ snapshots: response });
  } catch (error) {
    return handleApiError(error);
  }
}
