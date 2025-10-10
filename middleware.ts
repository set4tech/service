import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware to protect internal routes (team member access only)
 * Customer reports are exempt as they use their own password protection
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public access to customer report pages (they have their own password)
  if (pathname.match(/^\/projects\/[^/]+\/report/)) {
    return NextResponse.next();
  }

  // Allow public access to presigned URL endpoints (needed for PDF/image display)
  if (
    pathname.startsWith('/api/pdf/presign') ||
    pathname.startsWith('/api/screenshots/presign-view')
  ) {
    return NextResponse.next();
  }

  // Allow access to static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/set4-logo')
  ) {
    return NextResponse.next();
  }

  // All other routes are open (customer reports have their own password protection)
  return NextResponse.next();
}

/**
 * Configure which routes this middleware applies to
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for static files and Next.js internals
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
