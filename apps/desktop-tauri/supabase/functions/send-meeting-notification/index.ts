import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "reunioes@squadx.live";
const APP_URL = Deno.env.get("APP_URL") || "https://app.squadx.live";

interface NotificationPayload {
  meeting_id: string;
  user_id: string;
  notification_type: "invite" | "reminder" | "update" | "cancel";
}

interface Meeting {
  id: string;
  title: string;
  description?: string;
  scheduled_at: string;
  duration_minutes: number;
  organizer_id: string;
}

interface UserProfile {
  user_id: string;
  display_name: string;
  email?: string;
}

serve(async (req) => {
  try {
    const payload: NotificationPayload = await req.json();
    const { meeting_id, user_id, notification_type } = payload;

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get meeting details
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meeting_id)
      .single();

    if (meetingError || !meeting) {
      throw new Error(`Meeting not found: ${meetingError?.message}`);
    }

    // Get user profile with email from auth.users
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(user_id);

    if (authError || !authUser?.user?.email) {
      console.log(`User ${user_id} has no email, skipping notification`);
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const userEmail = authUser.user.email;

    // Get user profile for display name
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("display_name")
      .eq("user_id", user_id)
      .single();

    const userName = profile?.display_name || userEmail.split("@")[0];

    // Get organizer name
    const { data: organizerProfile } = await supabase
      .from("user_profiles")
      .select("display_name")
      .eq("user_id", meeting.organizer_id)
      .single();

    const organizerName = organizerProfile?.display_name || "Organizador";

    // Format date
    const meetingDate = new Date(meeting.scheduled_at);
    const formattedDate = meetingDate.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const formattedTime = meetingDate.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Build email content based on notification type
    let subject: string;
    let htmlContent: string;

    switch (notification_type) {
      case "invite":
        subject = `Convite: ${meeting.title}`;
        htmlContent = buildInviteEmail(meeting, userName, organizerName, formattedDate, formattedTime);
        break;
      case "reminder":
        subject = `Lembrete: ${meeting.title} em 15 minutos`;
        htmlContent = buildReminderEmail(meeting, userName, formattedDate, formattedTime);
        break;
      case "update":
        subject = `Atualizado: ${meeting.title}`;
        htmlContent = buildUpdateEmail(meeting, userName, organizerName, formattedDate, formattedTime);
        break;
      case "cancel":
        subject = `Cancelado: ${meeting.title}`;
        htmlContent = buildCancelEmail(meeting, userName, organizerName, formattedDate, formattedTime);
        break;
      default:
        throw new Error(`Unknown notification type: ${notification_type}`);
    }

    // Send email via Resend
    if (!RESEND_API_KEY) {
      console.log("RESEND_API_KEY not configured, skipping email");
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "no_api_key" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: userEmail,
        subject: subject,
        html: htmlContent,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      throw new Error(`Failed to send email: ${errorText}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Notification error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

function buildInviteEmail(meeting: Meeting, userName: string, organizerName: string, date: string, time: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
        .header { background: #6366f1; color: white; padding: 24px; }
        .content { padding: 24px; }
        .meeting-info { background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0; }
        .btn { display: inline-block; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin: 4px; }
        .btn-accept { background: #22c55e; color: white; }
        .btn-decline { background: #ef4444; color: white; }
        .btn-tentative { background: #f59e0b; color: white; }
        .footer { padding: 16px 24px; background: #f8fafc; color: #64748b; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 24px;">Convite para Reuniao</h1>
        </div>
        <div class="content">
          <p>Ola ${userName},</p>
          <p><strong>${organizerName}</strong> convidou voce para uma reuniao:</p>

          <div class="meeting-info">
            <h2 style="margin: 0 0 8px 0;">${meeting.title}</h2>
            ${meeting.description ? `<p style="color: #64748b; margin: 0 0 12px 0;">${meeting.description}</p>` : ""}
            <p style="margin: 0;"><strong>Data:</strong> ${date}</p>
            <p style="margin: 0;"><strong>Horario:</strong> ${time}</p>
            <p style="margin: 0;"><strong>Duracao:</strong> ${meeting.duration_minutes} minutos</p>
          </div>

          <p>Voce vai participar?</p>
          <div>
            <a href="${APP_URL}/calendar?meeting=${meeting.id}&response=accepted" class="btn btn-accept">Aceitar</a>
            <a href="${APP_URL}/calendar?meeting=${meeting.id}&response=tentative" class="btn btn-tentative">Talvez</a>
            <a href="${APP_URL}/calendar?meeting=${meeting.id}&response=declined" class="btn btn-decline">Recusar</a>
          </div>
        </div>
        <div class="footer">
          <p>Este email foi enviado pelo SquadX Live. <a href="${APP_URL}">Abrir SquadX Live</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function buildReminderEmail(meeting: Meeting, userName: string, date: string, time: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
        .header { background: #f59e0b; color: white; padding: 24px; }
        .content { padding: 24px; }
        .meeting-info { background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0; }
        .btn { display: inline-block; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; background: #6366f1; color: white; }
        .footer { padding: 16px 24px; background: #f8fafc; color: #64748b; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 24px;">Reuniao em 15 minutos</h1>
        </div>
        <div class="content">
          <p>Ola ${userName},</p>
          <p>Sua reuniao comeca em breve:</p>

          <div class="meeting-info">
            <h2 style="margin: 0 0 8px 0;">${meeting.title}</h2>
            <p style="margin: 0;"><strong>Horario:</strong> ${time}</p>
            <p style="margin: 0;"><strong>Duracao:</strong> ${meeting.duration_minutes} minutos</p>
          </div>

          <a href="${APP_URL}/calendar" class="btn">Abrir Agenda</a>
        </div>
        <div class="footer">
          <p>Este email foi enviado pelo SquadX Live.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function buildUpdateEmail(meeting: Meeting, userName: string, organizerName: string, date: string, time: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
        .header { background: #3b82f6; color: white; padding: 24px; }
        .content { padding: 24px; }
        .meeting-info { background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0; }
        .btn { display: inline-block; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; background: #6366f1; color: white; }
        .footer { padding: 16px 24px; background: #f8fafc; color: #64748b; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 24px;">Reuniao Atualizada</h1>
        </div>
        <div class="content">
          <p>Ola ${userName},</p>
          <p><strong>${organizerName}</strong> atualizou a reuniao:</p>

          <div class="meeting-info">
            <h2 style="margin: 0 0 8px 0;">${meeting.title}</h2>
            ${meeting.description ? `<p style="color: #64748b; margin: 0 0 12px 0;">${meeting.description}</p>` : ""}
            <p style="margin: 0;"><strong>Nova Data:</strong> ${date}</p>
            <p style="margin: 0;"><strong>Novo Horario:</strong> ${time}</p>
            <p style="margin: 0;"><strong>Duracao:</strong> ${meeting.duration_minutes} minutos</p>
          </div>

          <a href="${APP_URL}/calendar" class="btn">Ver Detalhes</a>
        </div>
        <div class="footer">
          <p>Este email foi enviado pelo SquadX Live.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function buildCancelEmail(meeting: Meeting, userName: string, organizerName: string, date: string, time: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
        .header { background: #ef4444; color: white; padding: 24px; }
        .content { padding: 24px; }
        .meeting-info { background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0; text-decoration: line-through; opacity: 0.7; }
        .footer { padding: 16px 24px; background: #f8fafc; color: #64748b; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 24px;">Reuniao Cancelada</h1>
        </div>
        <div class="content">
          <p>Ola ${userName},</p>
          <p><strong>${organizerName}</strong> cancelou a seguinte reuniao:</p>

          <div class="meeting-info">
            <h2 style="margin: 0 0 8px 0;">${meeting.title}</h2>
            <p style="margin: 0;"><strong>Data:</strong> ${date}</p>
            <p style="margin: 0;"><strong>Horario:</strong> ${time}</p>
          </div>

          <p>Este horario agora esta disponivel na sua agenda.</p>
        </div>
        <div class="footer">
          <p>Este email foi enviado pelo SquadX Live.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
