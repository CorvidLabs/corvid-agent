import { Database, type SQLQueryBindings } from 'bun:sqlite';
import type { Project, CreateProjectInput, UpdateProjectInput } from '../../shared/types';
import { DEFAULT_TENANT_ID } from '../tenant/types';
import { withTenantFilter, validateTenantOwnership } from '../tenant/db-filter';

interface ProjectRow {
    id: string;
    name: string;
    description: string;
    working_dir: string;
    claude_md: string;
    env_vars: string;
    created_at: string;
    updated_at: string;
}

function rowToProject(row: ProjectRow): Project {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        workingDir: row.working_dir,
        claudeMd: row.claude_md,
        envVars: JSON.parse(row.env_vars),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function listProjects(db: Database, tenantId: string = DEFAULT_TENANT_ID): Project[] {
    const { query, bindings } = withTenantFilter('SELECT * FROM projects ORDER BY updated_at DESC', tenantId);
    const rows = db.query(query).all(...bindings) as ProjectRow[];
    return rows.map(rowToProject);
}

export function getProject(db: Database, id: string, tenantId: string = DEFAULT_TENANT_ID): Project | null {
    if (!validateTenantOwnership(db, 'projects', id, tenantId)) return null;
    const row = db.query('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | null;
    return row ? rowToProject(row) : null;
}

export function createProject(db: Database, input: CreateProjectInput, tenantId: string = DEFAULT_TENANT_ID): Project {
    const id = crypto.randomUUID();
    const envVars = JSON.stringify(input.envVars ?? {});

    db.query(
        `INSERT INTO projects (id, name, description, working_dir, claude_md, env_vars, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.name, input.description ?? '', input.workingDir, input.claudeMd ?? '', envVars, tenantId);

    return getProject(db, id) as Project;
}

export function updateProject(db: Database, id: string, input: UpdateProjectInput, tenantId: string = DEFAULT_TENANT_ID): Project | null {
    const existing = getProject(db, id, tenantId);
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
    if (input.workingDir !== undefined) {
        fields.push('working_dir = ?');
        values.push(input.workingDir);
    }
    if (input.claudeMd !== undefined) {
        fields.push('claude_md = ?');
        values.push(input.claudeMd);
    }
    if (input.envVars !== undefined) {
        fields.push('env_vars = ?');
        values.push(JSON.stringify(input.envVars));
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.query(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...(values as SQLQueryBindings[]));
    return getProject(db, id, tenantId);
}

export function deleteProject(db: Database, id: string, tenantId: string = DEFAULT_TENANT_ID): boolean {
    const existing = getProject(db, id, tenantId);
    if (!existing) return false;

    db.transaction(() => {
        // Delete dependent records that reference this project
        // Order matters: delete children before parents

        // council_launches -> also cascades to council_launch_logs & council_discussion_messages
        db.query('DELETE FROM council_launches WHERE project_id = ?').run(id);

        // work_tasks
        db.query('DELETE FROM work_tasks WHERE project_id = ?').run(id);

        // session_messages (child of sessions)
        db.query(`DELETE FROM session_messages WHERE session_id IN
            (SELECT id FROM sessions WHERE project_id = ?)`).run(id);

        // sessions
        db.query('DELETE FROM sessions WHERE project_id = ?').run(id);

        // Finally delete the project itself
        db.query('DELETE FROM projects WHERE id = ?').run(id);
    })();

    return true;
}
