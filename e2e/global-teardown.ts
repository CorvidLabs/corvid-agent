import { unlinkSync, existsSync } from 'node:fs';

const E2E_DB = 'e2e-test.db';

export default function globalTeardown() {
    for (const file of [E2E_DB, `${E2E_DB}-wal`, `${E2E_DB}-shm`]) {
        if (existsSync(file)) {
            try {
                unlinkSync(file);
            } catch {
                // best-effort cleanup
            }
        }
    }
}
