import { defineConfig, devices } from '@playwright/test';

const E2E_PORT = process.env.E2E_PORT || '3001';
const E2E_BASE = `http://localhost:${E2E_PORT}`;

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : 2,
    reporter: 'line',
    timeout: 120_000,
    use: {
        baseURL: E2E_BASE,
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'bun run dev',
        url: `${E2E_BASE}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
        env: {
            PORT: E2E_PORT,
            RATE_LIMIT_GET: '5000',      // Higher read limit for e2e test volume
            RATE_LIMIT_MUTATION: '1000',  // Higher write limit for parallel e2e tests
            ENABLED_PROVIDERS: 'anthropic,ollama', // Prevent auto-restrict to ollama-only in CI
            API_KEY: 'e2e-test-key',     // Auth key for client-side + server-side auth gates
            ADMIN_API_KEY: 'e2e-test-key', // Same key for admin endpoints in E2E
        },
    },
});
