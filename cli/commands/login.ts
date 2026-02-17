/**
 * CLI login command — Device authorization flow for CorvidAgent Cloud.
 *
 * Usage: corvid-agent login [--server URL]
 *
 * Opens a browser for authentication, polls for the token, and saves
 * it to the CLI config.
 */
import { loadConfig, updateConfig } from '../config';
import { CorvidClient } from '../client';
import { c, Spinner } from '../render';

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 150; // 5 minutes at 2s intervals

interface DeviceAuthResponse {
    deviceCode: string;
    userCode: string;
    verificationUrl: string;
    expiresIn: number;
    interval: number;
}

interface TokenResponse {
    accessToken: string;
    tenantId: string;
    tenantName: string;
    email: string;
}

export async function loginCommand(serverUrl?: string): Promise<void> {
    const config = loadConfig();
    const server = serverUrl ?? config.serverUrl;

    console.log(`${c.bold}CorvidAgent Cloud Login${c.reset}`);
    console.log();

    // Step 1: Initiate device auth flow
    const client = new CorvidClient({ ...config, serverUrl: server });
    let authResponse: DeviceAuthResponse;

    try {
        authResponse = await client.post<DeviceAuthResponse>('/api/auth/device', {});
    } catch (err) {
        console.error(c.red(`Failed to initiate login: ${err instanceof Error ? err.message : String(err)}`));
        console.error(`${c.dim}Is the server running at ${server}?${c.reset}`);
        process.exit(1);
    }

    // Step 2: Display user code and URL
    console.log(`Open this URL in your browser:`);
    console.log();
    console.log(`  ${c.cyan(`${c.bold}${authResponse.verificationUrl}${c.reset}`)}`);
    console.log();
    console.log(`Enter this code when prompted:`);
    console.log();
    console.log(`  ${c.yellow(`${c.bold}${authResponse.userCode}${c.reset}`)}`);
    console.log();

    // Try to open the browser automatically
    try {
        const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
        Bun.spawn([openCmd, authResponse.verificationUrl], {
            stdout: 'ignore',
            stderr: 'ignore',
        });
    } catch {
        // Silently fail — user can open manually
    }

    // Step 3: Poll for token
    const spinner = new Spinner('Waiting for authorization...');
    spinner.start();

    const interval = Math.max(authResponse.interval * 1000, POLL_INTERVAL_MS);
    let tokenResponse: TokenResponse | null = null;

    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        await new Promise((resolve) => setTimeout(resolve, interval));

        try {
            tokenResponse = await client.post<TokenResponse>('/api/auth/device/token', {
                deviceCode: authResponse.deviceCode,
            });
            break;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('authorization_pending')) {
                continue;
            }
            if (message.includes('slow_down')) {
                await new Promise((resolve) => setTimeout(resolve, 5_000));
                continue;
            }
            if (message.includes('expired') || message.includes('denied')) {
                spinner.stop();
                console.error(c.red(`\nAuthorization ${message.includes('expired') ? 'expired' : 'denied'}.`));
                process.exit(1);
            }
            // Unknown error — continue polling
        }
    }

    spinner.stop();

    if (!tokenResponse) {
        console.error(c.red('\nAuthorization timed out. Please try again.'));
        process.exit(1);
    }

    // Step 4: Save token
    updateConfig({ authToken: tokenResponse.accessToken });

    console.log(c.green('\nLogin successful!'));
    console.log();
    console.log(`  Tenant:  ${c.bold}${tokenResponse.tenantName}${c.reset}`);
    console.log(`  Email:   ${tokenResponse.email}`);
    console.log(`  Server:  ${server}`);
    console.log();
    console.log(`${c.dim}Token saved to ~/.corvid/config.json${c.reset}`);
}

/**
 * CLI logout command — removes saved token.
 */
export async function logoutCommand(): Promise<void> {
    updateConfig({ authToken: null });
    console.log(c.green('Logged out. Token removed from config.'));
}
