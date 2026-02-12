import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { updateSession } from '@/lib/supabase/middleware';
import { CORS_HEADERS } from '@/lib/cors';
import { routing } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

// Gate protection settings
// TODO: Remove this when ready for public launch
const GATE_ENABLED = process.env.GATE_ENABLED !== 'false'; // Enabled by default
const GATE_COOKIE_NAME = 'squadx-gate-access';
const GATE_COOKIE_VALUE = 'authorized';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip i18n for API routes and static files
  const isApiRoute = pathname.startsWith('/api/');
  const isStaticFile = pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|js|css|woff|woff2|ttf|eot)$/);
  const isNextInternal = pathname.startsWith('/_next/');

  // Handle CORS preflight for API routes (desktop app uses file:// origin)
  if (isApiRoute && request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  // For API routes, skip i18n and just handle session + CORS
  if (isApiRoute) {
    const response = await updateSession(request);
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      response.headers.set(key, value);
    }
    return response;
  }

  // Skip middleware for static files and Next.js internals
  if (isStaticFile || isNextInternal) {
    return NextResponse.next();
  }

  // Gate protection check
  const isGatePage = pathname === '/gate' || pathname.startsWith('/gate/');

  // Skip i18n for gate page
  if (isGatePage) {
    return NextResponse.next();
  }

  if (GATE_ENABLED) {
    const gateCookie = request.cookies.get(GATE_COOKIE_NAME);
    const isAuthorized = gateCookie?.value === GATE_COOKIE_VALUE;

    if (!isAuthorized) {
      // Redirect to gate page
      const gateUrl = new URL('/gate', request.url);
      return NextResponse.redirect(gateUrl);
    }
  }

  // Run i18n middleware first
  const intlResponse = intlMiddleware(request);

  // If intl middleware redirected, return that response
  if (intlResponse.status !== 200) {
    return intlResponse;
  }

  // Run session middleware
  const sessionResponse = await updateSession(request);

  // Merge headers from both responses
  intlResponse.headers.forEach((value, key) => {
    sessionResponse.headers.set(key, value);
  });

  return sessionResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Static files with extensions
     */
    '/((?!_next/static|_next/image|favicon\\.ico|[^/]+\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|woff|woff2|ttf|eot|json|xml|txt|webmanifest)$).*)',
  ],
};
