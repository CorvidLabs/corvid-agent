#!/usr/bin/env bash
# Detect potential SQL injection via string interpolation in database queries.
# Run: bash scripts/check-sql-injection.sh
# Exit code 0 = clean, 1 = potential issues found.
#
# Scans for template-literal interpolation (${...}) inside strings that contain
# SQL keywords, excluding known-safe patterns (dynamic field lists built from
# hardcoded arrays, PRAGMA with validated identifiers, etc.).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXIT=0

# Patterns that indicate SQL keywords combined with interpolation.
# We look for backtick template strings containing both a SQL keyword and ${…}.
HITS=$(grep -rn --include='*.ts' -E '(db\.(query|exec|run|prepare)|\.query)\s*\(\s*`[^`]*(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|PRAGMA)[^`]*\$\{' "$ROOT/server" || true)

if [ -z "$HITS" ]; then
    echo "No SQL string interpolation found."
    exit 0
fi

# Filter out known-safe patterns:
#   - Dynamic field lists like ${fields.join(', ')} — fields are built from hardcoded arrays
#   - Dynamic WHERE clause assembly like ${where} or ${conditions.join(...)}
#   - Dynamic placeholder generation like ${placeholders}
#   - PRAGMA with validated identifiers (preceded by SAFE_SQL_IDENTIFIER check)
# Also exclude PRAGMA table_info — doesn't support placeholders; validated by SAFE_SQL_IDENTIFIER.
FILTERED=$(echo "$HITS" | grep -v -E '\$\{(fields|sets|where|conditions|placeholders|orderClause|limitClause|offsetClause)\b' | grep -v 'PRAGMA table_info' || true)

if [ -z "$FILTERED" ]; then
    echo "No SQL string interpolation found (safe dynamic patterns excluded)."
    exit 0
fi

echo "Potential SQL string interpolation detected:"
echo "$FILTERED"
echo ""
echo "If this is intentional and safe, add identifier validation (allowlist regex)"
echo "before the interpolation point, or refactor to use parameterized queries (?)."
EXIT=1

exit $EXIT
