# corvid-agent → Fledge Plugin Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace corvid-agent's internal memory, AlgoChat, localnet, and database primitives with `fledge` CLI plugin calls, making fledge the primary tool for all agent operations.

**Architecture:** Create a thin `FledgeClient` wrapper that shells out to `fledge <command> --json`. MCP tool handlers call FledgeClient for primitives. Higher-level orchestration (MemoryManager, AlgoChat bridge) stays internal but delegates to fledge underneath. Identity bridging seeds fledge plugin state files with corvid-agent's existing wallet credentials so the same on-chain identity is used.

**Tech Stack:** TypeScript/Bun, fledge CLI (Rust), fledge-plugin-{sql,localnet,algochat,memory}

---

## Critical Design Decision: Identity Bridging

The fledge plugins create their own wallet identities in `.fledge/`. corvid-agent already has wallet credentials encrypted in its database. To avoid creating a second on-chain identity:

- **Memory plugin:** Seed `.fledge/memory-identity.json` with corvid-agent's existing wallet (address, mnemonic, signing key, encryption keys). The plugin then reads/writes to the same on-chain ASAs.
- **AlgoChat plugin:** Seed `.fledge/algochat-state.json` with corvid-agent's existing chat account (address, mnemonic, X25519 keypair, PSK contacts). Same on-chain identity.
- **SQL plugin:** No identity needed — just manages SQLite files.
- **Localnet plugin:** No identity — manages Docker lifecycle.

A one-time `fledge-identity-bridge` script exports corvid-agent's credentials into fledge plugin state files. After bridging, fledge plugins operate on the same chain identity as corvid-agent's internal code.

---

## Phase 1A: FledgeClient Utility

### Task 1: Create FledgeClient wrapper

**Files:**
- Create: `server/lib/fledge-client.ts`
- Test: `server/lib/__tests__/fledge-client.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, mock } from "bun:test";
import { FledgeClient } from "../fledge-client";

describe("FledgeClient", () => {
  it("parses JSON output from fledge command", async () => {
    const client = new FledgeClient();
    // This will fail because FledgeClient doesn't exist yet
    expect(client).toBeDefined();
    expect(typeof client.exec).toBe("function");
  });

  it("throws on non-zero exit code", async () => {
    const client = new FledgeClient();
    await expect(client.exec("nonexistent-command")).rejects.toThrow();
  });

  it("returns parsed JSON for --json commands", async () => {
    const client = new FledgeClient();
    // Requires fledge to be installed
    const result = await client.memory("identity");
    expect(result).toHaveProperty("address");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/corvid-agent/corvid-agent && bun test server/lib/__tests__/fledge-client.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write FledgeClient implementation**

```typescript
import { $ } from "bun";

export interface FledgeResult {
  ok: boolean;
  [key: string]: unknown;
}

export class FledgeClient {
  private cwd: string;
  private timeout: number;

  constructor(opts?: { cwd?: string; timeout?: number }) {
    this.cwd = opts?.cwd ?? process.cwd();
    this.timeout = opts?.timeout ?? 30_000;
  }

  async exec(command: string, args: string[] = []): Promise<FledgeResult> {
    const fullArgs = [...args, "--json"];
    const proc = Bun.spawn(["fledge", command, ...fullArgs], {
      cwd: this.cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });

    const timeout = setTimeout(() => proc.kill(), this.timeout);
    try {
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      if (exitCode !== 0) {
        const parsed = this.tryParseJson(stdout) ?? this.tryParseJson(stderr);
        if (parsed?.error) throw new FledgeError(parsed.error as string, exitCode);
        throw new FledgeError(stderr.trim() || `fledge ${command} exited with code ${exitCode}`, exitCode);
      }

      return this.tryParseJson(stdout) ?? { ok: true, raw: stdout.trim() };
    } finally {
      clearTimeout(timeout);
    }
  }

  async memory(subcommand: string, args: Record<string, string> = {}): Promise<FledgeResult> {
    const flags = Object.entries(args).flatMap(([k, v]) => [`--${k}`, v]);
    return this.exec("memory", [subcommand, ...flags]);
  }

