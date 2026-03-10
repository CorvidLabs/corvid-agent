import { unlinkSync, existsSync } from 'node:fs';

const E2E_DB = process.env.DATABASE_PATH || 'e2e-test.db';

export default function globalTeardown(): void {
    for (const file of [E2E_DB, `${E2E_DB}-wal`, `${E2E_DB}-shm`]) {
        try {
            if (existsSync(file)) {
                unlinkSync(file);
            }
        } catch (err) {
            console.warn(`[e2e teardown] Failed to remove ${file}:`, (err as Error).message);
        }
    }
}
