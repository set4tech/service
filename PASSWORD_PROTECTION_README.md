# Password Protection Feature

This application implements a dual authentication system:
1. **Customer Report Access**: Simple password protection for public-facing project reports
2. **Team Member Access**: Environment-based authentication for internal application pages

## Architecture Overview

### Customer Report Protection

Customer reports (`/projects/[id]/report`) are protected by a project-specific password that can be publicly shared with customers.

**Flow:**
1. Customer visits `/projects/[id]/report`
2. If not authenticated → redirect to `/projects/[id]/report/login`
3. Customer enters password → session created → redirect to report
4. Session persists for 7 days

**Implementation:**
- Password stored hashed in `projects.report_password` column (bcrypt)
- Session managed with `iron-session` (encrypted, httpOnly cookies)
- Password set during project creation (optional field)

### Team Member Protection

All other routes (projects list, assessments, admin pages) require team member authentication via middleware.

**Flow:**
1. User visits any internal page (e.g., `/projects`, `/assessments/[id]`)
2. Middleware checks authentication
3. If not authorized → 401 Unauthorized
4. If authorized → proceed to page

**Authentication Methods (in order of precedence):**
1. **Admin Key Header**: Send `x-admin-key` header matching `ADMIN_ACCESS_KEY` env var
2. **Development Mode**: Automatically allowed in development (`NODE_ENV=development`)
3. **Vercel Team Member**: Set `VERCEL_TEAM_MEMBER=true` in Vercel environment variables

## Setup Instructions

### 1. Database Migration

Run the migration to add the `report_password` column:

```bash
# Apply migration
PGSSLMODE=require psql "postgresql://postgres.YOUR_PROJECT:PASSWORD@aws-1-us-east-1.pooler.supabase.com:6543/postgres" -f supabase/migrations/20251009_add_report_password.sql
```

Or manually:

```sql
ALTER TABLE projects ADD COLUMN report_password TEXT;
COMMENT ON COLUMN projects.report_password IS 'Bcrypt-hashed password for customer report access';
```

### 2. Environment Variables

Add these required environment variables:

```bash
# Session Secret (REQUIRED - generate a random 32+ character string)
SESSION_SECRET=your_complex_password_at_least_32_characters_long_for_security

# Team Member Authentication (choose one or more methods)

# Option 1: Vercel Team Member (set per team member in Vercel dashboard)
VERCEL_TEAM_MEMBER=true

# Option 2: Admin Access Key (shared secret for team members)
ADMIN_ACCESS_KEY=your_secret_admin_key
```

**Generate a secure session secret:**

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Using OpenSSL
openssl rand -base64 32
```

### 3. Vercel Deployment Setup

For team member authentication in production:

#### Option A: Environment Variables per Team Member

1. Go to Vercel Dashboard → Project Settings → Environment Variables
2. Add `VERCEL_TEAM_MEMBER=true` for production
3. Each team member should have this set in their deployment environment

#### Option B: Shared Admin Key

1. Set `ADMIN_ACCESS_KEY=your_secret_key` in Vercel environment variables
2. Team members include this in requests via `x-admin-key` header
3. Useful for API clients, scripts, or browser extensions

## Usage

### Creating a Password-Protected Project

1. Navigate to "Create New Project" (`/projects/new`)
2. In Step 1 (Project Information), fill in the "Customer Report Password" field
3. Complete the rest of the project creation flow
4. Password is automatically hashed before storage

### Accessing a Customer Report

**Without Password:**
1. Visit `/projects/[id]/report`
2. Redirected to login page
3. Enter password
4. Access granted for 7 days

**Share with Customers:**
- URL: `https://your-app.com/projects/[id]/report`
- Password: `[the password you set]`

### Accessing Internal Pages

**Development:**
- Automatically allowed (no authentication needed)

**Production (as Team Member):**

With environment variable:
- Just visit the page (e.g., `/projects`)
- Middleware automatically checks `VERCEL_TEAM_MEMBER` env var

With admin key header:
- Add header to requests: `x-admin-key: your_secret_key`
- Useful for API clients or browser tools

## Security Considerations

### Password Hashing
- Uses bcrypt with cost factor 10
- Passwords never stored in plain text
- One-way hash (cannot be reversed)

