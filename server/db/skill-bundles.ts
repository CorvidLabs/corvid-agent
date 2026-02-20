import type { Database } from 'bun:sqlite';
import type { SkillBundle, CreateSkillBundleInput, UpdateSkillBundleInput } from '../../shared/types';

interface BundleRow {
    id: string;
    name: string;
    description: string;
    tools: string;
    prompt_additions: string;
    preset: number;
    created_at: string;
    updated_at: string;
}

function rowToBundle(row: BundleRow): SkillBundle {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        tools: JSON.parse(row.tools),
        promptAdditions: row.prompt_additions,
        preset: row.preset === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// ─── Bundle CRUD ─────────────────────────────────────────────────────────────

export function listBundles(db: Database): SkillBundle[] {
    const rows = db.query('SELECT * FROM skill_bundles ORDER BY preset DESC, name ASC').all() as BundleRow[];
    return rows.map(rowToBundle);
}

export function getBundle(db: Database, id: string): SkillBundle | null {
    const row = db.query('SELECT * FROM skill_bundles WHERE id = ?').get(id) as BundleRow | null;
    return row ? rowToBundle(row) : null;
}

export function createBundle(db: Database, input: CreateSkillBundleInput): SkillBundle {
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO skill_bundles (id, name, description, tools, prompt_additions)
         VALUES (?, ?, ?, ?, ?)`
    ).run(
        id,
        input.name,
        input.description ?? '',
        JSON.stringify(input.tools ?? []),
        input.promptAdditions ?? '',
    );
    return getBundle(db, id)!;
}

export function updateBundle(db: Database, id: string, input: UpdateSkillBundleInput): SkillBundle | null {
    const existing = getBundle(db, id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
        fields.push('name = ?');
        values.push(input.name);
    }
    if (input.description !== undefined) {
        fields.push('description = ?');
        values.push(input.description);
    }
    if (input.tools !== undefined) {
        fields.push('tools = ?');
        values.push(JSON.stringify(input.tools));
    }
    if (input.promptAdditions !== undefined) {
        fields.push('prompt_additions = ?');
        values.push(input.promptAdditions);
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);
    db.query(`UPDATE skill_bundles SET ${fields.join(', ')} WHERE id = ?`).run(...(values as string[]));
    return getBundle(db, id);
}

export function deleteBundle(db: Database, id: string): boolean {
    const existing = getBundle(db, id);
    if (!existing) return false;
    if (existing.preset) return false; // Cannot delete preset bundles

    db.query('DELETE FROM skill_bundles WHERE id = ?').run(id);
    return true;
}

// ─── Agent-Bundle Assignments ────────────────────────────────────────────────

export function getAgentBundles(db: Database, agentId: string): SkillBundle[] {
    const rows = db.query(
        `SELECT sb.* FROM skill_bundles sb
         INNER JOIN agent_skills as2 ON sb.id = as2.bundle_id
         WHERE as2.agent_id = ?
         ORDER BY as2.sort_order ASC`
    ).all(agentId) as BundleRow[];
    return rows.map(rowToBundle);
}

export function assignBundle(db: Database, agentId: string, bundleId: string, sortOrder: number = 0): boolean {
    const bundle = getBundle(db, bundleId);
    if (!bundle) return false;

    db.query(
        `INSERT OR REPLACE INTO agent_skills (agent_id, bundle_id, sort_order) VALUES (?, ?, ?)`
    ).run(agentId, bundleId, sortOrder);
    return true;
}

export function unassignBundle(db: Database, agentId: string, bundleId: string): boolean {
    const result = db.query(
        'DELETE FROM agent_skills WHERE agent_id = ? AND bundle_id = ?'
    ).run(agentId, bundleId);
    return result.changes > 0;
}

// ─── Tool and Prompt Resolution ──────────────────────────────────────────────

/**
 * Resolve the effective tool permissions for an agent by merging base permissions
 * with tools from assigned skill bundles.
 */
export function resolveAgentTools(db: Database, agentId: string, basePermissions: string[] | null): string[] | null {
    const bundles = getAgentBundles(db, agentId);
    if (bundles.length === 0) return basePermissions;

    const bundleTools = new Set<string>();
    for (const bundle of bundles) {
        for (const tool of bundle.tools) {
            bundleTools.add(tool);
        }
    }

    if (bundleTools.size === 0) return basePermissions;

    if (basePermissions === null) {
        // No base permissions means "all default tools" — add bundle tools
        return [...bundleTools];
    }

    // Merge: base + bundle tools
    const merged = new Set(basePermissions);
    for (const tool of bundleTools) {
        merged.add(tool);
    }
    return [...merged];
}

/**
 * Resolve all prompt additions from assigned skill bundles, concatenated.
 */
export function resolveAgentPromptAdditions(db: Database, agentId: string): string {
    const bundles = getAgentBundles(db, agentId);
    if (bundles.length === 0) return '';

    const additions = bundles
        .map(b => b.promptAdditions)
        .filter(Boolean);

    return additions.join('\n\n');
}

// ─── Project-Bundle Assignments ─────────────────────────────────────────────

export function getProjectBundles(db: Database, projectId: string): SkillBundle[] {
    const rows = db.query(
        `SELECT sb.* FROM skill_bundles sb
         INNER JOIN project_skills ps ON sb.id = ps.bundle_id
         WHERE ps.project_id = ?
         ORDER BY ps.sort_order ASC`
    ).all(projectId) as BundleRow[];
    return rows.map(rowToBundle);
}

export function assignProjectBundle(db: Database, projectId: string, bundleId: string, sortOrder: number = 0): boolean {
    const bundle = getBundle(db, bundleId);
    if (!bundle) return false;

    db.query(
        `INSERT OR REPLACE INTO project_skills (project_id, bundle_id, sort_order) VALUES (?, ?, ?)`
    ).run(projectId, bundleId, sortOrder);
    return true;
}

export function unassignProjectBundle(db: Database, projectId: string, bundleId: string): boolean {
    const result = db.query(
        'DELETE FROM project_skills WHERE project_id = ? AND bundle_id = ?'
    ).run(projectId, bundleId);
    return result.changes > 0;
}

/**
 * Resolve the effective tool permissions by merging base permissions
 * with tools from project-level skill bundles.
 */
export function resolveProjectTools(db: Database, projectId: string, basePermissions: string[] | null): string[] | null {
    const bundles = getProjectBundles(db, projectId);
    if (bundles.length === 0) return basePermissions;

    const bundleTools = new Set<string>();
    for (const bundle of bundles) {
        for (const tool of bundle.tools) {
            bundleTools.add(tool);
        }
    }

    if (bundleTools.size === 0) return basePermissions;

    if (basePermissions === null) {
        return [...bundleTools];
    }

    const merged = new Set(basePermissions);
    for (const tool of bundleTools) {
        merged.add(tool);
    }
    return [...merged];
}

/**
 * Resolve all prompt additions from project-level skill bundles, concatenated.
 */
export function resolveProjectPromptAdditions(db: Database, projectId: string): string {
    const bundles = getProjectBundles(db, projectId);
    if (bundles.length === 0) return '';

    const additions = bundles
        .map(b => b.promptAdditions)
        .filter(Boolean);

    return additions.join('\n\n');
}
