/**
 * Checks for common cross-platform (Windows) incompatibilities in server code.
 * Run via: fledge run cross-platform-check
 */

import { Glob } from 'bun';

const PLATFORM_GUARD = /process\.platform|isWindows|win32/;

interface Check {
  pattern: RegExp;
  message: string;
  exclude?: RegExp[];
  contextLines?: number;
}

const WINDOWS_PATTERNS: Check[] = [
  {
    pattern: /process\.env\.HOME/,
    message: 'Use os.homedir() instead of process.env.HOME (undefined on Windows)',
    exclude: [/\.test\.ts$/, /\.spec\.ts$/],
  },
  {
    pattern: /Bun\.spawnSync\(\[['"](?:lsof|kill|ps)['"],/,
    message: 'Unix-only command without platform check (wrap with process.platform guard)',
    exclude: [/\.test\.ts$/, /\.spec\.ts$/],
    contextLines: 10,
  },
];

function hasPlatformGuard(lines: string[], lineIndex: number, range: number): boolean {
  const start = Math.max(0, lineIndex - range);
  const end = Math.min(lines.length, lineIndex + range);
  for (let i = start; i < end; i++) {
    if (PLATFORM_GUARD.test(lines[i])) return true;
  }
  return false;
}

let failures = 0;
const glob = new Glob('**/*.ts');

for await (const file of glob.scan({ cwd: 'server', absolute: false })) {
  if (file.includes('node_modules')) continue;

  const fullPath = `server/${file}`;
  const content = await Bun.file(fullPath).text();
  const lines = content.split('\n');

  for (const check of WINDOWS_PATTERNS) {
    if (check.exclude?.some((ex) => ex.test(file))) continue;

    for (let i = 0; i < lines.length; i++) {
      if (!check.pattern.test(lines[i])) continue;
      if (check.contextLines && hasPlatformGuard(lines, i, check.contextLines)) continue;

      console.error(`${fullPath}:${i + 1}: ${check.message}`);
      console.error(`  ${lines[i].trim()}`);
      failures++;
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} cross-platform issue(s) found.`);
  process.exit(1);
} else {
  console.log('No cross-platform issues found.');
}
