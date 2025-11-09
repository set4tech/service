# GitHub Secrets Configuration

## Required Secrets for CI/CD Pipeline

Navigate to your GitHub repository:
**Settings → Secrets and variables → Actions → New repository secret**

Add the following secrets:

## Supabase Secrets

### SUPABASE_ACCESS_TOKEN

- **Source**: https://supabase.com/dashboard/account/tokens
- **How to get**:
  1. Go to Supabase dashboard
  2. Click on your profile → Account → Access Tokens
  3. Click "Generate new token"
  4. Name it "GitHub Actions CI/CD"
  5. Copy the token (you won't see it again!)
- **Value**: `sbp_xxx...`

### SUPABASE_PROD_PROJECT_REF

- **Source**: Supabase Dashboard → Settings → General → Reference ID
- **How to get**:
  1. Go to your production Supabase project
  2. Settings → General
  3. Copy the "Reference ID" (not the full URL)
- **Value**: `abcdefghijklmnop` (16-character string)

### SUPABASE_ANON_KEY

- **Source**: Supabase Dashboard → Settings → API → Project API keys
- **How to get**:
  1. Go to your production Supabase project
  2. Settings → API
  3. Copy "anon public" key
- **Value**: `eyJ...` (long JWT token)

### SUPABASE_SERVICE_KEY

- **Source**: Supabase Dashboard → Settings → API → Project API keys
- **How to get**:
  1. Go to your production Supabase project
  2. Settings → API
  3. Copy "service_role secret" key
  4. ⚠️ **NEVER commit this to code**
- **Value**: `eyJ...` (long JWT token)

## AWS Secrets

### AWS_REGION

- **Value**: `us-east-1` (or your S3 bucket region)

### AWS_ACCESS_KEY_ID

- **Source**: AWS IAM Console → Users → Security credentials
- **Value**: `AKIA...`

### AWS_SECRET_ACCESS_KEY

- **Source**: AWS IAM Console (shown once when creating access key)
- **Value**: Long secret key

### AWS_S3_BUCKET_NAME

- **Value**: Your S3 bucket name (e.g., `set4-data`)

## AI Provider Secrets

### OPENAI_API_KEY

- **Source**: https://platform.openai.com/api-keys
- **Value**: `sk-...`

### GOOGLE_API_KEY

- **Source**: https://aistudio.google.com/app/apikey
- **Value**: Your Gemini API key

### ANTHROPIC_API_KEY

- **Source**: https://console.anthropic.com/account/keys
- **Value**: `sk-ant-...`

## Optional: Vercel Deployment (if manually triggering deploys)

### VERCEL_TOKEN

- **Source**: Vercel → Settings → Tokens
- **Value**: Your Vercel token

### VERCEL_ORG_ID

- **Source**: Vercel → Settings → General
- **Value**: Your organization/team ID

### VERCEL_PROJECT_ID

- **Source**: Vercel project → Settings → General
- **Value**: Your project ID

## Verification Checklist

After adding all secrets:

- [ ] Navigate to Settings → Secrets → Actions
- [ ] Verify all secrets are listed (values are hidden)
- [ ] Count: Should have at least 11 required secrets
- [ ] No typos in secret names (must match workflow file exactly)

## Security Notes

1. **Never commit these values to code**
2. **Rotate tokens regularly** (every 90 days recommended)
3. **Use minimal permissions** (e.g., AWS IAM user with S3-only access)
4. **Enable MFA** on all service accounts
5. **Monitor usage** for unexpected activity

## Next Steps

After adding secrets:

1. Mark github-secrets todo as complete
2. Create the workflow file
3. Test with a PR to verify secrets work
