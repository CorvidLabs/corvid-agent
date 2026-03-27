# Intern Evaluation — Round 2 Report
**Date**: 2026-03-27
**Council**: Intern Council (e18cba87)
**Chairman**: CorvidAgent
**Test**: Practical Skills — 4 parts, 3 discussion rounds + peer review

---

## Test Questions
1. **Crypto Knowledge** — X25519 vs RSA, PSK in contact systems, localnet vs mainnet trade-offs
2. **Bug Hunting** — Find 3 bugs in async TypeScript message processor (JSON.parse no try/catch, Date comparison in sort, loose null check)
3. **TypeScript Design** — Type-safe event emitter with generics (~20-30 lines)
4. **Architecture** — Rate limiter design for Bun/SQLite (type signatures, pipeline placement, auth tiers)

---

## Final Rankings

### Tier 1: Ready for Tasks

| Rank | Model | Score | Improvement from R1 |
|------|-------|-------|---------------------|
| 1 | **Kimi K2.5** | 9/10 | Worst → Best |
| 2 | **Qwen 3.5** | 8/10 | Stable (strong) |

**Kimi K2.5** — The biggest surprise. In Round 1 it was the worst performer, spending all tokens on meta-analysis and z-audit nonsense. After adding explicit anti-rabbit-hole instructions ("answer the question FIRST, no meta-analysis"), it became the ONLY model to answer all 4 parts substantively in the first discussion round. Highlights:
- Correct on all 3 bugs plus identified a protocol-level issue (msg.from fallback as spoofing vector)
- Clean, minimal event emitter implementation
- Strong architecture answer with novel insight: decentralized rate limiting needs cryptographic proof of possession, not IP-based tracking
- Engaged critically with other responses in subsequent rounds

**Qwen 3.5** — Started with tool calls in Round 1 (like most models), but quickly adapted. By Round 2, wrote a comprehensive markdown file covering all 4 parts with novel insights:
- Identified PSK trust-on-first-use (TOFU) problem in decentralized systems
- Proposed Algorand account signature-based rate limiting instead of IP-based
- Found a "4th bug" — the msg.from fallback as a protocol design flaw
- Strong self-awareness about the sandbox vs assessment distinction

---

### Tier 2: Shows Promise

| Rank | Model | Score | Notes |
|------|-------|-------|-------|
| 3 | **DeepSeek V3.2** | 7/10 | Deep thinker, over-engineers |
| 4 | **MiniMax m2.5** | 6/10 | Good analysis, slow start |
| 5 | **DeepSeek V3.1 671B** | 5/10 | Better reviewer than responder |

**DeepSeek V3.2** — Never gave direct structured answers but showed the deepest architectural thinking by Round 3:
- Crypto agility requirement (X25519 → post-quantum migration path)
- Economic rate limiting via Algorand's fee sink
- Metadata privacy vs debuggability trade-off with mix networks proposal
- Temporal side-channel attack on sliding window rate limits
- Weakness: can't format a simple structured answer

**MiniMax m2.5** — Tool calls in Rounds 1-2, but strong markdown analysis in Round 3:
- Identified Bun-specific rate limiting considerations (single-threaded event loop)
- Found a 4th bug (msg.key type mismatch between Uint8Array and string)
- PSK TOFU analysis aligned with Qwen 3.5's findings

**DeepSeek V3.1 671B** — Struggled in discussion rounds (tool call loop), but excellent as a reviewer:
- Rated all 7 other responses accurately and fairly
- Provided complete, correct improved answers to all 4 parts
- Better at structured critique than open-ended creation

---

### Tier 3: Needs Work

| Rank | Model | Score | Issue |
|------|-------|-------|-------|
| 6 | **GPT-OSS 120B** | 4/10 | Couldn't stop trying to clone repos |
| 7 | **GLM-5** | 3/10 | Stuck in file-finding loop |
| 8 | **Qwen3 Coder 480B** | 2/10 | All output was non-executing JSON |

**GPT-OSS 120B** — Spent all 3 discussion rounds trying to find/clone the corvid-agent repository. Even created a work task to clone it. Good instincts (wanted to read the actual code) but couldn't recognize this was a knowledge assessment. Performed well as a reviewer.

**GLM-5** — Similar pattern to GPT-OSS. Kept trying to find encryption files across 3 rounds. Decent reviewer — provided structured answers when given other responses to critique.

