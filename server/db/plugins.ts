import type { Database } from 'bun:sqlite';
import type { PluginRecord, PluginCapabilityRecord } from '../plugins/types';

export function getPlugin(db: Database, name: string): PluginRecord | null {
    return db.query('SELECT * FROM plugins WHERE name = ?').get(name) as PluginRecord | null;
}

export function listPlugins(db: Database): PluginRecord[] {
    return db.query('SELECT * FROM plugins ORDER BY loaded_at DESC').all() as PluginRecord[];
}

export function deletePlugin(db: Database, name: string): boolean {
    const result = db.query('DELETE FROM plugins WHERE name = ?').run(name);
    return result.changes > 0;
}

export function getPluginCapabilities(db: Database, pluginName: string): PluginCapabilityRecord[] {
    return db.query(
        'SELECT plugin_name, capability, granted, granted_at FROM plugin_capabilities WHERE plugin_name = ?',
    ).all(pluginName) as PluginCapabilityRecord[];
}

export function setPluginStatus(db: Database, name: string, status: string): boolean {
    const result = db.query('UPDATE plugins SET status = ? WHERE name = ?').run(status, name);
    return result.changes > 0;
}
