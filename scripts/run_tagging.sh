#!/bin/bash
set -e

# Load environment variables
if [ -f .envrc ]; then
    source .envrc
elif [ -f .env.vercel ]; then
    source .env.vercel
else
    echo "Error: No .envrc or .env.vercel file found"
    exit 1
fi

# Add PostgreSQL to PATH if installed via Homebrew
if [ -d "/opt/homebrew/opt/postgresql@16/bin" ]; then
    export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
fi

# Map environment variables for the Python script
export SUPABASE_DB_HOST="${SUPABASE_URL}"
export SUPABASE_DB_NAME="${SUPABASE_DB:-postgres}"
export SUPABASE_DB_USER="${SUPABASE_USER:-postgres}"
export SUPABASE_DB_PASSWORD="${SUPABASE_PASSWORD}"
export SUPABASE_DB_PORT="${SUPABASE_PORT:-5432}"

echo "Running element section tagger..."
echo "Host: ${SUPABASE_DB_HOST}"
echo "Database: ${SUPABASE_DB_NAME}"
echo "User: ${SUPABASE_DB_USER}"
echo ""

# Run the Python script with any passed arguments
python scripts/tag_element_sections.py "$@"
