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

  // Check for team member authentication
  const isTeamMember = checkTeamMemberAuth(request);

  if (!isTeamMember) {
    // Return 401 Unauthorized
    return new NextResponse('Unauthorized - Team member access required', { status: 401 });
  }

  return NextResponse.next();
}

/**
 * Check if request is from a Vercel team member
 */
function checkTeamMemberAuth(request: NextRequest): boolean {
  // Option 1: Check Vercel authentication cookie (automatically set when logged into Vercel)
  const vercelAuth = request.cookies.get('_vercel_jwt');
  if (vercelAuth) {
    return true;
  }

  // Option 2: Check for Vercel preview deployment authentication
  const vercelPreviewAuth = request.cookies.get('_vercel_no_index');
  if (vercelPreviewAuth) {
    return true;
  }

  // Option 3: In development, allow all access
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  // Option 4: Check for admin access key in headers (optional override)
  const adminKey = request.headers.get('x-admin-key');
  if (adminKey && adminKey === process.env.ADMIN_ACCESS_KEY) {
    return true;
  }

  return false;
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
