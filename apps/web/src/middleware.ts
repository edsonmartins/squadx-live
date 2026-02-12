import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { updateSession } from '@/lib/supabase/middleware';
import { CORS_HEADERS } from '@/lib/cors';
import { routing } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

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
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
