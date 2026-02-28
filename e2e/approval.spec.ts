import { test, expect , authedFetch , gotoWithRetry } from './fixtures';

const BASE_URL = `http://localhost:${process.env.E2E_PORT || '3001'}`;

interface TestWindow extends Window {
    __TEST_WS_INSTANCES: WebSocket[];
    __TEST_WS_SENT: Record<string, unknown>[];
}

/**
 * E2E tests for the Approval Dialog critical path.
 *
 * Strategy for WebSocket message injection:
 *   We intercept the native WebSocket constructor before the Angular app boots
 *   so we can capture the live socket instance. Then we dispatch synthetic
 *   `MessageEvent`s to simulate server-pushed `approval_request` messages.
 *   We also monkey-patch `WebSocket.prototype.send` to capture outgoing
 *   `approval_response` messages for assertion.
 */

test.describe.serial('Approval Dialog Critical Path', () => {
    let projectId: string;
    let agentId: string;
    let sessionId: string;

    test.beforeAll(async () => {
        // Seed a project, agent, and session via the REST API
        const projectRes = await authedFetch(`${BASE_URL}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Approval E2E Project', workingDir: '/tmp' }),
        });
        expect(projectRes.ok).toBe(true);
        const project = await projectRes.json();
        projectId = project.id;

        const agentRes = await authedFetch(`${BASE_URL}/api/agents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Approval E2E Agent',
                model: 'claude-sonnet-4-20250514',
            }),
        });
        expect(agentRes.ok).toBe(true);
        const agent = await agentRes.json();
        agentId = agent.id;

        const sessionRes = await authedFetch(`${BASE_URL}/api/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId,
                agentId,
                name: 'Approval E2E Session',
                initialPrompt: 'Test prompt for approval flow',
            }),
        });
        expect(sessionRes.ok).toBe(true);
        const session = await sessionRes.json();
        sessionId = session.id;
    });

    /**
     * Helper: install WebSocket hooks before the page navigates.
     *
     * Adds `page.addInitScript` to:
     *   1. Patch the WebSocket constructor to capture every new socket in
     *      `window.__TEST_WS_INSTANCES` (array).
     *   2. Patch `WebSocket.prototype.send` to log outgoing messages to
     *      `window.__TEST_WS_SENT` (array of parsed JSON objects).
     */
    async function installWsHooks(page: import('@playwright/test').Page) {
        await page.addInitScript(() => {
            /* global window */
            const w = window as unknown as TestWindow;
            w.__TEST_WS_INSTANCES = [] as WebSocket[];
            w.__TEST_WS_SENT = [] as object[];

            const OrigWS = window.WebSocket;
            // @ts-expect-error — intentional monkey-patch
            window.WebSocket = function PatchedWebSocket(
                this: WebSocket,
                url: string | URL,
                protocols?: string | string[],
            ) {
                const ws = new OrigWS(url, protocols);
                w.__TEST_WS_INSTANCES.push(ws);
                return ws;
            } as unknown as typeof WebSocket;
            window.WebSocket.prototype = OrigWS.prototype;
            Object.assign(window.WebSocket, OrigWS);

            const origSend = OrigWS.prototype.send;
            OrigWS.prototype.send = function (data: string | ArrayBufferLike | Blob | ArrayBufferView) {
                try {
                    const parsed = JSON.parse(data);
                    w.__TEST_WS_SENT.push(parsed);
                } catch {
                    /* binary or non-JSON — ignore */
                }
                return origSend.call(this, data);
            };
        });
    }

    /**
     * Helper: inject a synthetic `approval_request` message into the live
     * WebSocket connection so the Angular WebSocketService processes it.
     */
    async function injectApprovalRequest(
        page: import('@playwright/test').Page,
        overrides: Partial<{
            id: string;
            sessionId: string;
            toolName: string;
            description: string;
            createdAt: number;
            timeoutMs: number;
        }> = {},
    ) {
        const requestId = overrides.id ?? `req-${Date.now()}`;
        await page.evaluate(
            ({ req }) => {
                const w = window as unknown as TestWindow;
                const instances: WebSocket[] = w.__TEST_WS_INSTANCES ?? [];
                const ws = instances[instances.length - 1];
                if (!ws) throw new Error('No WebSocket instance captured');

                const msg = JSON.stringify({
                    type: 'approval_request',
                    request: {
                        id: req.id,
                        sessionId: req.sessionId,
                        toolName: req.toolName,
                        description: req.description,
                        createdAt: req.createdAt,
                        timeoutMs: req.timeoutMs,
                    },
                });

                // Dispatch a native MessageEvent on the socket
                ws.dispatchEvent(new MessageEvent('message', { data: msg }));
            },
            {
                req: {
                    id: requestId,
                    sessionId: overrides.sessionId ?? 'placeholder',
                    toolName: overrides.toolName ?? 'Bash',
                    description: overrides.description ?? 'rm -rf /tmp/test',
                    createdAt: overrides.createdAt ?? Date.now(),
                    timeoutMs: overrides.timeoutMs ?? 30000,
                },
            },
        );
        return requestId;
    }

    /**
     * Helper: navigate to the session view and wait for it to render.
     */
    async function navigateToSession(page: import('@playwright/test').Page, sid: string) {
        await installWsHooks(page);
        await gotoWithRetry(page, `/sessions/${sid}`);
        await page.waitForLoadState('networkidle');
        // Wait for the session view to render
        await expect(page.locator('.session-view')).toBeVisible({ timeout: 10_000 });
        // Give WebSocket time to connect through the patched constructor
        await page.waitForTimeout(500);
    }

    /* ------------------------------------------------------------------ */
    /*  Test 1: Approval dialog appears on approval_request WS message    */
    /* ------------------------------------------------------------------ */
    test('approval dialog appears on approval_request WebSocket message', async ({ page }) => {
        await navigateToSession(page, sessionId);

        await injectApprovalRequest(page, {
            sessionId,
            toolName: 'Bash',
            description: 'rm -rf /tmp/test',
            timeoutMs: 30000,
            createdAt: Date.now(),
        });

        // The overlay should appear with the correct ARIA role
        const overlay = page.locator('[role="alertdialog"]');
        await expect(overlay).toBeVisible({ timeout: 5000 });

        // Tool name "Bash" should be visible
        await expect(page.locator('.approval-dialog__tool')).toHaveText('Bash');

        // Description should be visible
        await expect(page.locator('.approval-dialog__description')).toHaveText('rm -rf /tmp/test');

        // Countdown timer should be displayed
        const timer = page.locator('.approval-dialog__timer');
        await expect(timer).toBeVisible();
        // Timer should show a number followed by "s"
        await expect(timer).toHaveText(/\d+s/);
    });

    /* ------------------------------------------------------------------ */
    /*  Test 2: Allow button sends approval_response and dismisses dialog */
    /* ------------------------------------------------------------------ */
    test('Allow button sends approval_response and dismisses dialog', async ({ page }) => {
        await navigateToSession(page, sessionId);

        // Clear previously captured sent messages
        await page.evaluate(() => {
            (window as unknown as TestWindow).__TEST_WS_SENT = [];
        });

        const requestId = await injectApprovalRequest(page, {
            sessionId,
            toolName: 'Bash',
            description: 'echo hello',
            timeoutMs: 30000,
            createdAt: Date.now(),
        });

        // Wait for dialog to appear
        const overlay = page.locator('[role="alertdialog"]');
        await expect(overlay).toBeVisible({ timeout: 5000 });

        // Click the Allow button
        await page.locator('.btn--allow').click();

        // Dialog should be dismissed
        await expect(overlay).not.toBeVisible({ timeout: 5000 });

        // Verify the WebSocket sent an approval_response with behavior: 'allow'
        const sentMessages = await page.evaluate(() => (window as unknown as TestWindow).__TEST_WS_SENT);
        const approvalMsg = sentMessages.find(
            (m: Record<string, unknown>) => m.type === 'approval_response' && m.requestId === requestId,
        );

        expect(approvalMsg).toBeTruthy();
        expect(approvalMsg.type).toBe('approval_response');
        expect(approvalMsg.requestId).toBe(requestId);
        expect(approvalMsg.behavior).toBe('allow');
    });

    /* ------------------------------------------------------------------ */
    /*  Test 3: Deny button sends denial and dismisses dialog             */
    /* ------------------------------------------------------------------ */
    test('Deny button sends denial and dismisses dialog', async ({ page }) => {
        await navigateToSession(page, sessionId);

        // Clear sent messages
        await page.evaluate(() => {
            (window as unknown as TestWindow).__TEST_WS_SENT = [];
        });

        const requestId = await injectApprovalRequest(page, {
            sessionId,
            toolName: 'Bash',
            description: 'rm -rf /',
            timeoutMs: 30000,
            createdAt: Date.now(),
        });

        // Wait for dialog to appear
        const overlay = page.locator('[role="alertdialog"]');
        await expect(overlay).toBeVisible({ timeout: 5000 });

        // Click the Deny button
        await page.locator('.btn--deny').click();

        // Dialog should be dismissed
        await expect(overlay).not.toBeVisible({ timeout: 5000 });

        // Verify the WebSocket sent an approval_response with behavior: 'deny'
        const sentMessages = await page.evaluate(() => (window as unknown as TestWindow).__TEST_WS_SENT);
        const denyMsg = sentMessages.find(
            (m: Record<string, unknown>) => m.type === 'approval_response' && m.requestId === requestId,
        );

        expect(denyMsg).toBeTruthy();
        expect(denyMsg.type).toBe('approval_response');
        expect(denyMsg.requestId).toBe(requestId);
        expect(denyMsg.behavior).toBe('deny');
    });

    /* ------------------------------------------------------------------ */
    /*  Test 4: Auto-deny on timeout                                      */
    /* ------------------------------------------------------------------ */
    test('auto-deny on timeout', async ({ page }) => {
        await navigateToSession(page, sessionId);

        // Clear sent messages
        await page.evaluate(() => {
            (window as unknown as TestWindow).__TEST_WS_SENT = [];
        });

        const requestId = await injectApprovalRequest(page, {
            sessionId,
            toolName: 'Bash',
            description: 'timeout test command',
            timeoutMs: 3000,
            createdAt: Date.now(),
        });

        // Dialog should appear
        const overlay = page.locator('[role="alertdialog"]');
        await expect(overlay).toBeVisible({ timeout: 5000 });

        // Wait for the countdown to reach 0 and the dialog to auto-dismiss.
        // With timeoutMs: 3000 and createdAt: now, it starts at ~3s and
        // ticks down every 1s. Allow up to 6s for the full cycle plus some margin.
        await expect(overlay).not.toBeVisible({ timeout: 8000 });

        // Verify that a deny response was emitted automatically
        const sentMessages = await page.evaluate(() => (window as unknown as TestWindow).__TEST_WS_SENT);
        const denyMsg = sentMessages.find(
            (m: Record<string, unknown>) => m.type === 'approval_response' && m.requestId === requestId,
        );

        expect(denyMsg).toBeTruthy();
        expect(denyMsg.behavior).toBe('deny');
    });

    /* ------------------------------------------------------------------ */
    /*  Test 5: Timer shows urgent styling when < 10 seconds              */
    /* ------------------------------------------------------------------ */
    test('timer shows urgent styling when < 10 seconds', async ({ page }) => {
        await navigateToSession(page, sessionId);

        await injectApprovalRequest(page, {
            sessionId,
            toolName: 'Bash',
            description: 'urgent timer test',
            timeoutMs: 8000,
            createdAt: Date.now(),
        });

        // Dialog should appear
        const overlay = page.locator('[role="alertdialog"]');
        await expect(overlay).toBeVisible({ timeout: 5000 });

        // With timeoutMs of 8000ms and createdAt: now, remainingSeconds starts at 8
        // which is < 10, so the urgent class should be applied immediately
        const timer = page.locator('.approval-dialog__timer');
        await expect(timer).toBeVisible();
        await expect(timer).toHaveClass(/approval-dialog__timer--urgent/, { timeout: 3000 });

        // Also verify the timer text shows a number < 10
        const timerText = await timer.textContent();
        const seconds = parseInt(timerText?.replace('s', '') ?? '0', 10);
        expect(seconds).toBeLessThanOrEqual(8);
        expect(seconds).toBeGreaterThan(0);
    });

    /* ------------------------------------------------------------------ */
    /*  Test 6: Allow button receives focus on dialog open (a11y)         */
    /* ------------------------------------------------------------------ */
    test('Allow button receives focus on dialog open', async ({ page }) => {
        await navigateToSession(page, sessionId);

        await injectApprovalRequest(page, {
            sessionId,
            toolName: 'Bash',
            description: 'focus test command',
            timeoutMs: 30000,
            createdAt: Date.now(),
        });

        // Wait for dialog
        const overlay = page.locator('[role="alertdialog"]');
        await expect(overlay).toBeVisible({ timeout: 5000 });

        // The Allow button should have focus.
        // The component uses setTimeout(() => allowBtn.focus()) in ngOnInit,
        // so we give it a moment to settle.
        const allowBtn = page.locator('.btn--allow');
        await expect(allowBtn).toBeFocused({ timeout: 5000 });
    });
});
