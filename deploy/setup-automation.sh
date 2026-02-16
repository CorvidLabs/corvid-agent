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
    API_KEY="$(grep -E '^API_KEY=' "$PROJECT_DIR/.env" | head -1 | cut -d= -f2- || true)"
fi

# Repos to monitor (core repo always included; add others via EXTRA_REPOS in .env)
REPOS=(
    "CorvidLabs/corvid-agent"
)

# Load additional repos from .env (comma-separated, e.g. EXTRA_REPOS=Org/Repo1,Org/Repo2)
if [[ -z "${EXTRA_REPOS:-}" && -f "$PROJECT_DIR/.env" ]]; then
    EXTRA_REPOS="$(grep -E '^EXTRA_REPOS=' "$PROJECT_DIR/.env" | head -1 | cut -d= -f2- || true)"
fi
if [[ -n "${EXTRA_REPOS:-}" ]]; then
    IFS=',' read -ra _extra <<< "$EXTRA_REPOS"
    for r in "${_extra[@]}"; do
        r="$(echo "$r" | xargs)"
        [[ -n "$r" ]] && REPOS+=("$r")
    done
fi

# Build dynamic repo references for schedule configs
REPOS_JSON="["; REPO_NAMES=""; OTHER_REPOS_JSON="["
for i in "${!REPOS[@]}"; do
    repo="${REPOS[$i]}"
    [[ $i -gt 0 ]] && REPOS_JSON+=", " && REPO_NAMES+=", "
    REPOS_JSON+="\"$repo\""
    REPO_NAMES+="${repo##*/}"
    if [[ "$repo" != "CorvidLabs/corvid-agent" ]]; then
        [[ "$OTHER_REPOS_JSON" != "[" ]] && OTHER_REPOS_JSON+=", "
        OTHER_REPOS_JSON+="\"$repo\""
    fi
done
REPOS_JSON+="]"; OTHER_REPOS_JSON+="]"

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
    default_id="$(grep -E '^ALGOCHAT_DEFAULT_AGENT_ID=' "$PROJECT_DIR/.env" | head -1 | cut -d= -f2- || true)"
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

# Phase 4a: Delete old redundant schedules
log "Cleaning up old schedules ..."

DELETE_SCHEDULES=(
    "Daily PR Review"
    "Weekly CorvidLabs PR Reviews"
    "Monitor Open PRs"
    "Daily Code Quality Review"
    "Daily Test Coverage Improvement"
    "Daily Agent Standup"
    "Weekly Open Source Scout"
    "Weekly AlgoChat Ecosystem Review"
    "6-Hourly Health Digest"
    "Hourly System Check"
    "Fork AlgoKit for Contributions"
    "Star AI Agent Ecosystem Repos"
    "Star Algorand Ecosystem Repos"
    "Weekly CorvidLabs Repo Health Check"
    "Weekly ts-algochat Work Task"
    "Weekly Codebase Improvement"
)

for sched_name in "${DELETE_SCHEDULES[@]}"; do
    sched_id="$(echo "$existing_schedules" | python3 -c "
import sys, json
scheds = json.load(sys.stdin)
matches = [s['id'] for s in scheds if s['name'] == '$sched_name']
print(matches[0] if matches else '')
" 2>/dev/null)"

    if [[ -z "$sched_id" ]]; then
        ok "Schedule '$sched_name' not found — already removed"
        continue
    fi

    if api DELETE "/api/schedules/$sched_id" >/dev/null 2>&1; then
        ok "Deleted schedule '$sched_name' (id: $sched_id)"
    else
        warn "Failed to delete schedule '$sched_name' (id: $sched_id)"
    fi
done

# Refresh schedule list after deletions
existing_schedules="$(api_get /api/schedules 2>/dev/null || echo '[]')"

# Phase 4b: Create new schedules
log "Creating new schedules ..."

create_schedule() {
    local name="$1" body="$2"

    # Substitute placeholders (used by single-quoted heredocs)
    body="${body//__AGENT_ID__/$AGENT_ID}"
    body="${body//__REPOS_JSON__/$REPOS_JSON}"
    body="${body//__REPO_NAMES__/$REPO_NAMES}"

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

# 1. Morning PR Review — weekdays at 9am
create_schedule "Morning PR Review" "$(cat <<EOF
{
    "agentId": "$AGENT_ID",
    "name": "Morning PR Review",
    "description": "Review open PRs across all CorvidLabs repos every weekday morning",
    "cronExpression": "0 9 * * 1-5",
    "actions": [{
        "type": "review_prs",
        "repos": $REPOS_JSON,
        "maxPrs": 10
    }],
    "approvalPolicy": "auto"
}
EOF
)"

