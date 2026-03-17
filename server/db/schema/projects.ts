/**
 * Schema definitions for the projects domain.
 *
 * Tables: projects, project_skills
 */

export const tables: string[] = [
    `CREATE TABLE IF NOT EXISTS projects (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        description     TEXT DEFAULT '',
        working_dir     TEXT NOT NULL,
        claude_md       TEXT DEFAULT '',
        env_vars        TEXT DEFAULT '{}',
        git_url         TEXT DEFAULT NULL,
        dir_strategy    TEXT NOT NULL DEFAULT 'persistent',
        base_clone_path TEXT DEFAULT NULL,
        tenant_id       TEXT NOT NULL DEFAULT 'default',
        created_at      TEXT DEFAULT (datetime('now')),
        updated_at      TEXT DEFAULT (datetime('now'))
    )`,

    `CREATE TABLE IF NOT EXISTS project_skills (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        bundle_id  TEXT NOT NULL REFERENCES skill_bundles(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (project_id, bundle_id)
    )`,
];

export const indexes: string[] = [
    `CREATE INDEX IF NOT EXISTS idx_project_skills_project ON project_skills(project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_tenant_name ON projects(tenant_id, name COLLATE NOCASE)`,
];
