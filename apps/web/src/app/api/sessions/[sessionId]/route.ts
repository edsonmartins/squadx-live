import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { successResponse, errorResponse, handleApiError } from '@/lib/api';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

// GET /api/sessions/[sessionId] - Get session details
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const supabase = await createClient();

    // Get session with participants
    const { data, error } = await supabase
      .from('sessions')
      .select('*, session_participants(*)')
      .eq('id', sessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return errorResponse('Session not found', 404);
      }
      console.error('Get session error:', error);
      return errorResponse(error.message, 400);
    }

    return successResponse(data);
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/sessions/[sessionId] - Update session (host presence)
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const supabase = await createClient();

    // Check authentication
    const { user, error: authError } = await getAuthenticatedUser(supabase);

    if (authError || !user) {
      return errorResponse('Authentication required', 401);
    }

    const body = await request.json() as { action?: string };

    // Handle host join action - sets current_host_id
    if (body.action === 'host_join') {
      // Verify the user is the session host
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('host_user_id')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) {
        return errorResponse('Session not found', 404);
      }

      if (session.host_user_id !== user.id) {
        return errorResponse('Only the session host can perform this action', 403);
      }

      // Update current_host_id and status to active
      const { data, error } = await supabase
        .from('sessions')
        .update({
          current_host_id: user.id,
          status: 'active',
        })
        .eq('id', sessionId)
        .select()
        .single();

      if (error) {
        console.error('Host join error:', error);
        return errorResponse(error.message, 400);
      }

      return successResponse(data);
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/sessions/[sessionId] - Host leaves session (room stays alive)
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const supabase = await createClient();

    // Check authentication (supports both cookie and Bearer token)
    const { user, error: authError } = await getAuthenticatedUser(supabase);

    if (authError || !user) {
      return errorResponse('Authentication required', 401);
    }

    // Host leaves session — room persists for viewers to keep chatting
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('host_leave_session', {
      p_session_id: sessionId,
    });

    if (error) {
      console.error('Leave session error:', error);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      return errorResponse(error.message, 400);
    }

    return successResponse(data);
  } catch (error) {
    return handleApiError(error);
  }
}
