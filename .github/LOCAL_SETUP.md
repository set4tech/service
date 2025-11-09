# Local Supabase Branching Setup

## Prerequisites

Before implementing the CI/CD pipeline, validate that Supabase branching works locally.

## Step 1: Install Supabase CLI

```bash
npm install supabase

# Verify installation
supabase --version
```

## Step 2: Login to Supabase

```bash
# Login with your Supabase account
supabase login

# This will open a browser window for authentication
```

## Step 3: Link to Production Project

```bash
# Link to your production Supabase project
supabase link --project-ref <YOUR_PROD_PROJECT_REF>

# Get your project ref from:
# Supabase Dashboard → Settings → General → Reference ID
```

## Step 4: Test Branch Creation

```bash
# Create a test branch
BRANCH_NAME="test-local-$(date +%s)"
supabase branches create $BRANCH_NAME

# Expected output:
# ✓ Created branch test-local-1699564800
# Branch URL: https://test-local-1699564800.supabase.co
```

## Step 5: List Branches

```bash
# Verify the branch was created
supabase branches list

# You should see your test branch in the list
```

## Step 6: Test Migration Application

```bash
# Get branch PostgreSQL connection string
BRANCH_DB_URL=$(supabase branches get $BRANCH_NAME --output json | jq -r '.POSTGRES_URL')

# Verify you got the connection string
echo $BRANCH_DB_URL
# Should output: postgresql://postgres.xxx:password@aws-1-us-east-1.pooler.supabase.com:6543/postgres?connect_timeout=10

# Apply migrations to the branch
supabase db push --db-url "$BRANCH_DB_URL"

# This should apply all migrations from supabase/migrations/
```

## Step 7: Get Branch Connection Details

```bash
# Get all branch info in JSON format
supabase branches get $BRANCH_NAME --output json

# Extract specific values:
BRANCH_URL=$(supabase branches get $BRANCH_NAME --output json | jq -r '.SUPABASE_URL')
BRANCH_ANON_KEY=$(supabase branches get $BRANCH_NAME --output json | jq -r '.SUPABASE_ANON_KEY')
BRANCH_SERVICE_KEY=$(supabase branches get $BRANCH_NAME --output json | jq -r '.SUPABASE_SERVICE_ROLE_KEY')
BRANCH_POSTGRES_URL=$(supabase branches get $BRANCH_NAME --output json | jq -r '.POSTGRES_URL')

echo "Supabase URL: $BRANCH_URL"
echo "Anon Key: ${BRANCH_ANON_KEY:0:20}..."
echo "Service Key: ${BRANCH_SERVICE_KEY:0:20}..."
echo "Postgres URL: ${BRANCH_POSTGRES_URL:0:50}..."
```

## Step 8: Cleanup

```bash
# Delete the test branch
supabase branches delete $BRANCH_NAME

# Or with force flag to skip confirmation
supabase branches delete $BRANCH_NAME --force
```

## Troubleshooting

### "Command not found: supabase"

- Install the CLI globally: `npm install -g supabase`
- Restart your terminal

### "Not logged in"

- Run `supabase login` and complete the browser authentication

### "Project not found"

- Verify your project ref is correct
- Check you have access to the project in the Supabase dashboard

### "Branching not available"

- Database branching requires Supabase Pro plan or higher
- Check your plan at: https://supabase.com/dashboard/org/[org-id]/billing

### "Failed to create branch"

- Check you have sufficient database resources
- Ensure no existing branch with the same name
- Verify your Supabase plan supports branching

### "Failed to parse connection string" or "invalid dsn"

- The `--db-url` flag requires a PostgreSQL connection string format
- Format: `postgresql://user:password@host:port/database`
- NOT an HTTPS URL like `https://project.supabase.co`
- You may need to get the connection string from Supabase dashboard
- Alternative: Use Supabase CLI with project linking instead of --db-url

## Requirements for CI/CD

Once local testing is successful, you'll need:

1. **Supabase Access Token**
   - Generate at: https://supabase.com/dashboard/account/tokens
   - Save this for GitHub Secrets

2. **Project Reference ID**
   - From: Supabase Dashboard → Settings → General
   - This is your production project ref

3. **Supabase Plan**
   - Pro plan or higher (for branching feature)
   - Check current plan and upgrade if needed

## Next Steps

After validating locally:

1. Mark local-test todo as complete
2. Add GitHub secrets (see step 2 in plan)
3. Proceed with workflow creation
