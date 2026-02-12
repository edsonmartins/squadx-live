import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Simple password protection for beta access
// TODO: Remove this when ready for public launch
const GATE_PASSWORD = process.env.GATE_PASSWORD || 'SquadXTest!';
const GATE_COOKIE_NAME = 'squadx-gate-access';
const GATE_COOKIE_VALUE = 'authorized';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { password?: string };
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { success: false, error: 'Senha não fornecida' },
        { status: 400 }
      );
    }

    if (password !== GATE_PASSWORD) {
      return NextResponse.json(
        { success: false, error: 'Senha incorreta' },
        { status: 401 }
      );
    }

    // Set the access cookie
    const cookieStore = await cookies();
    cookieStore.set(GATE_COOKIE_NAME, GATE_COOKIE_VALUE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
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