  async algochat(subcommand: string, args: string[] = []): Promise<FledgeResult> {
    return this.exec("algochat", [subcommand, ...args]);
  }

  async sql(subcommand: string, args: string[] = []): Promise<FledgeResult> {
    return this.exec("sql", [subcommand, ...args]);
  }

  async localnet(subcommand: string, args: string[] = []): Promise<FledgeResult> {
    return this.exec("localnet", [subcommand, ...args]);
  }

  private tryParseJson(text: string): FledgeResult | null {
    try {
      const lines = text.trim().split("\n");
      for (const line of lines) {
        if (line.startsWith("{")) return JSON.parse(line);
      }
      return null;
    } catch {
      return null;
    }
  }
}

export class FledgeError extends Error {
  constructor(message: string, public exitCode: number) {
    super(message);
    this.name = "FledgeError";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/corvid-agent/corvid-agent && bun test server/lib/__tests__/fledge-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/lib/fledge-client.ts server/lib/__tests__/fledge-client.test.ts
git commit -m "feat: add FledgeClient wrapper for CLI delegation"
```

---

## Phase 1B: Memory Tool Handlers Migration

### Task 2: Migrate handleSaveMemory

**Files:**
- Modify: `server/mcp/tool-handlers/memory.ts:76-96`
- Modify: `server/lib/fledge-client.ts` (if needed)

Current implementation calls `saveMemory(ctx.db, { agentId, key, content })` directly into SQLite.

- [ ] **Step 1: Read current handleSaveMemory implementation**

Read: `server/mcp/tool-handlers/memory.ts` lines 76-96

- [ ] **Step 2: Replace with fledge memory save call**

The handler should:
1. Try `fledge memory save --key <k> --value <v> --json`
2. If fledge fails (not installed, plugin missing), fall back to existing `saveMemory()` call
3. Log which path was taken

```typescript
async function handleSaveMemory(ctx: ToolContext, args: { key: string; content: string }): Promise<CallToolResult> {
  const { key, content } = args;
  if (!key || !content) return errorResult("key and content are required");

  try {
    const result = await ctx.fledgeClient.memory("save", { key, value: content });
    return textResult(
      `Memory saved with key "${key}" (${result.tier ?? "ephemeral"}, via fledge).` +
      ` Use corvid_promote_memory to promote to on-chain storage.`
    );
  } catch {
    // Fallback to internal implementation
    saveMemory(ctx.db, { agentId: ctx.agentId, key, content });
    return textResult(
      `Memory saved with key "${key}" (short-term, SQLite fallback).` +
      ` Use corvid_promote_memory to promote to on-chain storage.`
    );
  }
}
```

- [ ] **Step 3: Test manually via MCP tool call**

Invoke `corvid_save_memory` with key "fledge-migration-test" and verify it goes through fledge.

- [ ] **Step 4: Commit**

```bash
git add server/mcp/tool-handlers/memory.ts
git commit -m "feat: migrate handleSaveMemory to fledge memory save with fallback"
```

### Task 3: Migrate handleRecallMemory

**Files:**
- Modify: `server/mcp/tool-handlers/memory.ts:198-282`

Current implementation calls `recallMemory()` by key, `searchMemories()` by query, with on-chain fallback.

- [ ] **Step 1: Read current handleRecallMemory implementation**

Read: `server/mcp/tool-handlers/memory.ts` lines 198-282

- [ ] **Step 2: Replace with fledge memory recall call**

```typescript
async function handleRecallMemory(ctx: ToolContext, args: { key?: string; query?: string }): Promise<CallToolResult> {
  const { key, query } = args;

  try {
    if (key) {
      const result = await ctx.fledgeClient.memory("recall", { key });
      if (result.error === "not_found") {
        return textResult(`No memory found with key "${key}".`);
      }
      return textResult(formatMemoryResult(result));
    }
    if (query) {
      const result = await ctx.fledgeClient.memory("recall", { query });
      return textResult(formatSearchResults(result));
    }
    // No key or query — list all
    const result = await ctx.fledgeClient.memory("list", {});
    return textResult(formatMemoryList(result));
  } catch {
    // Fallback to internal
    if (key) {
      const memory = recallMemory(ctx.db, ctx.agentId, key);
      if (!memory) return textResult(`No memory found with key "${key}".`);
      return textResult(formatInternalMemory(memory));
    }
    if (query) {
      const results = searchMemories(ctx.db, ctx.agentId, query);
      return textResult(formatInternalSearchResults(results));
    }
    const list = listMemories(ctx.db, ctx.agentId);
    return textResult(formatInternalList(list));
  }
}
```

- [ ] **Step 3: Test recall by key and by query**

- [ ] **Step 4: Commit**

```bash
git add server/mcp/tool-handlers/memory.ts
git commit -m "feat: migrate handleRecallMemory to fledge memory recall with fallback"
```

### Task 4: Migrate handlePromoteMemory

**Files:**
- Modify: `server/mcp/tool-handlers/memory.ts:98-196`

This is the most complex handler — it has localnet (ARC-69) vs testnet/mainnet paths.

- [ ] **Step 1: Read current handlePromoteMemory implementation**

Read: `server/mcp/tool-handlers/memory.ts` lines 98-196

- [ ] **Step 2: Replace with fledge memory promote**

```typescript
async function handlePromoteMemory(ctx: ToolContext, args: { key: string }): Promise<CallToolResult> {
  const { key } = args;

  try {
    const result = await ctx.fledgeClient.memory("promote", { key, tier: "mutable" });
    return textResult(
      `Memory "${key}" promoted from ${result.from} to ${result.to}.` +
      (result.asaId ? ` ASA ID: ${result.asaId}` : "") +
      (result.txid ? ` Txid: ${result.txid}` : "")
    );
  } catch (e) {
    // Fallback to internal arc69-store / testnet path
    return handlePromoteMemoryInternal(ctx, args);
  }
}
```

- [ ] **Step 3: Keep internal implementation as handlePromoteMemoryInternal**

Rename the existing function body so it serves as fallback.

- [ ] **Step 4: Test promote with a real memory**

- [ ] **Step 5: Commit**

```bash
git add server/mcp/tool-handlers/memory.ts
git commit -m "feat: migrate handlePromoteMemory to fledge memory promote with fallback"
```

### Task 5: Migrate handleDeleteMemory

**Files:**
- Modify: `server/mcp/tool-handlers/memory.ts:284-324`

- [ ] **Step 1: Read current implementation**

- [ ] **Step 2: Replace with fledge memory delete**

```typescript
async function handleDeleteMemory(ctx: ToolContext, args: { key: string; mode?: string }): Promise<CallToolResult> {
  try {
    const result = await ctx.fledgeClient.memory("delete", { key: args.key });
    return textResult(`Memory "${args.key}" deleted (${result.tier ?? "ephemeral"}).`);
  } catch {
    return handleDeleteMemoryInternal(ctx, args);
  }
}
```

- [ ] **Step 3: Test delete of ephemeral and mutable memories**

- [ ] **Step 4: Commit**

```bash
git add server/mcp/tool-handlers/memory.ts
git commit -m "feat: migrate handleDeleteMemory to fledge memory delete with fallback"
```

### Task 6: Migrate handleReadOnChainMemories and handleSyncOnChainMemories

**Files:**
- Modify: `server/mcp/tool-handlers/memory.ts:326-493`

- [ ] **Step 1: Read current implementations**

- [ ] **Step 2: Replace handleReadOnChainMemories with fledge memory list --tier mutable**

```typescript
async function handleReadOnChainMemories(ctx: ToolContext, args: { search?: string; limit?: number }): Promise<CallToolResult> {
  try {
    const result = await ctx.fledgeClient.memory("list", { tier: "mutable" });
    const memories = result.memories as any[];
    if (args.search) {
      const filtered = memories.filter(m => m.key.includes(args.search));
      return textResult(formatOnChainList(filtered));
    }
    return textResult(formatOnChainList(memories));
  } catch {
    return handleReadOnChainMemoriesInternal(ctx, args);
  }
}
```

- [ ] **Step 3: Keep handleSyncOnChainMemories internal for now**

The sync handler has complex two-phase logic (ARC-69 + plain txn) that doesn't map cleanly to a single fledge command. Keep internal, but have it verify against fledge memory list for consistency.

- [ ] **Step 4: Test**

- [ ] **Step 5: Commit**

```bash
git add server/mcp/tool-handlers/memory.ts
git commit -m "feat: migrate handleReadOnChainMemories to fledge memory list with fallback"
```

---

## Phase 1C: Identity Bridge Script

### Task 7: Create identity bridge utility

**Files:**
- Create: `server/scripts/fledge-identity-bridge.ts`

This one-time script exports corvid-agent's wallet credentials into fledge plugin state files.

- [ ] **Step 1: Write the bridge script**

```typescript
#!/usr/bin/env bun
/**
 * Seeds fledge plugin state files with corvid-agent's existing wallet credentials.
 * Run once after installing fledge plugins to bridge identities.
 */
import { Database } from "bun:sqlite";
import { writeFileSync, chmodSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const PROJECT_DIR = process.cwd();
const FLEDGE_DIR = join(PROJECT_DIR, ".fledge");
const DB_PATH = join(FLEDGE_DIR, "fledge.db"); // or wherever corvid-agent stores its DB

async function main() {
  // 1. Read corvid-agent's wallet from database
  const db = new Database(DB_PATH, { readonly: true });
  const agent = db.query("SELECT wallet_address, wallet_mnemonic FROM agents WHERE id = ?").get("corvid-agent");
  if (!agent) throw new Error("Agent 'corvid-agent' not found in database");

  // 2. Decrypt mnemonic (uses KeyProvider or legacy encryption)
  const mnemonic = await decryptMnemonic(agent.wallet_mnemonic);

  // 3. Derive keys from mnemonic
  const account = algochat.createChatAccountFromMnemonic(mnemonic);

  // 4. Write memory-identity.json
  const memoryIdentity = {
    address: account.address,
    mnemonic: mnemonic,
    signingKey: Buffer.from(account.signingKey).toString("base64"),
    encryptionPublicKey: Buffer.from(account.encryptionPublicKey).toString("base64"),
    encryptionSecretKey: Buffer.from(account.encryptionSecretKey).toString("base64"),
  };

  mkdirSync(FLEDGE_DIR, { recursive: true });
  const memPath = join(FLEDGE_DIR, "memory-identity.json");
  writeFileSync(memPath, JSON.stringify(memoryIdentity, null, 2));
  chmodSync(memPath, 0o600);
  console.log(`Wrote ${memPath}`);

  // 5. Write algochat-state.json (with PSK contacts)
  const contacts = db.query("SELECT * FROM psk_contacts WHERE active = 1").all();
  const algochatState = {
    address: account.address,
    mnemonic: mnemonic,
    publicKey: Buffer.from(account.encryptionPublicKey).toString("base64"),
    secretKey: Buffer.from(account.encryptionSecretKey).toString("base64"),
    contacts: contacts.map(c => ({
      name: c.nickname,
      address: c.mobile_address,
      psk: c.psk_base64,
      publicKey: c.public_key,
    })),
  };

  const acPath = join(FLEDGE_DIR, "algochat-state.json");
  writeFileSync(acPath, JSON.stringify(algochatState, null, 2));
  chmodSync(acPath, 0o600);
  console.log(`Wrote ${acPath}`);

  db.close();
  console.log("Identity bridge complete. fledge plugins now use corvid-agent's on-chain identity.");
}

main().catch(console.error);
```

- [ ] **Step 2: Test by running the bridge and verifying fledge memory identity matches corvid-agent's wallet**

```bash
bun run server/scripts/fledge-identity-bridge.ts
fledge memory identity --json
# Should show same address as corvid-agent's wallet
```

- [ ] **Step 3: Commit**

```bash
git add server/scripts/fledge-identity-bridge.ts
git commit -m "feat: add identity bridge script for fledge plugin migration"
```

---

## Phase 1D: Wire FledgeClient into ProcessManager

### Task 8: Add FledgeClient to ToolContext

**Files:**
- Modify: `server/process/context-management.ts` (add FledgeClient to context)
- Modify: `server/mcp/tool-handlers/types.ts` (add fledgeClient to ToolContext type)
- Modify: `server/bootstrap.ts` (instantiate FledgeClient)

- [ ] **Step 1: Add fledgeClient to ToolContext type**

```typescript
// In types.ts or wherever ToolContext is defined
export interface ToolContext {
  // ... existing fields
  fledgeClient: FledgeClient;
}
```

- [ ] **Step 2: Instantiate in bootstrap.ts**

```typescript
import { FledgeClient } from "./lib/fledge-client";
const fledgeClient = new FledgeClient({ cwd: projectDir });
```

- [ ] **Step 3: Pass through context-management.ts**

Wire the client into the context object that gets passed to tool handlers.

- [ ] **Step 4: Verify tool handlers receive it**

- [ ] **Step 5: Commit**

```bash
git add server/process/context-management.ts server/mcp/tool-handlers/types.ts server/bootstrap.ts
git commit -m "feat: wire FledgeClient into ToolContext for all handlers"
```

---

## Phase 1E: Database Migration Delegation

### Task 9: Use fledge sql for migrations

**Files:**
- Modify: `server/db/migrate.ts` (add fledge sql migrate path)

- [ ] **Step 1: Add fledge sql migrate as primary migration runner**

Before running internal migrations, try `fledge sql migrate --dir server/db/migrations`. If it succeeds, skip internal. If it fails, fall back to internal runner.

- [ ] **Step 2: Test with a fresh database**

- [ ] **Step 3: Commit**

```bash
git add server/db/migrate.ts
git commit -m "feat: delegate database migrations to fledge sql with fallback"
```

---

## Phase 1F: Integration Testing

### Task 10: End-to-end migration test

- [ ] **Step 1: Install all four fledge plugins in corvid-agent project**

```bash
cd /Users/corvid-agent/corvid-agent
fledge plugins install CorvidLabs/fledge-plugin-sql --yes
fledge plugins install CorvidLabs/fledge-plugin-localnet --yes
fledge plugins install CorvidLabs/fledge-plugin-algochat --yes
fledge plugins install CorvidLabs/fledge-plugin-memory --yes
```

- [ ] **Step 2: Run identity bridge**

```bash
bun run server/scripts/fledge-identity-bridge.ts
```

- [ ] **Step 3: Verify fledge memory identity matches corvid-agent wallet**

```bash
fledge memory identity --json
# Compare address with agent's wallet_address in DB
```

- [ ] **Step 4: Test save → recall → promote → delete cycle through MCP tools**

- [ ] **Step 5: Verify on-chain operations work with existing identity**

- [ ] **Step 6: Check fallback works when fledge is unavailable**

Temporarily rename `fledge` binary, verify internal code handles all operations.

- [ ] **Step 7: Commit final integration test results**

---

## Post-Migration: What's Retired

After Phase 1 is complete and stable:

| Internal Component | Status | Notes |
|-------------------|--------|-------|
| `server/db/agent-memories.ts` | Fallback only | Primary path is fledge memory |
| `server/memory/arc69-store.ts` | Fallback only | fledge memory handles ARC-69 |
| `server/db/migrate.ts` | Fallback only | fledge sql migrate is primary |
| `server/algochat/on-chain-transactor.ts` (memory methods) | Fallback only | Memory read/write via fledge |

These files stay in the codebase as fallback but are no longer the primary path. Once fledge plugins are proven stable (2-4 weeks), the fallback code can be removed entirely.

---

## Phase 2 Preview (Future)

After Phase 1 is stable:
- **AlgoChat messaging** → `fledge algochat send/read` for wire protocol (orchestration stays)
- **Dev workflow** → `fledge work`, `fledge review`, `fledge release` for git operations
- **New capabilities** → Build as fledge plugins first, not internal code
