#!/bin/bash
# =============================================================================
# Supabase SQL Executor via Management API
# Usage:
#   ./scripts/supabase-sql.sh "SELECT * FROM materials LIMIT 5;"
#   ./scripts/supabase-sql.sh < migration.sql
#   echo "SELECT 1;" | ./scripts/supabase-sql.sh
#
# Required environment variables:
#   SUPABASE_PROJECT_ID   - Your Supabase project reference ID
#   SUPABASE_DB_PASSWORD  - Your database password
#
# Optional:
#   SUPABASE_ACCESS_TOKEN - Personal access token (for Management API)
# =============================================================================

set -euo pipefail

# --- Configuration ---
PROJECT_ID="${SUPABASE_PROJECT_ID:?Error: SUPABASE_PROJECT_ID is not set}"

# --- Read SQL ---
if [ $# -gt 0 ]; then
  SQL="$1"
elif [ ! -t 0 ]; then
  SQL=$(cat)
else
  echo "Usage: $0 \"SQL_QUERY\"" >&2
  echo "       $0 < file.sql" >&2
  echo "       echo \"SQL\" | $0" >&2
  exit 1
fi

if [ -z "$SQL" ]; then
  echo "Error: Empty SQL query" >&2
  exit 1
fi

# --- Execute via Management API (requires SUPABASE_ACCESS_TOKEN) ---
if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "Executing via Supabase Management API..."
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg sql "$SQL" '{query: $sql}')")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  else
    echo "Error (HTTP $HTTP_CODE):" >&2
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY" >&2
    exit 1
  fi
  exit 0
fi

# --- Fallback: Direct PostgreSQL connection (requires SUPABASE_DB_PASSWORD) ---
DB_PASSWORD="${SUPABASE_DB_PASSWORD:?Error: Either SUPABASE_ACCESS_TOKEN or SUPABASE_DB_PASSWORD must be set}"
DB_HOST="db.${PROJECT_ID}.supabase.co"
DB_URL="postgresql://postgres:${DB_PASSWORD}@${DB_HOST}:5432/postgres"

if command -v psql &>/dev/null; then
  echo "Executing via psql..."
  echo "$SQL" | psql "$DB_URL"
else
  echo "Error: Neither SUPABASE_ACCESS_TOKEN nor psql is available." >&2
  echo "Set SUPABASE_ACCESS_TOKEN for API access, or install psql for direct DB access." >&2
  exit 1
fi
