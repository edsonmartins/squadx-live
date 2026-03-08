import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';

// Simple password protection for beta access
// TODO: Remove this when ready for public launch
const GATE_PASSWORD = process.env.GATE_PASSWORD;
const GATE_COOKIE_NAME = 'squadx-gate-access';
const GATE_COOKIE_VALUE = 'authorized';

// In-memory rate limiting for gate attempts
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 5; // 5 attempts per window
const RATE_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

// Timing-safe string comparison to prevent timing attacks
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against itself to maintain constant time
    timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(request: Request) {
  // Check if gate password is configured
  if (!GATE_PASSWORD) {
    console.error('GATE_PASSWORD environment variable is not configured');
    return NextResponse.json(
      { success: false, error: 'Gate not configured' },
      { status: 500 }
    );
  }

  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') ||
             'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { success: false, error: 'Muitas tentativas. Aguarde um minuto.' },
      { status: 429 }
    );
  }

  try {
    const body = await request.json() as { password?: string };
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { success: false, error: 'Senha não fornecida' },
        { status: 400 }
      );
    }

    if (!safeCompare(password, GATE_PASSWORD)) {
      return NextResponse.json(
        { success: false, error: 'Senha incorreta' },
        { status: 401 }
      );
    }

    // Set the access cookie with secure flags
    const cookieStore = await cookies();
    cookieStore.set(GATE_COOKIE_NAME, GATE_COOKIE_VALUE, {
      httpOnly: true,
      secure: true, // Always secure
      sameSite: 'strict', // Stricter than 'lax'
      maxAge: 60 * 60 * 24 * 7, // 7 days (reduced from 30)
      path: '/',
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Erro interno' },
      { status: 500 }
    );
  }
}
