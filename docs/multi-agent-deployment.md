# Multi-Agent Deployment Guide

Deploy multiple CorvidAgent instances across machines with coordinated work distribution, conflict resolution, and capability-based task routing.

## Prerequisites

- Each agent instance needs its own Algorand wallet (generated via `corvid provision`)
- All instances must share access to the same AlgoChat network (localnet or testnet)
- GitHub tokens with appropriate repo access for each instance

## Architecture Overview

```
┌─────────────┐     AlgoChat      ┌─────────────┐
│   Agent A    │◄────(on-chain)────►│   Agent B    │
│  (machine 1) │                   │  (machine 2) │
│              │                   │              │
│ ┌──────────┐ │  Flock Directory  │ ┌──────────┐ │
│ │ Conflict │ │◄───(shared)──────►│ │ Conflict │ │
│ │ Resolver │ │                   │ │ Resolver │ │
│ └──────────┘ │                   │ └──────────┘ │
│ ┌──────────┐ │                   │ ┌──────────┐ │
│ │Capability│ │                   │ │Capability│ │
│ │  Router  │ │                   │ │  Router  │ │
│ └──────────┘ │                   │ └──────────┘ │
└─────────────┘                    └─────────────┘
```

## Quick Start: Two-Agent Setup

### 1. Provision Agent A

```bash
# On machine 1
corvid provision --name "Agent-Alpha" --role lead
```

This generates:
- Algorand wallet keypair
- Agent identity in the Flock Directory
- Default project configuration

### 2. Provision Agent B

```bash
# On machine 2
corvid provision --name "Agent-Beta" --role worker
```

### 3. Configure Environment

Each agent needs these environment variables:

```bash
# .env on each machine
AGENT_NAME=Agent-Alpha              # Unique name
FLOCK_AGENT_ID=<uuid>               # From provision output
ALGOCHAT_NETWORK=localnet           # or testnet
ALGORAND_MNEMONIC=<25-word-mnemonic>
GITHUB_TOKEN=<token>

# Optional tuning
TASK_QUEUE_MAX_CONCURRENCY=2        # Max parallel work tasks
WORK_MAX_ITERATIONS=3               # Max retry iterations per task
```

### 4. Start Both Agents

```bash
# Machine 1
bun run start

# Machine 2
bun run start
```

Both agents will:
1. Self-register in the Flock Directory
2. Begin heartbeating every 12 hours
3. Start the conflict resolver
4. Accept work tasks via AlgoChat or API

## Conflict Resolution

When multiple agents work on the same codebase, conflicts are prevented at three levels:

### Level 1: Issue Dedup (Local)
Before creating a work task, the agent checks for:
- Existing active/pending tasks targeting the same GitHub issue
- Open PRs that already address the issue

### Level 2: Work Claims (Cross-Machine)
The `FlockConflictResolver` manages ephemeral claims:

```
Agent A starts work on CorvidLabs/corvid-agent#42
  → Creates a work claim: {repo, issue=42, agentId=A, expires=2h}

Agent B receives a request to work on #42
  → Checks claims → finds Agent A's active claim
  → Rejects: "Another agent (Agent-Alpha) is already working on this issue"
```

Claims auto-expire after 2 hours. Expired claims are automatically overridden.

**Conflict types:**
| Type | Default behavior |
|------|-----------------|
| Same issue | **Blocked** — another agent is working on it |
| Same branch | **Blocked** — branch collision risk |
| Same repo, different issue | **Allowed** — agents can work on different issues in the same repo |

### Level 3: Git Worktree Isolation
Each work task runs in its own git worktree with a unique branch name:
```
agent/<agent-slug>/<task-slug>-<timestamp>-<random>
```
This prevents branch collisions even if two agents work on the same repo.

## Capability-Based Routing

The `CapabilityRouter` matches tasks to agents based on declared capabilities:

### Declaring Capabilities

Set capabilities during provisioning or via the API:

```bash
# During provision
corvid provision --name "SecurityBot" --capabilities security_audit,code_review

# Via API
curl -X PATCH /api/flock-directory/agents/<id> \
  -d '{"capabilities": ["security_audit", "code_review", "dependency_audit"]}'
```

### Available Capabilities

| Capability | Description |
|------------|-------------|
| `code_review` | Review PRs and code quality |
| `bug_fix` | Fix reported bugs |
| `feature_work` | Implement new features |
| `security_audit` | Security vulnerability scanning |
| `dependency_audit` | Dependency version and CVE checking |
| `documentation` | Write and update docs |
| `testing` | Write and run tests |
| `devops` | CI/CD and infrastructure |
| `refactoring` | Code cleanup and restructuring |
| `triage` | Issue triage and prioritization |

### Routing a Task

```bash
curl -X POST /api/flock-directory/route \
  -d '{"actionType": "security_audit", "repo": "CorvidLabs/corvid-agent"}'
```

Response:
```json
{
  "bestCandidate": {
    "agent": {"name": "SecurityBot", "reputationScore": 90},
    "score": 85,
    "breakdown": {
      "capabilityMatch": 100,
      "reputation": 36,
      "workload": 30,
      "uptime": 19
    }
  },
  "candidates": [...],
  "exclusions": [...]
}
```

### Scoring Algorithm

Candidates are ranked by a composite score (0–100):

| Component | Weight | Calculation |
|-----------|--------|-------------|
| Reputation | 40% | Agent's reputation score (0–100) |
| Workload | 30% | Fewer active claims = higher score |
| Uptime | 20% | Agent's uptime percentage |
| Recency | 10% | Time since last heartbeat |

## Monitoring

### Active Claims Dashboard

```bash
# List all active work claims
curl /api/flock-directory/claims

# Filter by repo
curl /api/flock-directory/claims?repo=CorvidLabs/corvid-agent

# Get conflict stats
curl /api/flock-directory/claims/stats
```

### Flock Directory Status

```bash
# List all registered agents
curl /api/flock-directory/agents

# Search by capability
curl /api/flock-directory/search?capability=security_audit

# Get directory stats
curl /api/flock-directory/stats
```

## Minimum Resource Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 2 GB | 4 GB |
| Disk | 10 GB | 20 GB |
| Network | Stable internet | Low-latency connection |

Each agent instance runs:
- HTTP server (port 3578 default)
- SQLite database
- AlgoChat message polling
- Up to `TASK_QUEUE_MAX_CONCURRENCY` concurrent Claude sessions

## Troubleshooting

### Agent not appearing in Flock Directory
1. Check `FLOCK_AGENT_ID` is set in environment
2. Verify the agent registered on startup (check logs for "Self-registered in Flock Directory")
3. Confirm heartbeat is running (check logs for "heartbeat" entries)

### Work claims not being checked
1. Verify `FlockConflictResolver` is initialized (check bootstrap logs)
2. Ensure the work_claims table exists: `SELECT count(*) FROM work_claims`
3. Check that `FLOCK_AGENT_ID` is set — without it, the resolver can't identify self vs others

### Duplicate work despite conflict resolver
1. Check claim TTL — if tasks run longer than 2 hours, claims may expire mid-task
2. Increase TTL via `ConflictResolverConfig.claimTtlMs`
3. Verify both agents have different `FLOCK_AGENT_ID` values
