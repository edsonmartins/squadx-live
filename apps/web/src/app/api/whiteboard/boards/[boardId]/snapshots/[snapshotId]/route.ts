import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { successResponse, errorResponse, handleApiError } from '@/lib/api';

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
