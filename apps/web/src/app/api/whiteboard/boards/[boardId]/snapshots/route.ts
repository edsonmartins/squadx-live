import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { successResponse, errorResponse, handleApiError } from '@/lib/api';
import { z } from 'zod';

const createSnapshotSchema = z.object({
  elementsJson: z.array(z.any()),
  label: z.string().max(100).optional(),
  thumbnailUrl: z.string().url().optional(),
});

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

    // Verify board exists
    const { data: board, error: boardError } = await supabase
      .from('whiteboard_boards')
      .select('id')
      .eq('id', boardId)
      .single();

    if (boardError || !board) {
      return errorResponse('Board not found', 404);
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
