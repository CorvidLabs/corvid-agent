/**
 * Integration tests for CodebaseHealthCollector.
 *
 * Exercises the collect() method against a temp directory to cover
 * the private countTodos() and findLargeFiles() shell commands.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodebaseHealthCollector } from '../improvement/health-collector';

// Use system temp dir (not inside the repo) so tsc/bun-test don't walk up
// to the project's tsconfig.json / bunfig.toml and scan the whole codebase.
const TMP_DIR = join(tmpdir(), `corvid-health-test-${process.pid}`);

beforeAll(() => {
  // Create minimal directory structure matching what the collector expects
  for (const dir of ['server', 'client', 'shared', 'node_modules/@fake']) {
    mkdirSync(join(TMP_DIR, dir), { recursive: true });
  }

  // A TS file with a TODO (should be counted)
  writeFileSync(
    join(TMP_DIR, 'server/example.ts'),
    ['// TODO: fix this later', '// FIXME: also broken', 'export const x = 1;'].join('\n'),
  );

  // A large TS file (should be detected)
  const bigContent = Array.from({ length: 600 }, (_, i) => `export const line${i} = ${i};`).join('\n');
  writeFileSync(join(TMP_DIR, 'server/big-file.ts'), bigContent);

  // A TS file inside node_modules (should be EXCLUDED by the new --exclude-dir flag)
  writeFileSync(
    join(TMP_DIR, 'node_modules/@fake/index.ts'),
    '// TODO: this should not be counted\nexport const y = 2;\n',
  );

  // Also add node_modules inside server/ to test the find -prune
  mkdirSync(join(TMP_DIR, 'server/node_modules/fake-pkg'), { recursive: true });
  writeFileSync(
    join(TMP_DIR, 'server/node_modules/fake-pkg/index.ts'),
    Array.from({ length: 800 }, (_, i) => `// line ${i}`).join('\n'),
  );

  // Add a minimal package.json so bun commands have context
  writeFileSync(join(TMP_DIR, 'package.json'), '{}');
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

const isWindows = process.platform === 'win32';

describe('CodebaseHealthCollector.collect() integration', () => {
  test.skipIf(isWindows)(
    'collects todos and large files from temp directory',
    async () => {
      const collector = new CodebaseHealthCollector();
      const metrics = await collector.collect(TMP_DIR);

      // TODO/FIXME counts should reflect server/example.ts but NOT node_modules
      expect(metrics.todoCount).toBe(1); // 1 TODO in server/example.ts
      expect(metrics.fixmeCount).toBe(1); // 1 FIXME in server/example.ts

      // Large files should include big-file.ts but NOT server/node_modules files
      const largeFileNames = metrics.largeFiles.map((f) => f.file);
      expect(largeFileNames.some((f) => f.includes('big-file.ts'))).toBe(true);
      expect(largeFileNames.every((f) => !f.includes('node_modules'))).toBe(true);
    },
    30_000,
  );
});
