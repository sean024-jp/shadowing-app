#!/bin/bash
# =============================================================================
# Supabase Migration Runner
# Runs all SQL migration files in supabase/migrations/ in order.
#
# Usage:
#   ./scripts/supabase-migrate.sh           # Run all migrations
#   ./scripts/supabase-migrate.sh --dry-run # Show migrations without executing
#
# Required environment variables (same as supabase-sql.sh):
#   SUPABASE_PROJECT_ID
#   SUPABASE_ACCESS_TOKEN or SUPABASE_DB_PASSWORD
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS_DIR="$(cd "$SCRIPT_DIR/../supabase/migrations" && pwd)"
SQL_RUNNER="$SCRIPT_DIR/supabase-sql.sh"
DRY_RUN="${1:-}"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Error: Migrations directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

# Get sorted list of migration files
MIGRATIONS=$(find "$MIGRATIONS_DIR" -name '*.sql' -type f | sort)

if [ -z "$MIGRATIONS" ]; then
  echo "No migration files found in $MIGRATIONS_DIR"
  exit 0
fi

echo "=== Supabase Migration Runner ==="
echo "Migrations directory: $MIGRATIONS_DIR"
echo ""

TOTAL=0
SUCCESS=0
FAILED=0

for migration in $MIGRATIONS; do
  filename=$(basename "$migration")
  TOTAL=$((TOTAL + 1))

  if [ "$DRY_RUN" = "--dry-run" ]; then
    echo "[DRY RUN] $filename"
    continue
  fi

  echo "--- Running: $filename ---"
  if bash "$SQL_RUNNER" < "$migration"; then
    SUCCESS=$((SUCCESS + 1))
    echo "--- OK: $filename ---"
  else
    FAILED=$((FAILED + 1))
    echo "--- FAILED: $filename ---" >&2
    echo "Stopping migration. Fix the issue and re-run." >&2
    break
  fi
  echo ""
done

echo ""
echo "=== Summary ==="
echo "Total: $TOTAL | Success: $SUCCESS | Failed: $FAILED"

if [ $FAILED -gt 0 ]; then
  exit 1
fi