### Session Security
- Encrypted with AES-256 (via iron-session)
- HttpOnly cookies (not accessible via JavaScript)
- SameSite=Strict (CSRF protection)
- 7-day expiration
- Secure flag in production (HTTPS only)

### Middleware Protection
- Runs on all routes except customer reports and public assets
- Returns 401 Unauthorized for unauthenticated access
- Multiple authentication methods (defense in depth)

## API Routes Protected

**Public (no authentication):**
- `/projects/[id]/report` - Customer report page
- `/projects/[id]/report/login` - Login page
- `/api/pdf/presign` - PDF download URLs
- `/api/screenshots/presign-view` - Screenshot URLs
- Static assets (`/_next`, `/favicon`, `/set4-logo`)

**Protected (team member authentication):**
- `/` - Projects list
- `/projects/new` - Create project
- `/assessments/[id]` - Assessment detail
- All other API routes

## Troubleshooting

### "Unauthorized - Team member access required"

**In Development:**
- Ensure `NODE_ENV=development` is set
- Restart dev server

**In Production:**
- Check `VERCEL_TEAM_MEMBER=true` is set in Vercel environment variables
- Or add `x-admin-key` header with correct value
- Verify `ADMIN_ACCESS_KEY` matches in environment

### "Incorrect password" on Customer Report

- Password is case-sensitive
- Ensure no extra spaces
- Check password was set during project creation
- Verify bcrypt hashing is working (check `report_password` column is not plain text)

### Session expires immediately

- Check `SESSION_SECRET` is set and at least 32 characters
- Verify cookies are enabled in browser
- In production, ensure site uses HTTPS (required for Secure cookies)

### "This project does not have a password set"

- Password is optional during project creation
- If not set, customer reports are inaccessible via password flow
- Update project to add password (requires database update or new API endpoint)

## File Structure

```
lib/
├── auth.ts                          # Password hashing, session management
middleware.ts                        # Team member authentication
app/
├── projects/
│   └── [id]/
│       └── report/
│           ├── page.tsx            # Protected report page
│           └── login/
│               └── page.tsx        # Password login form
├── api/
│   └── projects/
│       └── route.ts                # Hash password before insert
supabase/
└── migrations/
    └── 20251009_add_report_password.sql
```

## Development Notes

### Adding Password to Existing Projects

Currently, passwords can only be set during project creation. To add password protection to existing projects:

**Option 1: Direct Database Update**
```sql
UPDATE projects
SET report_password = '$2b$10$...' -- bcrypt hash
WHERE id = 'project-id';
```

**Option 2: Create API Endpoint**
Add `PATCH /api/projects/[id]` to allow updating `report_password` field.

### Custom Session Duration

Edit `lib/auth.ts`:

```typescript
const sessionOptions = {
  // ...
  cookieOptions: {
    maxAge: 60 * 60 * 24 * 30, // 30 days instead of 7
  },
};
```

### Adding More Authentication Methods

Edit `middleware.ts` to add custom logic in `checkTeamMemberAuth()`:

```typescript
function checkTeamMemberAuth(request: NextRequest): boolean {
  // Your custom auth logic
  const jwtToken = request.cookies.get('auth_token');
  // ... validate JWT
  return isValid;
}
```

## Testing

### Test Customer Report Flow

```bash
# 1. Create a project with password "testpass123"
# 2. Visit http://localhost:3000/projects/[id]/report
# 3. Should redirect to login
# 4. Enter "testpass123"
# 5. Should access report
# 6. Close browser, reopen within 7 days
# 7. Should still have access (session persists)
```

### Test Team Member Protection

```bash
# Development (should work)
NODE_ENV=development npm run dev
# Visit http://localhost:3000/projects

# Production simulation (should fail without auth)
NODE_ENV=production npm run build && npm start
# Visit http://localhost:3000/projects → 401 Unauthorized

# With admin key
curl -H "x-admin-key: your_key" http://localhost:3000/projects
```

## Future Enhancements

1. **Password Reset**: Add email-based password reset for customer reports
2. **Update Password**: API endpoint to change project password
3. **Audit Logs**: Track customer report access (who/when)
4. **SSO Integration**: Replace admin key with OAuth/SAML for team members
5. **Rate Limiting**: Prevent brute force password attacks
6. **Password Strength**: Validate password complexity during project creation
7. **Multi-Factor Auth**: Optional 2FA for customer reports
