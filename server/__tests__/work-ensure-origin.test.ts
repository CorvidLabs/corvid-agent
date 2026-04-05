import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../db/schema';
import { ensureOriginRemote } from '../work/session-lifecycle';

/**
 * Tests for ensureOriginRemote — ensures a git repo has an `origin` remote,
 * adding one from the project's gitUrl if missing.
 */

let db: Database;
let tempDir: string;

async function gitInit(dir: string) {
    Bun.spawnSync(['git', 'init'], { cwd: dir });
    Bun.spawnSync(['git', 'config', 'user.email', 'test@test.com'], { cwd: dir });
    Bun.spawnSync(['git', 'config', 'user.name', 'Test'], { cwd: dir });
    Bun.spawnSync(['git', 'commit', '--allow-empty', '-m', 'initial'], { cwd: dir });
}

function insertProject(id: string, gitUrl?: string) {
    db.query(
        "INSERT OR IGNORE INTO projects (id, name, working_dir, git_url) VALUES (?, ?, ?, ?)",
    ).run(id, `Project-${id}`, tempDir, gitUrl ?? null);
}

beforeEach(async () => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    tempDir = await mkdtemp(join(tmpdir(), 'ensure-origin-'));
    await gitInit(tempDir);
});

afterEach(async () => {
    db.close();
    await rm(tempDir, { recursive: true, force: true });
});

describe('ensureOriginRemote', () => {
    it('returns true when origin remote already exists', async () => {
        Bun.spawnSync(['git', 'remote', 'add', 'origin', 'https://github.com/test/repo.git'], { cwd: tempDir });
        insertProject('proj-1');

        const result = await ensureOriginRemote(db, 'proj-1', tempDir);
        expect(result).toBe(true);
    });

    it('adds origin from project gitUrl when missing', async () => {
        insertProject('proj-1', 'https://github.com/test/repo.git');

        const result = await ensureOriginRemote(db, 'proj-1', tempDir);
        expect(result).toBe(true);

        // Verify origin was added
        const proc = Bun.spawn(['git', 'remote', 'get-url', 'origin'], { cwd: tempDir, stdout: 'pipe', stderr: 'pipe' });
        const url = await new Response(proc.stdout).text();
        expect(url.trim()).toBe('https://github.com/test/repo.git');
    });

    it('returns false when no origin and no gitUrl configured', async () => {
        insertProject('proj-1'); // no gitUrl

        const result = await ensureOriginRemote(db, 'proj-1', tempDir);
        expect(result).toBe(false);
    });

    it('returns false when project does not exist', async () => {
        const result = await ensureOriginRemote(db, 'nonexistent', tempDir);
        expect(result).toBe(false);
    });
});
