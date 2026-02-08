import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

interface GoogleTokens {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  email?: string;
}

interface GoogleEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  status: string;
  updated: string;
}

interface WebhookPayload {
  resourceId: string;
  resourceUri: string;
  channelId: string;
  channelExpiration: string;
  resourceState: string;
}

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Handle different request types
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    switch (action) {
      case "refresh-tokens":
        return await handleRefreshTokens(supabase);

      case "sync-all":
        return await handleSyncAll(supabase);

      case "webhook":
        return await handleWebhook(req, supabase);

      default:
        // Default: process sync for all users with expired or near-expiry tokens
        return await handleRefreshTokens(supabase);
    }
  } catch (error) {
    console.error("Google Calendar sync error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// Refresh tokens that are expired or expiring soon
async function handleRefreshTokens(supabase: any) {
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

  // Get tokens that expire within 5 minutes
  const { data: expiringTokens, error } = await supabase
    .from("user_google_tokens")
    .select("*")
    .lt("expires_at", fiveMinutesFromNow.toISOString())
    .eq("sync_enabled", true);

  if (error) {
    throw new Error(`Failed to fetch expiring tokens: ${error.message}`);
  }

  if (!expiringTokens || expiringTokens.length === 0) {
    return new Response(JSON.stringify({ refreshed: 0, message: "No tokens to refresh" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let refreshed = 0;
  let failed = 0;

  for (const tokens of expiringTokens as GoogleTokens[]) {
    try {
      await refreshToken(supabase, tokens);
      refreshed++;
    } catch (err) {
      console.error(`Failed to refresh token for user ${tokens.user_id}:`, err);
      failed++;
    }
  }

  return new Response(JSON.stringify({ refreshed, failed }), {
    headers: { "Content-Type": "application/json" },
  });
}

// Refresh a single user's token
async function refreshToken(supabase: any, tokens: GoogleTokens) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Google credentials not configured");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: tokens.refresh_token,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json();
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);

  await supabase
    .from("user_google_tokens")
    .update({
      access_token: data.access_token,
      expires_at: newExpiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", tokens.user_id);
}

// Sync all meetings for all connected users
async function handleSyncAll(supabase: any) {
  const { data: allTokens, error } = await supabase
    .from("user_google_tokens")
    .select("*")
    .eq("sync_enabled", true);

  if (error) {
    throw new Error(`Failed to fetch tokens: ${error.message}`);
  }

  if (!allTokens || allTokens.length === 0) {
    return new Response(JSON.stringify({ synced: 0, message: "No users to sync" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let synced = 0;
  let failed = 0;

  for (const tokens of allTokens as GoogleTokens[]) {
    try {
      // Refresh token if needed
      const now = new Date();
      const expiresAt = new Date(tokens.expires_at);
      if (expiresAt < new Date(now.getTime() + 5 * 60 * 1000)) {
        await refreshToken(supabase, tokens);
        // Re-fetch the updated token
        const { data: updated } = await supabase
          .from("user_google_tokens")
          .select("access_token")
          .eq("user_id", tokens.user_id)
          .single();
        if (updated) {
          tokens.access_token = updated.access_token;
        }
      }

      await syncUserMeetings(supabase, tokens);
      synced++;
    } catch (err) {
      console.error(`Failed to sync for user ${tokens.user_id}:`, err);
      failed++;
    }
  }

  return new Response(JSON.stringify({ synced, failed }), {
    headers: { "Content-Type": "application/json" },
  });
}

// Sync meetings for a single user
async function syncUserMeetings(supabase: any, tokens: GoogleTokens) {
  // Get user's meetings that have google_event_id
  const { data: meetings, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("organizer_id", tokens.user_id)
    .not("google_event_id", "is", null);

  if (error) {
    throw new Error(`Failed to fetch meetings: ${error.message}`);
  }

  // For each meeting, check if the Google event still exists and is up to date
  for (const meeting of meetings || []) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${meeting.google_event_id}`,
        {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        }
      );

      if (response.status === 404) {
        // Event was deleted in Google, mark meeting as cancelled
        await supabase
          .from("meetings")
          .update({
            status: "cancelled",
            google_event_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", meeting.id);
      } else if (response.ok) {
        const googleEvent: GoogleEvent = await response.json();

        // Check if Google event was updated more recently
        const googleUpdated = new Date(googleEvent.updated);
        const meetingUpdated = new Date(meeting.updated_at);

        if (googleUpdated > meetingUpdated) {
          // Update meeting from Google
          const startDateTime = googleEvent.start.dateTime || googleEvent.start.date;
          const endDateTime = googleEvent.end.dateTime || googleEvent.end.date;

          if (startDateTime && endDateTime) {
            const start = new Date(startDateTime);
            const end = new Date(endDateTime);
            const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

            await supabase
              .from("meetings")
              .update({
                title: googleEvent.summary,
                description: googleEvent.description,
                scheduled_at: start.toISOString(),
                duration_minutes: durationMinutes,
                status: googleEvent.status === "cancelled" ? "cancelled" : meeting.status,
                updated_at: new Date().toISOString(),
              })
              .eq("id", meeting.id);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to sync meeting ${meeting.id}:`, err);
    }
  }
}

// Handle Google Calendar webhook notifications
async function handleWebhook(req: Request, supabase: any) {
  // Verify the request is from Google
  const channelId = req.headers.get("X-Goog-Channel-ID");
  const resourceState = req.headers.get("X-Goog-Resource-State");
  const resourceId = req.headers.get("X-Goog-Resource-ID");

  if (!channelId || !resourceState) {
    return new Response(JSON.stringify({ error: "Invalid webhook request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`Webhook received: channelId=${channelId}, state=${resourceState}, resourceId=${resourceId}`);

  // Handle sync notification
  if (resourceState === "sync") {
    // This is the initial sync confirmation
    return new Response(JSON.stringify({ success: true, message: "Sync acknowledged" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // For exists or update states, we need to fetch the changes
  // The channelId should contain the user_id we set when creating the watch
  const userId = channelId.split("-")[0]; // Assuming format: userId-timestamp

  if (!userId) {
    return new Response(JSON.stringify({ error: "Invalid channel ID" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get the user's tokens
  const { data: tokens, error } = await supabase
    .from("user_google_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !tokens) {
    return new Response(JSON.stringify({ error: "User tokens not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Refresh token if needed and sync
  try {
    const now = new Date();
    const expiresAt = new Date(tokens.expires_at);
    if (expiresAt < new Date(now.getTime() + 5 * 60 * 1000)) {
      await refreshToken(supabase, tokens);
      const { data: updated } = await supabase
        .from("user_google_tokens")
        .select("access_token")
        .eq("user_id", tokens.user_id)
        .single();
      if (updated) {
        tokens.access_token = updated.access_token;
      }
    }

    await syncUserMeetings(supabase, tokens);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
