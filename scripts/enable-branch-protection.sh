#!/usr/bin/env bash
# Enable branch protection on repos (issues #428, #463).
# Uses the GitHub REST API via `gh api`.
#
# Protection rules applied:
#   - Require at least 1 PR review before merging
#   - Dismiss stale reviews on new pushes
#   - Block force pushes
#   - Block branch deletion
#   - Require status checks to pass (where CI exists)
#   - For corvid-agent: require CI build status check
#
# Last applied: 2026-04-22 (updated with correct CI job names)
#
# Usage: ./scripts/enable-branch-protection.sh [--dry-run] [--verify-only]

set -euo pipefail

DRY_RUN=false
VERIFY_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --verify-only) VERIFY_ONLY=true ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

# Primary repo — requires CI status checks (#428)
PRIMARY_REPO="CorvidLabs/corvid-agent"

# Repos identified in issue #463 security audit
REPOS=(
  "$PRIMARY_REPO"
  "CorvidLabs/rs-algochat"
  "CorvidLabs/kt-algochat"
  "CorvidLabs/go-algochat"
  "CorvidLabs/go-algod-monitor"
  "CorvidLabs/go-collections"
  "corvid-agent/corvid-agent-chat"
)

BRANCH="main"
FAILURES=0

build_payload() {
  local repo="$1"

  if [ "$repo" = "$PRIMARY_REPO" ]; then
    # Stricter rules for the main corvid-agent repo (#428):
    # - Required CI status checks (build job must pass, TypeScript check, spec validation)
    # - Require branches to be up to date before merging (strict: true)
    # - Enforce rules for admins too (no bypass)
    # - Require at least 1 approval on PRs
    cat <<'ENDJSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Build & Test (ubuntu)"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
ENDJSON
  else
    # Standard rules for secondary repos:
    # - No required status checks
    # - Require at least 1 approval on PRs
    # - Block force pushes and deletions
    cat <<'ENDJSON'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
ENDJSON
  fi
}

apply_protection() {
  local repo="$1"

  echo "--- Configuring branch protection: $repo ($BRANCH) ---"

  # Build the protection payload
  local payload
  payload=$(build_payload "$repo")

  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] Would apply to $repo/$BRANCH:"
    echo "$payload" | jq .
    return 0
  fi

  # Check if we have admin access (required for branch protection)
  local has_admin
  has_admin=$(gh api "repos/$repo" --jq '.permissions.admin' 2>/dev/null || echo "false")
  if [ "$has_admin" != "true" ]; then
    echo "SKIP: No admin access on $repo (requires org admin to grant)"
    FAILURES=$((FAILURES + 1))
    return 1
  fi

  local error_output
  if ! error_output=$(gh api "repos/$repo/branches/$BRANCH/protection" \
    --method PUT \
    --input - <<< "$payload" 2>&1); then
    echo "ERROR: Failed to set branch protection on $repo"
    echo "  $error_output"
    FAILURES=$((FAILURES + 1))
    return 1
  fi

  echo "OK: Branch protection applied to $repo/$BRANCH"
}

verify_protection() {
  local repo="$1"

  echo "--- Verifying: $repo ($BRANCH) ---"

  local result
  if ! result=$(gh api "repos/$repo/branches/$BRANCH/protection" 2>&1); then
    echo "FAIL: No branch protection on $repo/$BRANCH"
    FAILURES=$((FAILURES + 1))
    return 1
  fi

  local pr_reviews force_push deletions status_checks enforce_admins
  pr_reviews=$(echo "$result" | jq -r '.required_pull_request_reviews.required_approving_review_count // "none"')
  force_push=$(echo "$result" | jq -r '.allow_force_pushes.enabled // false')
  deletions=$(echo "$result" | jq -r '.allow_deletions.enabled // false')
  status_checks=$(echo "$result" | jq -r '.required_status_checks.contexts // [] | length')
  enforce_admins=$(echo "$result" | jq -r '.enforce_admins.enabled // false')

  echo "  PR reviews required:  $pr_reviews"
  echo "  Force push allowed:   $force_push"
  echo "  Deletions allowed:    $deletions"
  echo "  Status check count:   $status_checks"
  echo "  Enforce admins:       $enforce_admins"

  if [ "$pr_reviews" = "none" ] || [ "$pr_reviews" = "0" ]; then
    echo "  WARN: PR reviews not required"
    FAILURES=$((FAILURES + 1))
  fi
  if [ "$force_push" = "true" ]; then
    echo "  WARN: Force push is still allowed"
    FAILURES=$((FAILURES + 1))
  fi
  if [ "$deletions" = "true" ]; then
    echo "  WARN: Branch deletion is still allowed"
    FAILURES=$((FAILURES + 1))
  fi
  if [ "$repo" = "$PRIMARY_REPO" ]; then
    if [ "$status_checks" = "0" ]; then
      echo "  WARN: No required status checks on primary repo"
      FAILURES=$((FAILURES + 1))
    fi
    if [ "$enforce_admins" != "true" ]; then
      echo "  WARN: Admin enforcement not enabled on primary repo"
      FAILURES=$((FAILURES + 1))
    fi
  fi

  echo "  OK"
}

echo "=== Branch Protection Script ==="
echo "Repos: ${#REPOS[@]}"
echo "Branch: $BRANCH"
echo ""

if [ "$VERIFY_ONLY" = false ]; then
  echo "== Applying protection =="
  for repo in "${REPOS[@]}"; do
    apply_protection "$repo" || true
  done
  echo ""
fi

echo "== Verifying protection =="
for repo in "${REPOS[@]}"; do
  verify_protection "$repo" || true
done

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "RESULT: $FAILURES issue(s) found"
  exit 1
else
  echo "RESULT: All ${#REPOS[@]} repos protected and verified"
fi