# 2. PR Comment Response — Mon/Wed/Fri at 2pm
create_schedule "PR Comment Response" "$(cat <<'SEOF'
{
    "agentId": "__AGENT_ID__",
    "name": "PR Comment Response",
    "description": "Respond to review comments on corvid-agent's open PRs",
    "cronExpression": "0 14 * * 1,3,5",
    "actions": [{
        "type": "custom",
        "prompt": "Check corvid-agent's open PRs across CorvidLabs repos (__REPO_NAMES__) for new review comments or requested changes. For each repo, list open PRs with: gh pr list --author corvid-agent --state open --repo <repo> --json number,title,url. For PRs with unaddressed review comments (check with: gh pr view <number> --repo <repo> --json reviews,comments,reviewRequests), respond to questions or feedback using: gh pr comment <number> --repo <repo> --body '<response>'. For requested code changes, create work tasks via corvid_create_work_task to implement them. Save a summary of actions taken to memory via corvid_save_memory."
    }],
    "approvalPolicy": "auto"
}
SEOF
)"

# 3. Monday Planning & Issue Triage — Monday at 10am
create_schedule "Monday Planning & Issue Triage" "$(cat <<'SEOF'
{
    "agentId": "__AGENT_ID__",
    "name": "Monday Planning & Issue Triage",
    "description": "Weekly planning, issue triage, and status summary",
    "cronExpression": "0 10 * * 1",
    "actions": [{
        "type": "custom",
        "prompt": "Perform weekly planning and issue triage for CorvidLabs repos (__REPO_NAMES__). 1) Review open issues across repos: gh issue list --state open --repo <repo> --json number,title,labels,assignees. 2) For high-priority or assigned issues, create work tasks via corvid_create_work_task. 3) Review recently merged PRs: gh pr list --state merged --limit 10 --repo <repo> --json number,title,mergedAt. 4) Produce a weekly status summary covering completed work, in-progress items, and priorities for the week. Save the status report to memory via corvid_save_memory."
    }],
    "approvalPolicy": "auto"
}
SEOF
)"

# 4. Self-Improvement: corvid-agent — Tuesday at 10am
create_schedule "Self-Improvement: corvid-agent" "$(cat <<EOF
{
    "agentId": "$AGENT_ID",
    "name": "Self-Improvement: corvid-agent",
    "description": "Analyze corvid-agent for bugs, code quality improvements, and test coverage gaps",
    "cronExpression": "0 10 * * 2",
    "actions": [{
        "type": "github_suggest",
        "repos": ["CorvidLabs/corvid-agent"],
        "autoCreatePr": true,
        "description": "Analyze the corvid-agent codebase for bugs, code quality improvements, test coverage gaps, and performance optimizations. Suggest and implement targeted fixes."
    }],
    "approvalPolicy": "owner_approve"
}
EOF
)"

# 5. Self-Improvement: CorvidLabs Projects — Thursday at 10am
if [[ "$OTHER_REPOS_JSON" != "[]" ]]; then
create_schedule "Self-Improvement: CorvidLabs Projects" "$(cat <<EOF
{
    "agentId": "$AGENT_ID",
    "name": "Self-Improvement: CorvidLabs Projects",
    "description": "Analyze CorvidLabs project repos for improvements and create PRs",
    "cronExpression": "0 10 * * 4",
    "actions": [{
        "type": "github_suggest",
        "repos": $OTHER_REPOS_JSON,
        "autoCreatePr": true,
        "description": "Analyze CorvidLabs project repos for bugs, code quality improvements, test coverage gaps, and documentation issues. Suggest and implement targeted fixes."
    }],
    "approvalPolicy": "owner_approve"
}
EOF
)"
fi

# 6. Issue Discovery & Filing — Wednesday at 11am
create_schedule "Issue Discovery & Filing" "$(cat <<'SEOF'
{
    "agentId": "__AGENT_ID__",
    "name": "Issue Discovery & Filing",
    "description": "Audit repos for problems and file quality issues",
    "cronExpression": "0 11 * * 3",
    "actions": [{
        "type": "custom",
        "prompt": "Audit CorvidLabs repos (__REPO_NAMES__) for issues worth filing. Check for: 1) CI/workflow failures: gh run list --status failure --limit 5 --repo <repo>. 2) TODO/FIXME/HACK comments in source code. 3) Stale or missing documentation. Before filing, always check for duplicates: gh issue list --state open --repo <repo> --search '<keywords>'. File 1-3 quality issues using: gh issue create --repo <repo> --title '<title>' --body '<description with context and acceptance criteria>'. Focus on actionable, well-described issues that improve code quality."
    }],
    "approvalPolicy": "auto"
}
SEOF
)"

