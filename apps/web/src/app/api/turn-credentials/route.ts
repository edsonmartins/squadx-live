import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { CORS_HEADERS } from '@/lib/cors';

// TURN server configuration from environment variables (server-side only)
const TURN_SERVER_URL = process.env.TURN_SERVER_URL;
const TURN_SERVER_SECRET = process.env.TURN_SERVER_SECRET; // Shared secret for TURN server
const TURN_CREDENTIAL_TTL = 3600; // 1 hour in seconds

interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
  ttl: number;
}

/**
 * Generate time-limited TURN credentials using TURN REST API (RFC 6156)
 * This is compatible with coturn and other TURN servers that support REST API
 *
 * The credential is generated as:
 * username = timestamp:uniqueId
 * password = HMAC-SHA1(username, sharedSecret)
 */
function generateTurnCredentials(uniqueId: string): TurnCredentials | null {
  if (!TURN_SERVER_URL || !TURN_SERVER_SECRET) {
    return null;
  }

  const timestamp = Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_TTL;
  const username = `${timestamp}:${uniqueId}`;

  // Generate HMAC-SHA1 credential
  const hmac = createHmac('sha1', TURN_SERVER_SECRET);
  hmac.update(username);
  const credential = hmac.digest('base64');

  // Parse TURN URL to also provide STUN
  const urls: string[] = [];

  if (TURN_SERVER_URL.startsWith('turn:')) {
    urls.push(TURN_SERVER_URL);
    // Also add STUN version
    urls.push(TURN_SERVER_URL.replace('turn:', 'stun:').replace(/:\d+$/, ':3478'));
  } else if (TURN_SERVER_URL.startsWith('turns:')) {
    urls.push(TURN_SERVER_URL);
  } else {
    urls.push(`turn:${TURN_SERVER_URL}`);
  }

  return {
    urls,
    username,
    credential,
    ttl: TURN_CREDENTIAL_TTL,
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // For authenticated users, use their ID
    // For guests, we still provide credentials but with a random ID
    const uniqueId = user?.id || `guest-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    if (authError && authError.message !== 'Auth session missing!') {
      console.error('Auth error:', authError);
    }

    const credentials = generateTurnCredentials(uniqueId);

    if (!credentials) {
      // If TURN is not configured, return empty array (will use STUN only)
      return NextResponse.json({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      }, {
        headers: CORS_HEADERS,
      });
    }

    return NextResponse.json({
      iceServers: [
        // Public STUN servers as fallback
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // TURN server with dynamic credentials
        {
          urls: credentials.urls,
          username: credentials.username,
          credential: credentials.credential,
        },
      ],
      ttl: credentials.ttl,
    }, {
      headers: {
        ...CORS_HEADERS,
        // Cache for slightly less than TTL to ensure fresh credentials
        'Cache-Control': `private, max-age=${Math.floor(credentials.ttl * 0.9)}`,
      },
    });
  } catch (error) {
    console.error('Error generating TURN credentials:', error);
    return NextResponse.json(
      { error: 'Failed to generate credentials' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
