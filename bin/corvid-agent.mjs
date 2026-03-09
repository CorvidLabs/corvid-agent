#!/usr/bin/env node

// npx/bunx-compatible entry point for corvid-agent CLI.
// The CLI uses Bun-specific APIs (Bun.spawn, Bun.sleep), so we delegate
// to bun if available. If only node is available, we provide helpful
// instructions for commands that require bun.

import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliEntry = join(__dirname, '..', 'cli', 'index.ts');

function hasBun() {
    try {
        execFileSync('bun', ['--version'], { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

if (hasBun()) {
    // Delegate to bun — passes all args through
    try {
        execFileSync('bun', [cliEntry, ...process.argv.slice(2)], {
            stdio: 'inherit',
            env: process.env,
        });
    } catch (err) {
        // execFileSync throws on non-zero exit, which is fine — stdio is inherited
        if (err && typeof err === 'object' && 'status' in err) {
            process.exit(err.status ?? 1);
        }
        process.exit(1);
    }
} else {
    console.error(
        'corvid-agent requires Bun (https://bun.sh) to run.\n' +
        'Install it with: curl -fsSL https://bun.sh/install | bash\n' +
        'Then run: bun corvid-agent ' + process.argv.slice(2).join(' '),
    );
    process.exit(1);
}
