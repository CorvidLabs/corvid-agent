import type { Database } from 'bun:sqlite';

export function up(db: Database): void {
    const cols = db.query('PRAGMA table_info(tenant_members)').all() as Array<{ name: string }>;

    if (!cols.some((c) => c.name === 'email')) {
        db.run(`ALTER TABLE tenant_members ADD COLUMN email TEXT DEFAULT NULL`);
    }

    db.run(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_members_email ON tenant_members(tenant_id, email) WHERE email IS NOT NULL`,
    );
}

export function down(db: Database): void {
    db.run(`DROP INDEX IF EXISTS idx_tenant_members_email`);
    const cols = db.query('PRAGMA table_info(tenant_members)').all() as Array<{ name: string }>;
    if (cols.some((c) => c.name === 'email')) {
        db.run(`ALTER TABLE tenant_members DROP COLUMN email`);
    }
}
