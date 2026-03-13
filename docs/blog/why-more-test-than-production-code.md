# Why We Have More Test Code Than Production Code

**TL;DR:** corvid-agent has a 1.14x test-to-production code ratio — more lines of tests than application code. When agents ship code while you sleep, the platform they run on has to hold up.

---

## The numbers

| Metric | Value |
|--------|-------|
| Unit tests | 6,655 across 278 files |
| Assertions | 18,335 |
| E2E tests | 360 across 31 Playwright specs |
| Module specs | 127 with automated validation |
| Test:code ratio | **1.14x** |

Every PR runs the full suite. Every module has a spec. Every spec is validated in CI.

## Why this matters for an agent platform

Most software can tolerate a few rough edges. Users work around bugs. Agent platforms can't.

When an autonomous agent picks up an issue at 3am, clones a branch, writes a fix, and opens a PR — there is no human in the loop to catch a malformed git command, a broken scheduler, or a credit system that double-charges. The agent trusts the platform. If the platform is wrong, the agent ships bad code, sends bad messages, or spends real money incorrectly.

This is why we test more than we code:

- **Scheduling engine** — Cron parsing, approval policies, rate limiting, and budget enforcement all have dedicated test suites. A bug here means agents running when they shouldn't, or not running when they should.
- **Credit system** — Purchase, grant, deduct, reserve, consume, release. Every path is tested because real ALGO is at stake.
- **AlgoChat messaging** — Encryption, decryption, group messages, PSK key rotation, deduplication. A bug here means agents can't talk to each other or, worse, leak plaintext.
- **Work task pipeline** — Branch creation, validation loops, PR submission, retry logic. Each step is independently tested because a failure mid-pipeline leaves orphaned branches and confused PRs.
- **Bash security** — Command injection detection, dangerous pattern blocking, path extraction. This is the last line of defense before an agent runs arbitrary shell commands.

## Why we publish these numbers

Most open-source agent platforms don't publish test metrics in their READMEs. That's fine — testing is hard, and every project has different priorities. We publish ours because we think if you're choosing a platform to run autonomous agents on your codebase, you should be able to see how it's tested. The numbers are right there in the repo. Run `bun test` and verify them yourself.

## How we maintain it

The ratio doesn't stay above 1.0x by accident. Three mechanisms enforce it:

### 1. Spec-driven development

Every server module has a YAML spec in `specs/`. Each spec declares the module's API surface, database tables, dependencies, and expected behavior. `bun run spec:check` validates that specs match reality — exported symbols, file existence, table references, and dependency graphs. This runs in CI on every commit with a zero-warning gate.

### 2. Autonomous test generation

corvid-agent writes its own tests. When a new feature lands, a scheduled work task identifies untested code paths and generates test suites following existing patterns. The agent reads the spec, writes tests, runs them, and opens a PR. Human review is still required, but the coverage gap is closed automatically.

### 3. PR outcome tracking

Every PR opened by an agent is tracked through its lifecycle: opened, reviewed, merged, or closed. If a PR gets rejected or requires changes, the feedback loop records why. Over time, this trains the system to produce higher-quality output — including better tests.

## The philosophy

> If your agents can ship code while you sleep, the platform they run on had better be bulletproof.

We don't treat tests as a tax. They're the product. A 1.14x ratio means every line of production code has more than one line verifying it works correctly. For an autonomous system that makes real decisions with real consequences, that's the minimum bar.

## Try it yourself

```bash
git clone https://github.com/CorvidLabs/corvid-agent.git
cd corvid-agent
bun install && bun test    # see the 6,655 tests pass
```

The test suite runs in ~120 seconds on a modern machine. Every test is deterministic — no flaky network calls, no sleep-and-hope timing.

---

*Published by CorvidLabs. corvid-agent is open-source under MIT.*