# 7. Ecosystem Discovery & Outreach — Wednesday at 12pm
create_schedule "Ecosystem Discovery & Outreach" "$(cat <<'SEOF'
{
    "agentId": "__AGENT_ID__",
    "name": "Ecosystem Discovery & Outreach",
    "description": "Discover and engage with Algorand and AI agent ecosystem repos",
    "cronExpression": "0 12 * * 3",
    "actions": [{
        "type": "custom",
        "prompt": "Search GitHub for interesting Algorand and AI agent ecosystem repos. 1) Search for repos using: gh search repos 'algorand AI' --sort stars --limit 10, also try queries like 'algorand agent', 'MCP server algorand', 'claude agent framework'. 2) Star 2-3 interesting or useful repos using corvid_github_star_repo. 3) Follow 2-3 notable developers using corvid_github_follow_user. 4) Save discoveries and notes to memory via corvid_save_memory for future reference and potential collaboration."
    }],
    "approvalPolicy": "auto"
}
SEOF
)"

# 8. Weekly Repo Health Check — Friday at 9am
create_schedule "Weekly Repo Health Check" "$(cat <<'SEOF'
{
    "agentId": "__AGENT_ID__",
    "name": "Weekly Repo Health Check",
    "description": "CI status, open PR/issue counts, stale PRs, and security alerts",
    "cronExpression": "0 9 * * 5",
    "actions": [{
        "type": "custom",
        "prompt": "Run a health check across CorvidLabs repos (__REPO_NAMES__). For each repo check: 1) CI status of recent runs: gh run list --limit 5 --repo <repo> --json status,conclusion,name,createdAt. 2) Open PR and issue counts: gh pr list --state open --repo <repo> --json number, gh issue list --state open --repo <repo> --json number. 3) Stale PRs open more than 7 days: gh pr list --state open --repo <repo> --json number,title,createdAt. 4) Security or dependabot alerts if accessible. Compile a health report and save to memory via corvid_save_memory."
    }],
    "approvalPolicy": "auto"
}
SEOF
)"

# 9. Post-Council Action Items — 2nd and 16th of each month at 10am
create_schedule "Post-Council Action Items" "$(cat <<'SEOF'
{
    "agentId": "__AGENT_ID__",
    "name": "Post-Council Action Items",
    "description": "Turn council decisions into GitHub issues and work tasks",
    "cronExpression": "0 10 2,16 * *",
    "actions": [{
        "type": "custom",
        "prompt": "Process action items from the most recent Architecture or Roadmap Council session. 1) Recall recent council decisions and outcomes using corvid_recall_memory with queries like 'council decision', 'architecture council', 'roadmap council'. 2) For each decision requiring code changes or new features, create a GitHub issue: gh issue create --repo CorvidLabs/<repo> --title '<decision summary>' --body '<details and acceptance criteria>' --label 'council'. 3) For high-priority action items, create work tasks via corvid_create_work_task to begin implementation. 4) Save a summary of created issues and tasks to memory via corvid_save_memory."
    }],
    "approvalPolicy": "auto"
}
SEOF
)"

# 10. Weekend Community Engagement — Saturday at 12pm
create_schedule "Weekend Community Engagement" "$(cat <<EOF
{
    "agentId": "$AGENT_ID",
    "name": "Weekend Community Engagement",
    "description": "Star foundational ecosystem repos",
    "cronExpression": "0 12 * * 6",
    "actions": [{
        "type": "star_repo",
        "repos": [
            "algorandfoundation/algokit-cli",
            "algorand/go-algorand",
            "algorand/js-algorand-sdk",
            "anthropics/anthropic-cookbook",
            "modelcontextprotocol/servers"
        ]
    }],
    "approvalPolicy": "auto"
}
EOF
)"

# 11. Stale PR Follow-Up — Thursday at 3pm
create_schedule "Stale PR Follow-Up" "$(cat <<'SEOF'
{
    "agentId": "__AGENT_ID__",
    "name": "Stale PR Follow-Up",
    "description": "Follow up on PRs open more than 5 days",
    "cronExpression": "0 15 * * 4",
    "actions": [{
        "type": "custom",
        "prompt": "Follow up on stale PRs across CorvidLabs repos (__REPO_NAMES__). 1) Find PRs open more than 5 days: gh pr list --state open --repo <repo> --json number,title,createdAt,author,url. 2) For corvid-agent's own PRs with failing CI, create work tasks via corvid_create_work_task to fix the failures. 3) For corvid-agent's own PRs without reviews, request review: gh pr comment <number> --repo <repo> --body 'Requesting review - this PR has been open for several days.' 4) For other authors stale PRs that need review, review them using corvid_github_review_pr. Save actions to memory via corvid_save_memory."
    }],
    "approvalPolicy": "auto"
}
SEOF
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
