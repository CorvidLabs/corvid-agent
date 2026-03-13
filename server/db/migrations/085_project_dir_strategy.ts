import { Database } from 'bun:sqlite';

/**
 * Migration 085: Add directory strategy fields to projects.
 *
 * Enables projects to auto-clone from a git URL, use ephemeral directories,
 * or always create worktrees — instead of requiring a hardcoded workingDir.
 *
 * - git_url: Remote repository URL for clone-on-demand / ephemeral strategies
 * - dir_strategy: 'persistent' (default) | 'clone_on_demand' | 'ephemeral' | 'worktree'
 * - base_clone_path: Override directory for cloned repos (default: /tmp/corvid-projects/)
 */

export function up(db: Database): void {
    db.exec(`ALTER TABLE projects ADD COLUMN git_url TEXT DEFAULT NULL`);
    db.exec(`ALTER TABLE projects ADD COLUMN dir_strategy TEXT NOT NULL DEFAULT 'persistent'`);
    db.exec(`ALTER TABLE projects ADD COLUMN base_clone_path TEXT DEFAULT NULL`);
}

export function down(db: Database): void {
    // SQLite doesn't support DROP COLUMN before 3.35.0; recreate table if needed.
    // For simplicity these columns are nullable/defaulted so leaving them is safe.
    // This is a best-effort rollback.
    db.exec(`
        CREATE TABLE IF NOT EXISTS projects_backup AS SELECT
            id, name, description, working_dir, claude_md, env_vars, tenant_id, created_at, updated_at
        FROM projects
    `);
    db.exec(`DROP TABLE IF EXISTS projects`);
    db.exec(`
        CREATE TABLE projects (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            description TEXT DEFAULT '',
            working_dir TEXT NOT NULL,
            claude_md   TEXT DEFAULT '',
            env_vars    TEXT DEFAULT '{}',
            tenant_id   TEXT NOT NULL DEFAULT 'default',
            created_at  TEXT DEFAULT (datetime('now')),
            updated_at  TEXT DEFAULT (datetime('now'))
        )
    `);
    db.exec(`INSERT INTO projects SELECT * FROM projects_backup`);
    db.exec(`DROP TABLE IF EXISTS projects_backup`);
}
