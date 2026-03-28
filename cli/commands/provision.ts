import { writeFileSync, mkdirSync, openSync, closeSync, constants as fsConstants } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { c, printError, printSuccess, printWarning, printHeader } from '../render';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProvisionOptions {
    name: string;
    role?: string;
    network?: string;
    outDir?: string;
}

// ─── Role Templates ─────────────────────────────────────────────────────────

interface RoleTemplate {
    description: string;
    systemPrompt: string;
    capabilities: string[];
    model: string;
}

const ROLE_TEMPLATES: Record<string, RoleTemplate> = {
    developer: {
        description: 'Code review, implementation, and development tasks',
        systemPrompt: 'You are a developer agent. You help with code review, implementation, debugging, and development tasks. Be precise, follow best practices, and write clean code.',
        capabilities: ['code', 'review', 'test', 'algochat'],
        model: 'claude-sonnet-4-6',
    },
    reviewer: {
        description: 'Code review and quality assurance specialist',
        systemPrompt: 'You are a code review agent. You focus on code quality, security, performance, and best practices. Provide constructive, actionable feedback.',
        capabilities: ['review', 'test', 'algochat'],
        model: 'claude-sonnet-4-6',
    },
    assistant: {
        description: 'General-purpose conversational assistant',
        systemPrompt: 'You are a helpful assistant agent. You answer questions, provide information, and help with general tasks. Be concise and accurate.',
        capabilities: ['algochat'],
        model: 'claude-haiku-4-5',
    },
    security: {
        description: 'Security auditing and vulnerability analysis',
        systemPrompt: 'You are a security auditing agent. You analyze code for vulnerabilities, review security configurations, and recommend hardening measures. Follow OWASP guidelines.',
        capabilities: ['code', 'review', 'algochat'],
        model: 'claude-sonnet-4-6',
    },
};

// ─── Provision Command ──────────────────────────────────────────────────────

