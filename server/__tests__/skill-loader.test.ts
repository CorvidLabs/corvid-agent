import { describe, test, expect } from 'bun:test';
import { join } from 'path';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import {
    parseSkillFrontmatter,
    discoverSkills,
    loadSkillBody,
    buildSkillDiscoveryPrompt,
    discoverProjectSkills,
    SKILL_DIRECTORY_NAMES,
} from '../mcp/skill-loader';

// ─── Frontmatter Parsing ────────────────────────────────────────────────────

describe('parseSkillFrontmatter', () => {
    test('parses valid frontmatter with name and description', () => {
        const content = `---
name: my-skill
description: A test skill that does things
---

# My Skill

Body content here.`;

        const result = parseSkillFrontmatter(content);
        expect(result).not.toBeNull();
        expect(result!.frontmatter.name).toBe('my-skill');
        expect(result!.frontmatter.description).toBe('A test skill that does things');
        expect(result!.body).toBe('# My Skill\n\nBody content here.');
    });

    test('returns null for missing frontmatter delimiters', () => {
        expect(parseSkillFrontmatter('no frontmatter here')).toBeNull();
    });

    test('returns null for missing closing delimiter', () => {
        expect(parseSkillFrontmatter('---\nname: test\n')).toBeNull();
    });

    test('returns null when name is missing', () => {
        const content = `---
description: A test skill
---
Body`;
        expect(parseSkillFrontmatter(content)).toBeNull();
    });

    test('returns null when description is missing', () => {
        const content = `---
name: test
---
Body`;
        expect(parseSkillFrontmatter(content)).toBeNull();
    });

    test('parses optional metadata fields', () => {
        const content = `---
name: my-skill
description: A test skill
author: CorvidLabs
version: "1.0"
---
Body`;

        const result = parseSkillFrontmatter(content);
        expect(result).not.toBeNull();
        expect(result!.frontmatter.metadata?.author).toBe('CorvidLabs');
        expect(result!.frontmatter.metadata?.version).toBe('1.0');
    });

    test('strips quotes from values', () => {
        const content = `---
name: "quoted-name"
description: 'single-quoted desc'
---
Body`;

        const result = parseSkillFrontmatter(content);
        expect(result).not.toBeNull();
        expect(result!.frontmatter.name).toBe('quoted-name');
        expect(result!.frontmatter.description).toBe('single-quoted desc');
    });

    test('handles CRLF line endings', () => {
        const content = '---\r\nname: test\r\ndescription: A test\r\n---\r\nBody';
        const result = parseSkillFrontmatter(content);
        expect(result).not.toBeNull();
        expect(result!.frontmatter.name).toBe('test');
    });
});

// ─── Directory Scanning ─────────────────────────────────────────────────────

describe('discoverSkills', () => {
    const tmpBase = mkdtempSync(join(tmpdir(), 'skill-loader-test-'));

    test('returns empty array for non-existent directory', () => {
        expect(discoverSkills('/nonexistent/path')).toEqual([]);
    });

    test('discovers skills in subdirectories with SKILL.md', () => {
        const skillsDir = join(tmpBase, 'discover-sub');
        mkdirSync(join(skillsDir, 'coding'), { recursive: true, mode: 0o700 });
        writeFileSync(join(skillsDir, 'coding', 'SKILL.md'), `---
name: coding
description: File operations and code execution
---
# Coding Skill
`, { mode: 0o600 });

        mkdirSync(join(skillsDir, 'search'), { recursive: true, mode: 0o700 });
        writeFileSync(join(skillsDir, 'search', 'SKILL.md'), `---
name: search
description: Web search and deep research
---
# Search Skill
`, { mode: 0o600 });

        const entries = discoverSkills(skillsDir);
        expect(entries.length).toBe(2);
        expect(entries.map(e => e.name).sort()).toEqual(['coding', 'search']);
    });

    test('discovers top-level markdown files as skills', () => {
        const skillsDir = join(tmpBase, 'discover-flat');
        mkdirSync(skillsDir, { recursive: true, mode: 0o700 });
        writeFileSync(join(skillsDir, 'git.md'), `---
name: git
description: Git workflows and branching
---
# Git Skill
`, { mode: 0o600 });

        const entries = discoverSkills(skillsDir);
        expect(entries.length).toBe(1);
        expect(entries[0].name).toBe('git');
    });

    test('skips README.md', () => {
        const skillsDir = join(tmpBase, 'discover-readme');
        mkdirSync(skillsDir, { recursive: true, mode: 0o700 });
        writeFileSync(join(skillsDir, 'README.md'), `---
name: readme
description: should be skipped
---
Not a skill.
`, { mode: 0o600 });

        const entries = discoverSkills(skillsDir);
        expect(entries.length).toBe(0);
    });

    test('skips files with invalid frontmatter', () => {
        const skillsDir = join(tmpBase, 'discover-invalid');
        mkdirSync(skillsDir, { recursive: true, mode: 0o700 });
        writeFileSync(join(skillsDir, 'bad.md'), 'No frontmatter here', { mode: 0o600 });

        const entries = discoverSkills(skillsDir);
        expect(entries.length).toBe(0);
    });

    // Cleanup
    test('cleanup tmp', () => {
        if (existsSync(tmpBase)) {
            rmSync(tmpBase, { recursive: true, force: true });
        }
        expect(true).toBe(true);
    });
});

