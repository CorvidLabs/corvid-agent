import type { PluginCapability } from './types';
import type { Database } from 'bun:sqlite';
import { createLogger } from '../lib/logger';

const log = createLogger('PluginPermissions');

// ─── Capability Validation ──────────────────────────────────────────────────

const VALID_CAPABILITIES: PluginCapability[] = [
    'db:read',
    'network:outbound',
    'fs:project-dir',
    'agent:read',
    'session:read',
];

export function isValidCapability(cap: string): cap is PluginCapability {
    return VALID_CAPABILITIES.includes(cap as PluginCapability);
}

export function validateCapabilities(caps: string[]): { valid: PluginCapability[]; invalid: string[] } {
    const valid: PluginCapability[] = [];
    const invalid: string[] = [];
    for (const cap of caps) {
        if (isValidCapability(cap)) {
            valid.push(cap);
        } else {
            invalid.push(cap);
        }
    }
    return { valid, invalid };
}

// ─── Capability Grant/Revoke ────────────────────────────────────────────────

export function getGrantedCapabilities(db: Database, pluginName: string): PluginCapability[] {
    const rows = db.query(
        'SELECT capability FROM plugin_capabilities WHERE plugin_name = ? AND granted = 1',
    ).all(pluginName) as Array<{ capability: string }>;
    return rows.map(r => r.capability as PluginCapability);
}

export function grantCapability(db: Database, pluginName: string, capability: PluginCapability): void {
    db.query(`
        INSERT INTO plugin_capabilities (plugin_name, capability, granted, granted_at)
        VALUES (?, ?, 1, datetime('now'))
        ON CONFLICT(plugin_name, capability) DO UPDATE SET granted = 1, granted_at = datetime('now')
    `).run(pluginName, capability);
    log.info('Capability granted', { pluginName, capability });
}

export function revokeCapability(db: Database, pluginName: string, capability: PluginCapability): void {
    db.query(
        'UPDATE plugin_capabilities SET granted = 0 WHERE plugin_name = ? AND capability = ?',
    ).run(pluginName, capability);
    log.info('Capability revoked', { pluginName, capability });
}

export function grantAllCapabilities(db: Database, pluginName: string, capabilities: PluginCapability[]): void {
    for (const cap of capabilities) {
        grantCapability(db, pluginName, cap);
    }
}

export function hasCapability(db: Database, pluginName: string, capability: PluginCapability): boolean {
    const row = db.query(
        'SELECT granted FROM plugin_capabilities WHERE plugin_name = ? AND capability = ?',
    ).get(pluginName, capability) as { granted: number } | null;
    return row?.granted === 1;
}