export async function provisionCommand(options: ProvisionOptions): Promise<void> {
    const { name, role, network = 'testnet', outDir } = options;

    // Validate name
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
        printError('Agent name must be 1-64 alphanumeric characters, hyphens, or underscores');
        process.exit(1);
    }

    // Validate network
    const validNetworks = ['localnet', 'testnet', 'mainnet'];
    if (!validNetworks.includes(network)) {
        printError(`Network must be one of: ${validNetworks.join(', ')}`);
        process.exit(1);
    }

    // Validate role
    if (role && !ROLE_TEMPLATES[role]) {
        printError(`Unknown role: ${role}. Available: ${Object.keys(ROLE_TEMPLATES).join(', ')}`);
        process.exit(1);
    }

    printHeader(`Provisioning agent: ${name}`);

    // Step 1: Generate Algorand account
    console.log(`${c.cyan('1.')} Generating Algorand identity...`);
    const algosdk = (await import('algosdk')).default;
    const account = algosdk.generateAccount();
    const mnemonic = algosdk.secretKeyToMnemonic(account.sk);
    const address = account.addr.toString();
    console.log(`   Address: ${c.green(address)}`);

    // Step 2: Generate wallet encryption key
    console.log(`${c.cyan('2.')} Generating wallet encryption key...`);
    const walletKey = randomBytes(32).toString('hex');

    // Step 3: Generate API key
    console.log(`${c.cyan('3.')} Generating API key...`);
    const apiKey = randomBytes(24).toString('base64url');

    // Step 4: Build .env content
    console.log(`${c.cyan('4.')} Building configuration...`);
    const template = role ? ROLE_TEMPLATES[role] : undefined;
    const envContent = buildEnvFile({ name, mnemonic, walletKey, apiKey, network, template });

    // Step 5: Write output
    const outputDir = outDir ?? join(process.cwd(), `corvid-agent-${name}`);
    mkdirSync(outputDir, { recursive: true });

    const envPath = join(outputDir, '.env');
    try {
        const fd = openSync(envPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600);
        try {
            writeFileSync(fd, envContent);
        } finally {
            closeSync(fd);
        }
    } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'EEXIST') {
            printError(`${envPath} already exists. Use --out-dir to specify a different directory.`);
            process.exit(1);
        }
        throw err;
    }
    printSuccess(`Config written to ${envPath}`);

    // Step 6: Write identity card (non-secret metadata for sharing)
    const identityCard = buildIdentityCard({ name, address, network, role, template });
    const cardPath = join(outputDir, 'identity.json');
    writeFileSync(cardPath, JSON.stringify(identityCard, null, 2) + '\n', { mode: 0o644 });
    printSuccess(`Identity card written to ${cardPath}`);

    // Step 7: Print next steps
    console.log('');
    printHeader('Next steps');
    console.log(`  ${c.cyan('1.')} Clone corvid-agent into ${c.bold}${outputDir}${c.reset}:`);
    console.log(`     ${c.gray('git clone https://github.com/CorvidLabs/corvid-agent.git ' + outputDir + '/app')}`);
    console.log('');
    console.log(`  ${c.cyan('2.')} Copy the generated .env into the cloned repo:`);
    console.log(`     ${c.gray(`cp ${envPath} ${outputDir}/app/.env`)}`);
    console.log('');
    console.log(`  ${c.cyan('3.')} Install dependencies and start:`);
    console.log(`     ${c.gray(`cd ${outputDir}/app && bun install && bun run server/index.ts`)}`);
    console.log('');
    console.log(`  ${c.cyan('4.')} The agent will auto-register in the Flock Directory on startup.`);
    console.log(`     Other agents can discover it via AlgoChat at: ${c.green(address)}`);
    console.log('');

    if (network === 'testnet') {
        printWarning('Fund the wallet with testnet ALGO before starting.');
        console.log(`     ${c.gray(`Visit https://bank.testnet.algorand.network/ and send to ${address}`)}`);
        console.log('');
    } else if (network === 'mainnet') {
        printWarning('Fund the wallet with real ALGO before starting. Minimum ~0.3 ALGO for on-chain operations.');
        console.log('');
    }

    console.log(`  ${c.yellow('!')} Keep the .env file secure — it contains the wallet mnemonic and encryption keys.`);
    console.log('');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface EnvBuildOptions {
    name: string;
    mnemonic: string;
    walletKey: string;
    apiKey: string;
    network: string;
    template?: RoleTemplate;
}

function buildEnvFile(opts: EnvBuildOptions): string {
    const lines: string[] = [
        '# =============================================================================',
        `# corvid-agent instance: ${opts.name}`,
        `# Generated by: corvid-agent provision`,
        `# Network: ${opts.network}`,
        '# =============================================================================',
        '',
        '# --- Algorand / AlgoChat ---',
        `ALGOCHAT_MNEMONIC=${opts.mnemonic}`,
        `ALGORAND_NETWORK=${opts.network}`,
        '',
        '# --- Wallet Security ---',
        `WALLET_ENCRYPTION_KEY=${opts.walletKey}`,
        '',
        '# --- Server ---',
        'PORT=3000',
        'BIND_HOST=127.0.0.1',
        `API_KEY=${opts.apiKey}`,
        '',
        '# --- Agent Identity ---',
        `AGENT_NAME=${opts.name}`,
    ];

    if (opts.template) {
        lines.push(`AGENT_DESCRIPTION=${opts.template.description}`);
        lines.push(`AGENT_MODEL=${opts.template.model}`);
        lines.push(`AGENT_CAPABILITIES=${opts.template.capabilities.join(',')}`);
        lines.push('');
        lines.push('# --- System Prompt ---');
        lines.push(`AGENT_SYSTEM_PROMPT=${opts.template.systemPrompt}`);
    }

    lines.push('');
    lines.push('# --- Flock Directory ---');
    lines.push('# Auto-registers on startup. Set FLOCK_DIRECTORY_ENABLED=false to disable.');
    lines.push('# FLOCK_DIRECTORY_ENABLED=true');
    lines.push('');

    return lines.join('\n') + '\n';
}

interface IdentityCardOptions {
    name: string;
    address: string;
    network: string;
    role?: string;
    template?: RoleTemplate;
}

function buildIdentityCard(opts: IdentityCardOptions): Record<string, unknown> {
    return {
        name: opts.name,
        address: opts.address,
        network: opts.network,
        role: opts.role ?? 'custom',
        capabilities: opts.template?.capabilities ?? ['algochat'],
        description: opts.template?.description ?? `corvid-agent instance: ${opts.name}`,
        provisionedAt: new Date().toISOString(),
    };
}

// ─── Available Roles ────────────────────────────────────────────────────────

export function listRoles(): void {
    printHeader('Available agent roles');
    for (const [name, template] of Object.entries(ROLE_TEMPLATES)) {
        console.log(`  ${c.cyan(name.padEnd(12))} ${template.description}`);
        console.log(`  ${' '.repeat(12)} Model: ${c.gray(template.model)}  Capabilities: ${c.gray(template.capabilities.join(', '))}`);
        console.log('');
    }
}