// ─── Full Skill Loading ─────────────────────────────────────────────────────

describe('loadSkillBody', () => {
    const tmpBase = mkdtempSync(join(tmpdir(), 'skill-body-test-'));

    test('loads full skill body from disk', () => {
        const dir = join(tmpBase, 'load-body');
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        const filePath = join(dir, 'SKILL.md');
        writeFileSync(filePath, `---
name: test-skill
description: A test
---
# Full Body

Detailed instructions here.
`, { mode: 0o600 });

        const entry = {
            name: 'test-skill',
            description: 'A test',
            metadata: {},
            filePath,
        };

        const loaded = loadSkillBody(entry);
        expect(loaded).not.toBeNull();
        expect(loaded!.body).toContain('Full Body');
        expect(loaded!.body).toContain('Detailed instructions here.');
    });

    test('returns null for missing file', () => {
        const entry = {
            name: 'missing',
            description: 'Does not exist',
            metadata: {},
            filePath: '/nonexistent/SKILL.md',
        };

        expect(loadSkillBody(entry)).toBeNull();
    });

    // Cleanup
    test('cleanup tmp', () => {
        if (existsSync(tmpBase)) {
            rmSync(tmpBase, { recursive: true, force: true });
        }
        expect(true).toBe(true);
    });
});

// ─── Discovery Prompt ───────────────────────────────────────────────────────

describe('buildSkillDiscoveryPrompt', () => {
    test('returns empty string for no skills', () => {
        expect(buildSkillDiscoveryPrompt([])).toBe('');
    });

    test('builds markdown list of skills', () => {
        const entries = [
            { name: 'coding', description: 'File ops', metadata: {}, filePath: '/a' },
            { name: 'search', description: 'Web search', metadata: {}, filePath: '/b' },
        ];

        const prompt = buildSkillDiscoveryPrompt(entries);
        expect(prompt).toContain('## Available Skills');
        expect(prompt).toContain('**coding**');
        expect(prompt).toContain('**search**');
        expect(prompt).toContain('File ops');
        expect(prompt).toContain('Web search');
    });
});

// ─── Project Skills Discovery ───────────────────────────────────────────────

describe('discoverProjectSkills', () => {
    test('finds skills from the existing skills/ directory', () => {
        const projectRoot = join(import.meta.dir, '..', '..');
        const skills = discoverProjectSkills(projectRoot);
        // The project has a skills/ directory with many skills
        expect(skills.length).toBeGreaterThan(0);
        expect(skills.some(s => s.name === 'coding')).toBe(true);
    });
});

// ─── Constants ──────────────────────────────────────────────────────────────

describe('SKILL_DIRECTORY_NAMES', () => {
    test('includes .skills and skills', () => {
        expect(SKILL_DIRECTORY_NAMES).toContain('.skills');
        expect(SKILL_DIRECTORY_NAMES).toContain('skills');
    });
});
