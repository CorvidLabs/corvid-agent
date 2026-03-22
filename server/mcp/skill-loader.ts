/**
 * Skills-as-Markdown Loader.
 *
 * Discovers and loads skill files from `.skills/` directories so that AI
 * assistants can auto-discover agent capabilities described in natural language.
 *
 * Each skill is a markdown file with YAML frontmatter:
 *   ---
 *   name: my-skill
 *   description: Short description for discovery
 *   ---
 *   # Full skill body loaded on activation
 *
 * The loader uses progressive disclosure:
 * 1. On startup, scan the skills directory and parse only frontmatter (~100 tokens per skill).
 * 2. When a skill is activated (matched by name or trigger), load the full body.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../lib/logger';

const log = createLogger('SkillLoader');

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SkillFrontmatter {
    name: string;
    description: string;
    metadata?: Record<string, string>;
}

export interface SkillEntry {
    /** Skill name from frontmatter. */
    name: string;
    /** Short description for discovery/matching. */
    description: string;
    /** Optional metadata (author, version, etc). */
    metadata: Record<string, string>;
    /** Absolute path to the SKILL.md file. */
    filePath: string;
}

export interface LoadedSkill extends SkillEntry {
    /** Full markdown body (everything after frontmatter). */
    body: string;
}

// ─── Frontmatter Parsing ────────────────────────────────────────────────────

/**
 * Parse YAML frontmatter from a markdown string.
 * Returns the frontmatter fields and the body text after the closing `---`.
 * Returns null if frontmatter is invalid or missing required fields.
 */
export function parseSkillFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } | null {
    const normalized = content.replace(/\r\n/g, '\n');
    if (!normalized.startsWith('---\n')) return null;

    const endIdx = normalized.indexOf('\n---', 4);
    if (endIdx === -1) return null;

    const fmBlock = normalized.slice(4, endIdx);
    const body = normalized.slice(endIdx + 4).trim();

    // Simple YAML key-value parser (no nested objects needed)
    const fields: Record<string, string> = {};
    for (const line of fmBlock.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const key = line.slice(0, colonIdx).trim();
        let value = line.slice(colonIdx + 1).trim();
        // Strip optional quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        fields[key] = value;
    }

    if (!fields.name || !fields.description) return null;

    const metadata: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
        if (k !== 'name' && k !== 'description') {
            metadata[k] = v;
        }
    }

    return {
        frontmatter: { name: fields.name, description: fields.description, metadata },
        body,
    };
}

// ─── Directory Scanning ─────────────────────────────────────────────────────

/** Default skill directory names to search (relative to project root). */
export const SKILL_DIRECTORY_NAMES = ['.skills', 'skills'] as const;

/**
 * Discover skill entries from a directory.
 * Looks for subdirectories containing a SKILL.md file, or top-level .md files.
 *
 * @param skillsDir - Absolute path to the skills directory.
 * @returns Array of discovered skill entries (frontmatter only, body not loaded).
 */
export function discoverSkills(skillsDir: string): SkillEntry[] {
    if (!existsSync(skillsDir)) return [];

    const entries: SkillEntry[] = [];

    try {
        const items = readdirSync(skillsDir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = join(skillsDir, item.name);

            if (item.isDirectory()) {
                // Look for SKILL.md inside the subdirectory
                const skillFile = join(fullPath, 'SKILL.md');
                if (existsSync(skillFile)) {
                    const entry = parseSkillFile(skillFile);
                    if (entry) entries.push(entry);
                }
            } else if (item.isFile() && item.name.endsWith('.md') && item.name !== 'README.md') {
                // Top-level markdown files are also valid skills
                const entry = parseSkillFile(fullPath);
                if (entry) entries.push(entry);
            }
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn('Failed to scan skills directory', { dir: skillsDir, error: msg });
    }

    log.info(`Discovered ${entries.length} skills`, { dir: skillsDir, skills: entries.map(e => e.name).join(', ') });
    return entries;
}

/**
 * Parse a single SKILL.md file and return a SkillEntry (frontmatter only).
 */
function parseSkillFile(filePath: string): SkillEntry | null {
    try {
        const content = readFileSync(filePath, 'utf-8');
        const parsed = parseSkillFrontmatter(content);
        if (!parsed) {
            log.warn('Invalid skill frontmatter', { filePath });
            return null;
        }

        return {
            name: parsed.frontmatter.name,
            description: parsed.frontmatter.description,
            metadata: parsed.frontmatter.metadata ?? {},
            filePath,
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn('Failed to read skill file', { filePath, error: msg });
        return null;
    }
}

// ─── Full Skill Loading ─────────────────────────────────────────────────────

/**
 * Load a skill's full body from disk.
 * Used when a skill is activated (matched by user request).
 */
export function loadSkillBody(entry: SkillEntry): LoadedSkill | null {
    try {
        const content = readFileSync(entry.filePath, 'utf-8');
        const parsed = parseSkillFrontmatter(content);
        if (!parsed) return null;

        return { ...entry, body: parsed.body };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn('Failed to load skill body', { name: entry.name, error: msg });
        return null;
    }
}

/**
 * Build a discovery prompt listing all available skills.
 * This is appended to the system prompt so the AI knows what skills exist.
 * Only includes names and descriptions (~100 tokens per skill).
 */
export function buildSkillDiscoveryPrompt(entries: SkillEntry[]): string {
    if (entries.length === 0) return '';

    const lines = ['## Available Skills', ''];
    for (const entry of entries) {
        lines.push(`- **${entry.name}**: ${entry.description}`);
    }
    lines.push('');
    lines.push('When a user request matches a skill, load its full instructions for detailed guidance.');

    return lines.join('\n');
}

/**
 * Discover skills from all standard locations relative to a project root.
 * Checks .skills/ first, then falls back to skills/.
 */
export function discoverProjectSkills(projectRoot: string): SkillEntry[] {
    for (const dirName of SKILL_DIRECTORY_NAMES) {
        const dir = join(projectRoot, dirName);
        if (existsSync(dir) && statSync(dir).isDirectory()) {
            const skills = discoverSkills(dir);
            if (skills.length > 0) return skills;
        }
    }
    return [];
}
