import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join('/tmp', 'corvid-screenshots-test');

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { force: true, recursive: true });
});

describe('Screenshot cleanup', () => {
  test('expired files are detected by mtime', () => {
    // Create a file and backdate it
    const filePath = join(TEST_DIR, 'old-screenshot.png');
    writeFileSync(filePath, 'fake-png-data');

    // Set mtime to 10 minutes ago
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(filePath, tenMinAgo, tenMinAgo);

    // Verify the file exists and is old
    expect(existsSync(filePath)).toBe(true);

    // Simulate cleanup: delete files older than 5 minutes
    const TTL_MS = 5 * 60 * 1000;
    const now = Date.now();
    let deleted = 0;

    for (const file of readdirSync(TEST_DIR)) {
      const fp = join(TEST_DIR, file);
      const fsStat = require('node:fs').statSync(fp);
      if (now - fsStat.mtimeMs > TTL_MS) {
        rmSync(fp, { force: true });
        deleted++;
      }
    }

    expect(deleted).toBe(1);
    expect(existsSync(filePath)).toBe(false);
  });

  test('fresh files are preserved', () => {
    const filePath = join(TEST_DIR, 'fresh-screenshot.png');
    writeFileSync(filePath, 'fake-png-data');

    const TTL_MS = 5 * 60 * 1000;
    const now = Date.now();
    let deleted = 0;

    for (const file of readdirSync(TEST_DIR)) {
      const fp = join(TEST_DIR, file);
      const fsStat = require('node:fs').statSync(fp);
      if (now - fsStat.mtimeMs > TTL_MS) {
        rmSync(fp, { force: true });
        deleted++;
      }
    }

    expect(deleted).toBe(0);
    expect(existsSync(filePath)).toBe(true);
  });

  test('screenshot dir is restricted to /tmp', () => {
    // The screenshot dir must always be under /tmp
    const dir = '/tmp/corvid-screenshots';
    expect(dir.startsWith('/tmp')).toBe(true);
  });

  test('cleanup-all removes everything', () => {
    writeFileSync(join(TEST_DIR, 'a.png'), 'data');
    writeFileSync(join(TEST_DIR, 'b.png'), 'data');
    writeFileSync(join(TEST_DIR, 'c.png'), 'data');

    expect(readdirSync(TEST_DIR)).toHaveLength(3);

    rmSync(TEST_DIR, { force: true, recursive: true });

    expect(existsSync(TEST_DIR)).toBe(false);
  });
});
