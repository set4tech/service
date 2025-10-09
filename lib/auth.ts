import bcrypt from 'bcrypt';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';

const SALT_ROUNDS = 10;

/**
 * Hash a plain text password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a plain text password against a hashed password
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Session data structure for customer report access
 */
export interface ReportSessionData {
  projectId?: string;
  authenticated?: boolean;
  expiresAt?: number;
}

/**
 * Session options for iron-session
 * Uses Supabase service role key as the encryption password (already 32+ chars)
 */
const sessionOptions = {
  password: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long_for_security',
  cookieName: 'report_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

/**
 * Get the current session for customer report access
 */
export async function getReportSession() {
  const cookieStore = await cookies();
  return getIronSession<ReportSessionData>(cookieStore, sessionOptions);
}

/**
 * Check if user is authenticated for a specific project report
 */
export async function isAuthenticatedForReport(projectId: string): Promise<boolean> {
  const session = await getReportSession();

  // Check if session exists, matches project, and hasn't expired
  if (!session.authenticated || session.projectId !== projectId) {
    return false;
  }

  // Check expiration (7 days from creation)
  if (session.expiresAt && Date.now() > session.expiresAt) {
    // Clear expired session
    session.destroy();
    return false;
  }

  return true;
}

/**
 * Create a new authenticated session for a project report
 */
export async function createReportSession(projectId: string): Promise<void> {
  const session = await getReportSession();
  session.projectId = projectId;
  session.authenticated = true;
  session.expiresAt = Date.now() + (60 * 60 * 24 * 7 * 1000); // 7 days from now
  await session.save();
}

/**
 * Destroy the current report session
 */
export async function destroyReportSession(): Promise<void> {
  const session = await getReportSession();
  session.destroy();
}

/**
 * Check if user is a Vercel team member (for internal pages)
 * This is a simple implementation - you can enhance with actual Vercel auth
 */
export function isTeamMember(request: Request): boolean {
  // Option 1: Check for admin access key in headers
  const adminKey = request.headers.get('x-admin-key');
  if (adminKey && adminKey === process.env.ADMIN_ACCESS_KEY) {
    return true;
  }

  // Option 2: In development, allow all access
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  // Option 3: Check Vercel team membership via environment variable
  // This would be set in Vercel deployment settings per team member
  const isVercelTeam = process.env.VERCEL_TEAM_MEMBER === 'true';
  return isVercelTeam;
}
