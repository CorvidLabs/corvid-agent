import { Database } from 'bun:sqlite';
import type { Project, CreateProjectInput, UpdateProjectInput } from '../../shared/types';

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

export function listProjects(db: Database): Project[] {
    const rows = db.query('SELECT * FROM projects ORDER BY updated_at DESC').all() as ProjectRow[];
    return rows.map(rowToProject);
}

export function getProject(db: Database, id: string): Project | null {
    const row = db.query('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | null;
    return row ? rowToProject(row) : null;
}

export function createProject(db: Database, input: CreateProjectInput): Project {
    const id = crypto.randomUUID();
    const envVars = JSON.stringify(input.envVars ?? {});

    db.query(
        `INSERT INTO projects (id, name, description, working_dir, claude_md, env_vars)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, input.name, input.description ?? '', input.workingDir, input.claudeMd ?? '', envVars);

    return getProject(db, id) as Project;
}

export function updateProject(db: Database, id: string, input: UpdateProjectInput): Project | null {
    const existing = getProject(db, id);
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

    db.query(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return getProject(db, id);
}

export function deleteProject(db: Database, id: string): boolean {
    const result = db.query('DELETE FROM projects WHERE id = ?').run(id);
    return result.changes > 0;
}
