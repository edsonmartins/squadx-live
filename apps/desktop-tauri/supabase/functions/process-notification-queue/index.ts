import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEND_NOTIFICATION_URL = `${SUPABASE_URL}/functions/v1/send-meeting-notification`;

interface NotificationQueueItem {
  id: string;
  meeting_id: string;
  user_id: string;
  notification_type: "invite" | "reminder" | "update" | "cancel";
  scheduled_for: string;
  status: string;
}

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get pending notifications that are due
    const now = new Date().toISOString();
    const { data: pendingNotifications, error: fetchError } = await supabase
      .from("notification_queue")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(50); // Process in batches

    if (fetchError) {
      throw new Error(`Failed to fetch notifications: ${fetchError.message}`);
    }

    if (!pendingNotifications || pendingNotifications.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "No pending notifications" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${pendingNotifications.length} notifications`);

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const notification of pendingNotifications as NotificationQueueItem[]) {
      try {
        // Call the send-meeting-notification function
        const response = await fetch(SEND_NOTIFICATION_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            meeting_id: notification.meeting_id,
            user_id: notification.user_id,
            notification_type: notification.notification_type,
          }),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          // Mark as sent
          await supabase
            .from("notification_queue")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
            })
            .eq("id", notification.id);

          results.succeeded++;
        } else {
          // Mark as failed
          await supabase
            .from("notification_queue")
            .update({
              status: "failed",
              error_message: result.error || "Unknown error",
            })
            .eq("id", notification.id);

          results.failed++;
          results.errors.push(`${notification.id}: ${result.error || "Unknown error"}`);
        }

        results.processed++;
      } catch (error) {
        console.error(`Error processing notification ${notification.id}:`, error);

        await supabase
          .from("notification_queue")
          .update({
            status: "failed",
            error_message: error.message,
          })
          .eq("id", notification.id);

        results.failed++;
        results.processed++;
        results.errors.push(`${notification.id}: ${error.message}`);
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Queue processing error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
