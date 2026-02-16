#!/usr/bin/env bash
# setup-automation.sh — Bootstrap all corvid-agent automation subsystems
#
# Configures: mention polling, webhook registrations, schedules, workflows.
# Idempotent — safe to re-run. Skips resources that already exist.
#
# Usage:
#   bash deploy/setup-automation.sh              # uses localhost:3000
#   BASE_URL=https://agent.example.com bash deploy/setup-automation.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── Configuration ────────────────────────────────────────────────────────────

BASE_URL="${BASE_URL:-http://localhost:3000}"

# Load API_KEY from .env if not already set
if [[ -z "${API_KEY:-}" && -f "$PROJECT_DIR/.env" ]]; then
    API_KEY="$(grep -E '^API_KEY=' "$PROJECT_DIR/.env" | head -1 | cut -d= -f2-)"
fi

# Repos to monitor
REPOS=(
    "CorvidLabs/corvid-agent"
    "CorvidLabs/NFTRemix"
    "CorvidLabs/Mono"
)

MENTION_USERNAME="corvid-agent"

# Project mapping (populated dynamically below)
PROJECT_JSON=""

# ─── Helpers ──────────────────────────────────────────────────────────────────

auth_header() {
    if [[ -n "${API_KEY:-}" ]]; then
        echo "Authorization: Bearer $API_KEY"
    else
        echo "X-No-Auth: true"
    fi
}

api() {
    local method="$1" path="$2"
    shift 2
    curl -sf -X "$method" \
        -H "Content-Type: application/json" \
        -H "$(auth_header)" \
        "$BASE_URL$path" \
        "$@"
}

api_post() { api POST "$1" -d "$2"; }
api_get()  { api GET  "$1"; }
api_put()  { api PUT  "$1" -d "$2"; }

log() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
ok()  { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m!\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; }

# ─── Pre-flight checks ───────────────────────────────────────────────────────

log "Checking server health at $BASE_URL ..."
if ! health="$(api_get /api/health 2>/dev/null)"; then
    err "Server not reachable at $BASE_URL"
    err "Start the daemon first: bash deploy/daemon.sh install"
    exit 1
fi
ok "Server is healthy"

# ─── Resolve agent ID ────────────────────────────────────────────────────────

log "Looking up agents ..."
agents="$(api_get /api/agents)"
agent_count="$(echo "$agents" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0)"

if [[ "$agent_count" -eq 0 ]]; then
    err "No agents found. Create an agent first via the dashboard."
    exit 1
fi

# Use the first agent (or ALGOCHAT_DEFAULT_AGENT_ID if set)
default_id="${ALGOCHAT_DEFAULT_AGENT_ID:-}"
if [[ -z "$default_id" && -f "$PROJECT_DIR/.env" ]]; then
    default_id="$(grep -E '^ALGOCHAT_DEFAULT_AGENT_ID=' "$PROJECT_DIR/.env" | head -1 | cut -d= -f2-)"
fi

if [[ -n "$default_id" ]]; then
    AGENT_ID="$default_id"
else
    AGENT_ID="$(echo "$agents" | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["id"])' 2>/dev/null)"
fi

ok "Using agent: $AGENT_ID"

# ─── Resolve project IDs ─────────────────────────────────────────────────────

log "Looking up projects ..."
PROJECT_JSON="$(api_get /api/projects 2>/dev/null || echo '[]')"

# Helper: look up project ID by repo name
get_project_id() {
    local repo="$1"
    local repo_short="${repo##*/}"  # e.g. "CorvidLabs/corvid-agent" → "corvid-agent"
    echo "$PROJECT_JSON" | python3 -c "
import sys, json
projects = json.load(sys.stdin)
projects = projects if isinstance(projects, list) else projects.get('projects', [])
short = '${repo_short}'.lower()
matches = [p['id'] for p in projects if p.get('name','').lower() == short]
print(matches[0] if matches else '')
" 2>/dev/null
}

for repo in "${REPOS[@]}"; do
    pid="$(get_project_id "$repo")"
    if [[ -n "$pid" ]]; then
        ok "  $repo → project $pid"
    else
        warn "  No project found for $repo (webhook/polling will be skipped)"
    fi
done

# ─── Phase 2: Mention Polling ────────────────────────────────────────────────

log "Setting up mention polling ..."

existing_polls="$(api_get /api/mention-polling 2>/dev/null || echo '{"configs":[]}')"

for repo in "${REPOS[@]}"; do
    # Check if polling already exists for this repo+agent
    # Response format: { "configs": [...] }
    already="$(echo "$existing_polls" | python3 -c "
