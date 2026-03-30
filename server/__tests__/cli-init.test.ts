import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InitOptions } from '../../cli/commands/init';

describe('CLI Init Command', () => {
  test('init module exports initCommand', async () => {
    const { initCommand } = await import('../../cli/commands/init');
    expect(typeof initCommand).toBe('function');
  });

  test('initCommand accepts InitOptions with mcp flag', async () => {
    const { initCommand } = await import('../../cli/commands/init');
    // Verify the function accepts InitOptions (type-level check)
    const fn: (opts?: InitOptions) => Promise<void> = initCommand;
    expect(typeof fn).toBe('function');
  });

  test('initCommand accepts InitOptions with full flag', async () => {
    const { initCommand } = await import('../../cli/commands/init');
    const fn: (opts?: InitOptions) => Promise<void> = initCommand;
    expect(typeof fn).toBe('function');
  });

  test('initCommand accepts InitOptions with yes flag', async () => {
    const { initCommand } = await import('../../cli/commands/init');
    const fn: (opts?: InitOptions) => Promise<void> = initCommand;
    expect(typeof fn).toBe('function');
  });

  test('InitOptions interface has expected shape', () => {
    // Type-level validation: all fields are optional booleans
    const opts: InitOptions = {};
    expect(opts.mcp).toBeUndefined();
    expect(opts.full).toBeUndefined();
    expect(opts.yes).toBeUndefined();

    const mcpOpts: InitOptions = { mcp: true };
    expect(mcpOpts.mcp).toBe(true);

    const fullOpts: InitOptions = { full: true, yes: true };
    expect(fullOpts.full).toBe(true);
    expect(fullOpts.yes).toBe(true);
  });
});

describe('Agent Skills', () => {
  const skillNames = [
    'algochat',
    'work-tasks',
    'scheduling',
    'memory',
    'github',
    'reputation',
    'orchestration',
    'flock-directory',
  ];

  test('skills directory exists with all skill subdirectories', () => {
    const skillsDir = join(import.meta.dir, '..', '..', 'skills');
    expect(existsSync(skillsDir)).toBe(true);

    for (const name of skillNames) {
      const skillPath = join(skillsDir, name, 'SKILL.md');
      expect(existsSync(skillPath)).toBe(true);
    }
  });

  test('each SKILL.md has required YAML frontmatter', () => {
    const skillsDir = join(import.meta.dir, '..', '..', 'skills');

    for (const name of skillNames) {
      const content = readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf-8').replace(/\r\n/g, '\n');
      // Check frontmatter delimiters
      expect(content.startsWith('---\n')).toBe(true);
      const endIdx = content.indexOf('---', 4);
      expect(endIdx).toBeGreaterThan(4);

      const frontmatter = content.slice(4, endIdx);
      // Required fields
      expect(frontmatter).toContain(`name: ${name}`);
      expect(frontmatter).toContain('description:');
    }
  });

  test('SKILL.md descriptions are substantive (>50 chars)', () => {
    const skillsDir = join(import.meta.dir, '..', '..', 'skills');

    for (const name of skillNames) {
      const content = readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf-8').replace(/\r\n/g, '\n');
      const endIdx = content.indexOf('---', 4);
      const frontmatter = content.slice(4, endIdx);
      const descMatch = frontmatter.match(/description:\s*(.+)/);
      expect(descMatch).toBeTruthy();
      expect(descMatch![1].length).toBeGreaterThan(50);
    }
  });

  test('copySkills copies to .claude/skills/', () => {
    const { copySkills } = require('../../cli/commands/init');
    const tmpDir = mkdtempSync(join(tmpdir(), 'corvid-skills-test-'));
    mkdirSync(join(tmpDir, '.claude'), { recursive: true });

    try {
      copySkills(tmpDir);

      // Verify skills were copied
      for (const name of skillNames) {
        const skillPath = join(tmpDir, '.claude', 'skills', name, 'SKILL.md');
        expect(existsSync(skillPath)).toBe(true);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('skills README exists', () => {
    const readmePath = join(import.meta.dir, '..', '..', 'skills', 'README.md');
    expect(existsSync(readmePath)).toBe(true);
    const content = readFileSync(readmePath, 'utf-8');
    expect(content).toContain('Agent Skills');
  });
});

describe('VibeKit Integration', () => {
  test('smart-contracts skill file exists with valid frontmatter', () => {
    const skillPath = join(import.meta.dir, '..', '..', 'skills', 'smart-contracts', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);

    const content = readFileSync(skillPath, 'utf-8').replaceAll('\r\n', '\n');
    expect(content.startsWith('---\n')).toBe(true);
    expect(content).toContain('name: smart-contracts');
    expect(content).toContain('description:');

    // Should reference VibeKit tools
    expect(content).toContain('appDeploy');
    expect(content).toContain('createAsset');
    expect(content).toContain('vibekit');
  });

  test('vibekit integration doc exists', () => {
    const docPath = join(import.meta.dir, '..', '..', 'docs', 'vibekit-integration.md');
    expect(existsSync(docPath)).toBe(true);

    const content = readFileSync(docPath, 'utf-8');
    expect(content).toContain('VibeKit');
    expect(content).toContain('corvid-agent');
    expect(content).toContain('mcpServers');
  });
});

describe('bin/corvid-agent.mjs shim', () => {
  test('shim file exists and is executable', async () => {
    const { existsSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const shimPath = join(import.meta.dir, '..', '..', 'bin', 'corvid-agent.mjs');
    expect(existsSync(shimPath)).toBe(true);
    // Check executable bit (owner) — skip on Windows where Unix permissions don't apply
    if (process.platform !== 'win32') {
      const stat = statSync(shimPath);
      expect(stat.mode & 0o100).toBeTruthy();
    }
  });

  test('shim has correct shebang', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const shimPath = join(import.meta.dir, '..', '..', 'bin', 'corvid-agent.mjs');
    const content = readFileSync(shimPath, 'utf-8');
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  test('package.json bin points to shim', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const pkgPath = join(import.meta.dir, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    expect(pkg.bin['corvid-agent']).toBe('./bin/corvid-agent.mjs');
  });
});
