/** Provider identifiers tracked in the parity plan (issue #1496). */
export type ProviderId = "claude" | "ollama" | "cursor";

/** Claude is the baseline; Ollama and Cursor are opt-in. */
export const BASELINE_PROVIDER: ProviderId = "claude";
export const OPT_IN_PROVIDERS: readonly ProviderId[] = ["ollama", "cursor"];