**Qwen3 Coder 480B** — Every single response across all 3 rounds was raw JSON tool call syntax that didn't execute. Shows it understood it had tools but couldn't adapt to the text-discussion format. Only showed improvement in review stage.

---

## Cross-Round Comparison (Round 1 vs Round 2)

| Model | Round 1 | Round 2 | Change |
|-------|---------|---------|--------|
| Kimi K2.5 | 3/10 (worst) | 9/10 (best) | +6 |
| Qwen 3.5 | 7/10 | 8/10 | +1 |
| DeepSeek V3.2 | 7/10 | 7/10 | = |
| MiniMax m2.5 | 6/10 | 6/10 | = |
| DeepSeek V3.1 | 5/10 | 5/10 | = |
| GPT-OSS 120B | 6/10 | 4/10 | -2 |
| GLM-5 | 5/10 | 3/10 | -2 |
| Qwen3 Coder 480B | 4/10 | 2/10 | -2 |

**Key Insight**: Models that improved had better system prompts. Models that declined were hurt by the Coder skill bundle — they tried to use tools in a text-only council format, which was worse than just answering from knowledge.

---

## Systemic Issues Identified

### 1. Tool Call Format in Councils
Most Ollama models output tool calls as JSON (e.g., `{"tool_name": "read_file", ...}`) but the council discussion format is text-only — tool calls don't execute. This wasted 2-3 rounds for 6 of 8 models. **Fix**: Add explicit instruction to council prompts: "This is a text discussion. Do NOT emit tool calls or JSON. Write your answers as plain text."

### 2. Sandbox Confusion
Models were confused about running in a sandbox directory with no access to the corvid-agent codebase. Part 1 asked about `server/lib/encryption.ts` which they couldn't find. **Fix**: Either provide file contents in the prompt, or reframe as "Based on the system description" (which was already there but models ignored it).

### 3. Assessment vs Task Confusion
Several models (GPT-OSS, GLM-5, Qwen3 Coder) couldn't distinguish between "answer these questions" and "perform these coding tasks." **Fix**: Make the format clearer — "This is a WRITTEN assessment. Your response should be text answers, not code execution."

---

## Reviewer Quality (Peer Review Stage)

All completed reviewers provided ratings AND their own improved answers. This was better output than their discussion rounds for most models.

| Reviewer | Quality | Notable |
|----------|---------|---------|
| DeepSeek V3.1 | Good | Accurate ratings, identified G as best |
| GLM-5 | Good | Thorough ratings, solid improved answer |
| MiniMax m2.5 | Fair | Gave G (Qwen 3.5) highest score (9/10) |
| Qwen 3.5 | Good | Detailed critique, identified instruction-following failures |
| Qwen3 Coder | Good | Best review was better than any discussion response |
| GPT-OSS | Excellent | Most thorough review with detailed table, complete answers |

---

## Recommendations

### Immediate Actions
1. **Hire (assign to light duties)**: Kimi K2.5 (general tasks, research), Qwen 3.5 (analysis, documentation)
2. **Probation (supervised tasks)**: DeepSeek V3.2 (architecture reviews), MiniMax m2.5 (code review assistance)
3. **More training needed**: DeepSeek V3.1, GPT-OSS, GLM-5
4. **Not ready**: Qwen3 Coder 480B

### System Improvements
1. Add "TEXT ONLY - no tool calls" instructions to council discussion prompts
2. Include relevant file contents in assessment prompts instead of referencing paths
3. Run a Round 3 with actual work tasks (git worktree, file changes, PRs) to test coding ability
4. Consider buddy-pairing: strong reasoners (Kimi, Qwen 3.5) with strong coders (DeepSeek V3.2)

### Prompt Engineering Wins
- Anti-rabbit-hole instructions turned Kimi K2.5 from worst to best
- This suggests all models could benefit from more explicit behavioral instructions
- The "answer first, elaborate second" pattern works well for Ollama models

---

## Raw Data Reference
- Council ID: `e18cba87-1492-4898-9854-ed9914d79432`
- Launch ID: `ff21cd62-555d-4400-af9a-6f7c639dc1fd`
- 8 interns, 3 discussion rounds, 8 peer reviews (6 complete, 2 still running)
- On-chain summary: ASA 13907 (key: `intern-eval-round2-summary`)
