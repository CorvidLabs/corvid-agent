import type { Database, SQLQueryBindings } from 'bun:sqlite';
import type { CreateProjectInput, DirStrategy, Project, UpdateProjectInput } from '../../shared/types';
import { decryptEnvVars, encryptEnvVars } from '../lib/env-encryption';
import { tenantQuery, validateTenantOwnership, withTenantFilter } from '../tenant/db-filter';
import { DEFAULT_TENANT_ID } from '../tenant/types';
import { writeTransaction } from './pool';

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  working_dir: string;
  claude_md: string;
  env_vars: string;
  git_url: string | null;
  dir_strategy: string;
  base_clone_path: string | null;
  created_at: string;
  updated_at: string;
}

const VALID_DIR_STRATEGIES: DirStrategy[] = ['persistent', 'clone_on_demand', 'ephemeral', 'worktree'];

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    workingDir: row.working_dir,
    claudeMd: row.claude_md,
    envVars: JSON.parse(decryptEnvVars(row.env_vars)),
    gitUrl: row.git_url ?? null,
    dirStrategy: (VALID_DIR_STRATEGIES.includes(row.dir_strategy as DirStrategy)
      ? row.dir_strategy
      : 'persistent') as DirStrategy,
    baseClonePath: row.base_clone_path ?? null,
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

export function getProjectByName(db: Database, name: string, tenantId: string = DEFAULT_TENANT_ID): Project | null {
  const rows = tenantQuery<ProjectRow>(
    db,
    'SELECT * FROM projects WHERE LOWER(name) = LOWER(?) LIMIT 1',
    tenantId,
    name,
  );
  return rows.length > 0 ? rowToProject(rows[0]) : null;
}

export function createProject(db: Database, input: CreateProjectInput, tenantId: string = DEFAULT_TENANT_ID): Project {
  const id = crypto.randomUUID();
  const envVars = encryptEnvVars(JSON.stringify(input.envVars ?? {}));
  const dirStrategy =
    input.dirStrategy && VALID_DIR_STRATEGIES.includes(input.dirStrategy) ? input.dirStrategy : 'persistent';

  db.query(
    `INSERT INTO projects (id, name, description, working_dir, claude_md, env_vars, git_url, dir_strategy, base_clone_path, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    input.description ?? '',
    input.workingDir,
    input.claudeMd ?? '',
    envVars,
    input.gitUrl ?? null,
    dirStrategy,
    input.baseClonePath ?? null,
    tenantId,
  );

  return getProject(db, id) as Project;
}

export function updateProject(
  db: Database,
  id: string,
  input: UpdateProjectInput,
  tenantId: string = DEFAULT_TENANT_ID,
): Project | null {
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
    values.push(encryptEnvVars(JSON.stringify(input.envVars)));
  }
  if (input.gitUrl !== undefined) {
    fields.push('git_url = ?');
    values.push(input.gitUrl);
  }
  if (input.dirStrategy !== undefined) {
    if (VALID_DIR_STRATEGIES.includes(input.dirStrategy)) {
      fields.push('dir_strategy = ?');
      values.push(input.dirStrategy);
    }
  }
  if (input.baseClonePath !== undefined) {
    fields.push('base_clone_path = ?');
    values.push(input.baseClonePath);
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

  writeTransaction(db, (db) => {
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
  });

  return true;
}