import sys, json
data = json.load(sys.stdin)
configs = data.get('configs', data) if isinstance(data, dict) else data
print(any(c['repo'] == '$repo' and c['agentId'] == '$AGENT_ID' for c in configs))
" 2>/dev/null || echo "False")"

    if [[ "$already" == "True" ]]; then
        ok "Mention polling already exists for $repo — skipping"
        continue
    fi

    project_id="$(get_project_id "$repo")"
    if [[ -z "$project_id" ]]; then
        warn "No project ID for $repo — skipping mention polling"
        continue
    fi

    body="$(cat <<EOF
{
    "agentId": "$AGENT_ID",
    "repo": "$repo",
    "mentionUsername": "$MENTION_USERNAME",
    "intervalSeconds": 60,
    "projectId": "$project_id"
}
EOF
)"
    if result="$(api_post /api/mention-polling "$body" 2>/dev/null)"; then
        poll_id="$(echo "$result" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null)"
        ok "Created mention polling for $repo (id: $poll_id)"
    else
        warn "Failed to create mention polling for $repo"
    fi
done

# ─── Phase 3: Webhook Registrations ──────────────────────────────────────────

log "Setting up webhook registrations ..."

existing_hooks="$(api_get /api/webhooks 2>/dev/null || echo '{"registrations":[]}')"

for repo in "${REPOS[@]}"; do
    # Response format: { "registrations": [...] }
    already="$(echo "$existing_hooks" | python3 -c "
import sys, json
data = json.load(sys.stdin)
regs = data.get('registrations', data) if isinstance(data, dict) else data
print(any(r['repo'] == '$repo' and r['agentId'] == '$AGENT_ID' for r in regs))
" 2>/dev/null || echo "False")"

    if [[ "$already" == "True" ]]; then
        ok "Webhook registration already exists for $repo — skipping"
        continue
    fi

    project_id="$(get_project_id "$repo")"
    if [[ -z "$project_id" ]]; then
        warn "No project ID for $repo — skipping webhook registration"
        continue
    fi

    body="$(cat <<EOF
{
    "agentId": "$AGENT_ID",
    "repo": "$repo",
    "events": ["issue_comment", "issues", "pull_request_review_comment"],
    "mentionUsername": "$MENTION_USERNAME",
    "projectId": "$project_id"
}
EOF
)"
    if result="$(api_post /api/webhooks "$body" 2>/dev/null)"; then
        hook_id="$(echo "$result" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null)"
        ok "Created webhook registration for $repo (id: $hook_id)"
    else
        warn "Failed to create webhook registration for $repo"
    fi
done

# ─── Phase 4: Schedules ──────────────────────────────────────────────────────

log "Setting up schedules ..."

existing_schedules="$(api_get /api/schedules 2>/dev/null || echo '[]')"

create_schedule() {
    local name="$1" body="$2"

    already="$(echo "$existing_schedules" | python3 -c "
import sys, json
scheds = json.load(sys.stdin)
print(any(s['name'] == '$name' and s['agentId'] == '$AGENT_ID' for s in scheds))
" 2>/dev/null || echo "False")"

    if [[ "$already" == "True" ]]; then
        ok "Schedule '$name' already exists — skipping"
        return 0
    fi

    if result="$(api_post /api/schedules "$body" 2>/dev/null)"; then
        sched_id="$(echo "$result" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null)"
        ok "Created schedule '$name' (id: $sched_id)"

        # Activate the schedule
        if api_put "/api/schedules/$sched_id" '{"status":"active"}' >/dev/null 2>&1; then
            ok "Activated schedule '$name'"
        else
            warn "Failed to activate schedule '$name'"
        fi
    else
        warn "Failed to create schedule '$name'"
    fi
}

# 4a. Daily PR Review (weekdays at 9am)
create_schedule "Daily PR Review" "$(cat <<EOF
{
    "agentId": "$AGENT_ID",
    "name": "Daily PR Review",
    "description": "Review open PRs across key repos every weekday morning",
    "cronExpression": "0 9 * * 1-5",
    "actions": [{
        "type": "review_prs",
        "repos": ["CorvidLabs/corvid-agent", "CorvidLabs/NFTRemix", "CorvidLabs/Mono"],
        "maxPrs": 10
    }],
    "approvalPolicy": "auto"
}
EOF
)"

# 4b. Weekly Self-Improvement (Monday at 10am)
create_schedule "Weekly Codebase Improvement" "$(cat <<EOF
{
    "agentId": "$AGENT_ID",
    "name": "Weekly Codebase Improvement",
    "description": "Audit the corvid-agent codebase for bugs, test coverage gaps, and performance issues. Create targeted fixes.",
    "cronExpression": "0 10 * * 1",
    "actions": [{
        "type": "work_task",
        "description": "Audit the corvid-agent codebase for bugs, test coverage gaps, and performance issues. Create targeted fixes.",
        "autoCreatePr": true
    }],
    "approvalPolicy": "owner_approve"
}
EOF
)"

# 4c. PR Monitoring (every 6 hours)
create_schedule "Monitor Open PRs" "$(cat <<EOF
{
    "agentId": "$AGENT_ID",
    "name": "Monitor Open PRs",
    "description": "Check for new and updated PRs across all repos every 6 hours",
    "cronExpression": "0 */6 * * *",
    "actions": [{
        "type": "review_prs",
        "repos": ["CorvidLabs/corvid-agent", "CorvidLabs/NFTRemix", "CorvidLabs/Mono"],
        "maxPrs": 20
    }],
    "approvalPolicy": "auto"
}
EOF
)"

