import type { Database } from 'bun:sqlite';
import type { AgentVariant, CreateVariantInput, UpdateVariantInput, AgentVariantAssignment } from '../../shared/types';
import { assignPersona, unassignPersona } from './personas';

interface VariantRow {
    id: string;
    name: string;
    description: string;
    skill_bundle_ids: string;
    persona_ids: string;
    preset: number;
    created_at: string;
    updated_at: string;
}

interface AssignmentRow {
    agent_id: string;
    variant_id: string;
    created_at: string;
}

function rowToVariant(row: VariantRow): AgentVariant {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        skillBundleIds: JSON.parse(row.skill_bundle_ids),
        personaIds: JSON.parse(row.persona_ids),
        preset: row.preset === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// ─── Variant CRUD ─────────────────────────────────────────────────────────────

export function listVariants(db: Database): AgentVariant[] {
    const rows = db.query('SELECT * FROM agent_variants ORDER BY name ASC').all() as VariantRow[];
    return rows.map(rowToVariant);
}

export function getVariant(db: Database, id: string): AgentVariant | null {
    const row = db.query('SELECT * FROM agent_variants WHERE id = ?').get(id) as VariantRow | null;
    return row ? rowToVariant(row) : null;
}

export function createVariant(db: Database, input: CreateVariantInput): AgentVariant {
    const id = crypto.randomUUID();
    db.query(
        `INSERT INTO agent_variants (id, name, description, skill_bundle_ids, persona_ids, preset)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
        id,
        input.name,
        input.description ?? '',
        JSON.stringify(input.skillBundleIds ?? []),
        JSON.stringify(input.personaIds ?? []),
        input.preset ? 1 : 0,
    );
    return getVariant(db, id)!;
}

export function updateVariant(db: Database, id: string, input: UpdateVariantInput): AgentVariant | null {
    const existing = getVariant(db, id);
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
    if (input.skillBundleIds !== undefined) {
        fields.push('skill_bundle_ids = ?');
        values.push(JSON.stringify(input.skillBundleIds));
    }
    if (input.personaIds !== undefined) {
        fields.push('persona_ids = ?');
        values.push(JSON.stringify(input.personaIds));
    }
    if (input.preset !== undefined) {
        fields.push('preset = ?');
        values.push(input.preset ? 1 : 0);
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);
    db.query(`UPDATE agent_variants SET ${fields.join(', ')} WHERE id = ?`).run(...(values as string[]));
    return getVariant(db, id);
}

export function deleteVariant(db: Database, id: string): boolean {
    const result = db.query('DELETE FROM agent_variants WHERE id = ?').run(id);
    return result.changes > 0;
}

// ─── Agent-Variant Assignments ────────────────────────────────────────────────

export function getAgentVariant(db: Database, agentId: string): AgentVariant | null {
    const row = db.query(
        `SELECT v.* FROM agent_variants v
         INNER JOIN agent_variant_assignments ava ON v.id = ava.variant_id
         WHERE ava.agent_id = ?`
    ).get(agentId) as VariantRow | null;
    return row ? rowToVariant(row) : null;
}

export function getAgentVariantAssignment(db: Database, agentId: string): AgentVariantAssignment | null {
    const row = db.query(
        'SELECT * FROM agent_variant_assignments WHERE agent_id = ?'
    ).get(agentId) as AssignmentRow | null;
    if (!row) return null;
    return {
        agentId: row.agent_id,
        variantId: row.variant_id,
        createdAt: row.created_at,
    };
}

/**
 * Apply a variant to an agent. This:
 * 1. Removes any existing variant assignment
 * 2. Clears current persona assignments
 * 3. Assigns the variant's personas to the agent
 * 4. Records the variant assignment
 *
 * Skill bundle assignments are referenced by the variant but not
 * directly assigned here — they're resolved at prompt-composition time.
 */
export function applyVariant(db: Database, agentId: string, variantId: string): boolean {
    const variant = getVariant(db, variantId);
    if (!variant) return false;

    // Remove existing variant (if any)
    removeVariant(db, agentId);

    // Assign variant's personas to the agent
    for (let i = 0; i < variant.personaIds.length; i++) {
        assignPersona(db, agentId, variant.personaIds[i], i);
    }

    // Record the variant assignment
    db.query(
        `INSERT OR REPLACE INTO agent_variant_assignments (agent_id, variant_id) VALUES (?, ?)`
    ).run(agentId, variantId);

    return true;
}

/**
 * Remove a variant from an agent. Clears persona assignments
 * that were set by the variant.
 */
export function removeVariant(db: Database, agentId: string): boolean {
    const assignment = getAgentVariantAssignment(db, agentId);
    if (!assignment) return false;

    const variant = getVariant(db, assignment.variantId);
    if (variant) {
        // Remove personas that the variant assigned
        for (const personaId of variant.personaIds) {
            unassignPersona(db, agentId, personaId);
        }
    }

    const result = db.query(
        'DELETE FROM agent_variant_assignments WHERE agent_id = ?'
    ).run(agentId);
    return result.changes > 0;
}
