import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : 2,
    reporter: 'line',
    timeout: 120_000,
    use: {
        baseURL: 'http://localhost:3000',
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
        url: 'http://localhost:3000/api/health',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
        env: {
            RATE_LIMIT_GET: '5000',      // Higher read limit for e2e test volume
            RATE_LIMIT_MUTATION: '1000',  // Higher write limit for parallel e2e tests
            ENABLED_PROVIDERS: 'anthropic,ollama', // Prevent auto-restrict to ollama-only in CI
        },
    },
});
