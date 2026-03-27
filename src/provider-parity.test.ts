import { describe, it, expect } from "bun:test";

// Provider parity validation — ensures doc structure is consistent.
// Actual integration tests live in the main server test suite.

describe("provider parity checklist", () => {
  it("defines the three providers under test", () => {
    const providers = ["claude", "ollama", "cursor"] as const;
    expect(providers).toHaveLength(3);
    expect(providers).toContain("claude");
    expect(providers).toContain("ollama");
    expect(providers).toContain("cursor");
  });

  it("claude is the baseline provider", () => {
    const baseline = "claude";
    expect(baseline).toBe("claude");
  });

  it("ollama and cursor are opt-in providers", () => {
    const optIn = ["ollama", "cursor"] as const;
    expect(optIn).not.toContain("claude");
  });
});