# ─── Phase 5: Workflows ──────────────────────────────────────────────────────

log "Setting up workflows ..."

existing_workflows="$(api_get /api/workflows 2>/dev/null || echo '[]')"

WORKFLOW_NAME="PR Review & Fix Pipeline"

already="$(echo "$existing_workflows" | python3 -c "
import sys, json
wfs = json.load(sys.stdin)
print(any(w['name'] == '$WORKFLOW_NAME' and w['agentId'] == '$AGENT_ID' for w in wfs))
" 2>/dev/null || echo "False")"

if [[ "$already" == "True" ]]; then
    ok "Workflow '$WORKFLOW_NAME' already exists — skipping"
else
    body="$(cat <<'WFEOF'
{
    "agentId": "__AGENT_ID__",
    "name": "PR Review & Fix Pipeline",
    "description": "Reviews the latest open PR and auto-fixes identified issues",
    "nodes": [
        {
            "id": "start-1",
            "type": "start",
            "label": "Start",
            "config": {}
        },
        {
            "id": "review-1",
            "type": "agent_session",
            "label": "Review PR",
            "config": {
                "prompt": "Review the latest open PR for code quality, bugs, and test coverage. List any issues found.",
                "maxTurns": 20
            }
        },
        {
            "id": "check-1",
            "type": "condition",
            "label": "Issues Found?",
            "config": {
                "expression": "prev.output.includes('fix') || prev.output.includes('issue') || prev.output.includes('bug')"
            }
        },
        {
            "id": "fix-1",
            "type": "work_task",
            "label": "Auto-Fix",
            "config": {
                "description": "Fix the issues identified in the PR review"
            }
        },
        {
            "id": "end-1",
            "type": "end",
            "label": "End",
            "config": {}
        }
    ],
    "edges": [
        { "id": "e1", "sourceNodeId": "start-1", "targetNodeId": "review-1" },
        { "id": "e2", "sourceNodeId": "review-1", "targetNodeId": "check-1" },
        { "id": "e3", "sourceNodeId": "check-1", "targetNodeId": "fix-1", "condition": "true", "label": "Yes" },
        { "id": "e4", "sourceNodeId": "check-1", "targetNodeId": "end-1", "condition": "false", "label": "No" },
        { "id": "e5", "sourceNodeId": "fix-1", "targetNodeId": "end-1" }
    ],
    "maxConcurrency": 1
}
WFEOF
)"
    # Substitute agent ID
    body="${body//__AGENT_ID__/$AGENT_ID}"

    if result="$(api_post /api/workflows "$body" 2>/dev/null)"; then
        wf_id="$(echo "$result" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])' 2>/dev/null)"
        ok "Created workflow '$WORKFLOW_NAME' (id: $wf_id)"
    else
        warn "Failed to create workflow '$WORKFLOW_NAME'"
    fi
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
log "Setup complete! Verifying ..."
echo ""

# Mention polling stats
log "Mention polling:"
if stats="$(api_get /api/mention-polling/stats 2>/dev/null)"; then
    echo "$stats" | python3 -c "
import sys, json
s = json.load(sys.stdin)
print(f'  Active configs: {s.get(\"activeConfigs\", s.get(\"active\", \"?\"))}')
print(f'  Running:        {s.get(\"isRunning\", s.get(\"running\", \"?\"))}')
print(f'  Total triggers: {s.get(\"totalTriggers\", \"?\")}')
" 2>/dev/null || echo "  (stats available at $BASE_URL/api/mention-polling/stats)"
fi

# Schedules
log "Schedules:"
if scheds="$(api_get /api/schedules 2>/dev/null)"; then
    echo "$scheds" | python3 -c "
import sys, json
for s in json.load(sys.stdin):
    status = s.get('status', '?')
    name = s.get('name', '?')
    cron = s.get('cronExpression', s.get('intervalMs', '?'))
    print(f'  [{status:>6}] {name} ({cron})')
" 2>/dev/null
fi

# Workflows
log "Workflows:"
if wfs="$(api_get /api/workflows 2>/dev/null)"; then
    echo "$wfs" | python3 -c "
import sys, json
for w in json.load(sys.stdin):
    status = w.get('status', '?')
    name = w.get('name', '?')
    nodes = len(w.get('nodes', []))
    print(f'  [{status:>8}] {name} ({nodes} nodes)')
" 2>/dev/null
fi

echo ""
ok "All automation subsystems configured."
echo ""
echo "Next steps:"
echo "  1. Verify daemon:     bash deploy/daemon.sh status"
echo "  2. Check health:      curl $BASE_URL/api/health"
echo "  3. View logs:         bash deploy/daemon.sh logs"
echo "  4. GitHub webhooks:   Configure at https://github.com/<repo>/settings/hooks"
echo "     Webhook URL:       <your-public-url>/webhooks/github"
echo "     Secret:            (see GITHUB_WEBHOOK_SECRET in .env)"
echo ""
