export const SELF_TEST_PROJECT = {
    name: 'corvid-agent (self)',
    workingDir: process.cwd(),
    claudeMd: `You are a dev agent for the corvid-agent project.
Run tests, analyze failures, fix source code, re-run to verify.
- Unit: bun test
- E2E: npx playwright test --config=playwright.config.js
- Build: cd client && bun run build`,
};

export const SELF_TEST_AGENT = {
    name: 'Self-Test Agent',
    systemPrompt: SELF_TEST_PROJECT.claudeMd,
    model: 'claude-sonnet-4-20250514',
    permissionMode: 'full-auto' as const,
    allowedTools: 'Bash,Read,Write,Edit,Glob,Grep',
    maxBudgetUsd: 5.0,
    algochatEnabled: false,
};
