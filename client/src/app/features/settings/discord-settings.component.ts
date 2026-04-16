import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { firstValueFrom } from 'rxjs';
import { SECTION_STYLES } from './settings-shared.styles';

interface DiscordConfig {
    additional_channel_ids?: string;
    allowed_user_ids?: string;
    mode?: string;
    default_agent_id?: string;
    public_mode?: string;
    role_permissions?: string;
    default_permission_level?: string;
    rate_limit_by_level?: string;
    channel_permissions?: string;
    status_text?: string;
    activity_type?: string;
}

interface GuildChannel {
    id: string;
    name: string;
    type: number;
    position: number;
    parentId: string | null;
}

interface GuildRole {
    id: string;
    name: string;
    color: number;
    position: number;
    managed: boolean;
}

interface SimpleAgent {
    id: string;
    name: string;
}

@Component({
    selector: 'app-discord-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    template: `
        @if (discordConfig()) {
            <div class="settings__section">
                <h3 class="section-toggle" (click)="toggleSection()">
                    <span class="section-chevron" [class.section-chevron--open]="!collapsed()">&#9654;</span>
                    Discord
                    @if (discordDirty()) {
                        <span class="dirty-badge dirty-badge-pulse">Unsaved changes</span>
                    }
                </h3>
                @if (!collapsed()) {
                    <div class="discord-grid section-collapse">
                        <!-- Row 1: Mode + Public -->
                        <div class="discord-field">
                            <label class="discord-label" for="discord_mode">Bridge Mode</label>
                            <select class="discord-select" id="discord_mode"
                                [ngModel]="discordValues()['mode'] ?? discordConfig()?.mode ?? 'chat'"
                                (ngModelChange)="setDiscordValue('mode', $event)">
                                <option value="chat">Chat</option>
                                <option value="work_intake">Work Intake</option>
                            </select>
                            <span class="discord-desc">Chat: interactive sessions. Work Intake: creates work tasks.</span>
                        </div>
                        <div class="discord-field">
                            <label class="discord-label" for="discord_public_mode">Public Mode</label>
                            <select class="discord-select" id="discord_public_mode"
                                [ngModel]="discordValues()['public_mode'] ?? discordConfig()?.public_mode ?? 'false'"
                                (ngModelChange)="setDiscordValue('public_mode', $event)">
                                <option value="false">Off (allowlist only)</option>
                                <option value="true">On (role-based access)</option>
                            </select>
                            <span class="discord-desc">When on, anyone can interact (subject to role permissions).</span>
                        </div>

                        <!-- Row 2: Permission + Activity -->
                        <div class="discord-field">
                            <label class="discord-label" for="discord_default_perm">Default Permission Level</label>
                            <select class="discord-select" id="discord_default_perm"
                                [ngModel]="discordValues()['default_permission_level'] ?? discordConfig()?.default_permission_level ?? '1'"
                                (ngModelChange)="setDiscordValue('default_permission_level', $event)">
                                <option value="0">0 — Blocked</option>
                                <option value="1">1 — Basic (chat, mention)</option>
                                <option value="2">2 — Standard (slash commands)</option>
                                <option value="3">3 — Admin (council, work intake)</option>
                            </select>
                            <span class="discord-desc">Permission level for users with no matching role (public mode only).</span>
                        </div>
                        <div class="discord-field">
                            <label class="discord-label" for="discord_activity_type">Activity Type</label>
                            <select class="discord-select" id="discord_activity_type"
                                [ngModel]="discordValues()['activity_type'] ?? discordConfig()?.activity_type ?? '3'"
                                (ngModelChange)="setDiscordValue('activity_type', $event)">
                                <option value="0">Playing</option>
                                <option value="1">Streaming</option>
                                <option value="2">Listening to</option>
                                <option value="3">Watching</option>
                                <option value="5">Competing in</option>
                            </select>
                            <span class="discord-desc">Bot presence activity type.</span>
                        </div>

                        <!-- Status + Default Agent -->
                        <div class="discord-field">
                            <label class="discord-label" for="discord_status_text">Status Text</label>
                            <input class="discord-input" id="discord_status_text"
                                [ngModel]="discordValues()['status_text'] ?? discordConfig()?.status_text ?? ''"
                                (ngModelChange)="setDiscordValue('status_text', $event)"
                                placeholder="corvid-agent" />
                            <span class="discord-desc">Text shown in the bot's presence status.</span>
                        </div>
                        <div class="discord-field">
                            <label class="discord-label" for="discord_default_agent">Default Agent</label>
                            @if (agentsList().length > 0) {
                                <select class="discord-select" id="discord_default_agent"
                                    [ngModel]="discordValues()['default_agent_id'] ?? discordConfig()?.default_agent_id ?? ''"
                                    (ngModelChange)="setDiscordValue('default_agent_id', $event)">
                                    <option value="">First available</option>
                                    @for (agent of agentsList(); track agent.id) {
                                        <option [value]="agent.id">{{ agent.name }}</option>
                                    }
                                </select>
                            } @else {
                                <input class="discord-input" id="discord_default_agent"
                                    [ngModel]="discordValues()['default_agent_id'] ?? discordConfig()?.default_agent_id ?? ''"
                                    (ngModelChange)="setDiscordValue('default_agent_id', $event)"
                                    placeholder="Agent UUID" />
                            }
                            <span class="discord-desc">Default agent for @mention replies.</span>
                        </div>

                        <!-- Additional Channels — chip picker -->
                        <div class="discord-field discord-field--wide">
                            <label class="discord-label">Monitored Channels</label>
                            <div class="chip-list">
                                @for (ch of getSelectedChannels(); track ch.id) {
                                    <span class="chip">#{{ ch.name }} <button class="chip-remove" (click)="removeChannel(ch.id)">&times;</button></span>
                                }
                            </div>
                            @if (guildChannels().length > 0) {
                                <div class="picker-search">
                                    <input class="discord-input" placeholder="Search channels..."
                                        [ngModel]="channelSearch()"
                                        (ngModelChange)="channelSearch.set($event)" />
                                </div>
                                @if (channelSearch()) {
                                    <div class="picker-results">
                                        @for (ch of filteredChannels(); track ch.id) {
                                            <button class="picker-item" (click)="addChannel(ch.id)">
                                                #{{ ch.name }}
                                                <span class="picker-id">{{ ch.id }}</span>
                                            </button>
                                        }
                                        @if (filteredChannels().length === 0) {
                                            <span class="picker-empty">No matching channels</span>
                                        }
                                    </div>
                                }
                            } @else {
                                <input class="discord-input"
                                    [ngModel]="discordValues()['additional_channel_ids'] ?? discordConfig()?.additional_channel_ids ?? ''"
                                    (ngModelChange)="setDiscordValue('additional_channel_ids', $event)"
                                    placeholder="Channel IDs, comma-separated" />
                            }
                            <span class="discord-desc">Extra channels to monitor (beyond the primary channel).</span>
                        </div>

                        <!-- Allowed Users -->
                        <div class="discord-field discord-field--wide">
                            <label class="discord-label" for="discord_users">Allowed Users (Legacy)</label>
                            <input class="discord-input" id="discord_users"
                                [ngModel]="discordValues()['allowed_user_ids'] ?? discordConfig()?.allowed_user_ids ?? ''"
                                (ngModelChange)="setDiscordValue('allowed_user_ids', $event)"
                                placeholder="User IDs, comma-separated" />
                            <span class="discord-desc">User allowlist for legacy mode (ignored when public mode is on).</span>
                        </div>

                        <!-- Role Permissions -->
                        <div class="discord-field discord-field--wide">
                            <label class="discord-label">Role Permissions</label>
                            @if (guildRoles().length > 0) {
                                <div class="role-perm-grid">
                                    @for (role of getConfigurableRoles(); track role.id) {
                                        <div class="role-perm-row">
                                            <span class="role-name" [style.color]="roleColor(role)">{{ role.name }}</span>
                                            <select class="discord-select discord-select--sm"
                                                [ngModel]="getRolePermLevel(role.id)"
                                                (ngModelChange)="setRolePermLevel(role.id, $event)">
                                                <option value="">— No override —</option>
                                                <option value="0">Blocked</option>
                                                <option value="1">Basic</option>
                                                <option value="2">Standard</option>
                                                <option value="3">Admin</option>
                                            </select>
                                        </div>
                                    }
                                </div>
                            } @else {
                                <textarea class="discord-textarea" rows="3"
                                    [ngModel]="discordValues()['role_permissions'] ?? discordConfig()?.role_permissions ?? '{}'"
                                    (ngModelChange)="setDiscordValue('role_permissions', $event)"
                                    placeholder='{"role_id": 3, "other_role_id": 1}'></textarea>
                            }
                            <span class="discord-desc">Maps Discord roles to permission levels (0-3).</span>
                        </div>

                        <!-- Channel Permissions -->
                        <div class="discord-field discord-field--wide">
                            <label class="discord-label">Channel Permissions</label>
                            <div class="role-perm-grid">
                                @for (entry of getChannelPermEntries(); track entry.id) {
                                    <div class="role-perm-row">
                                        <span class="channel-name">#{{ entry.name }}</span>
                                        <select class="discord-select discord-select--sm"
                                            [ngModel]="String(entry.level)"
                                            (ngModelChange)="setChannelPermLevel(entry.id, $event)">
                                            <option value="0">Blocked</option>
                                            <option value="1">Basic</option>
                                            <option value="2">Standard</option>
                                            <option value="3">Admin</option>
                                        </select>
                                        <button class="chip-remove" (click)="removeChannelPerm(entry.id)">&times;</button>
                                    </div>
                                }
                            </div>
                            @if (guildChannels().length > 0) {
                                <div class="picker-search">
                                    <input class="discord-input" placeholder="Add channel permission..."
                                        [ngModel]="channelPermSearch()"
                                        (ngModelChange)="channelPermSearch.set($event)" />
                                </div>
                                @if (channelPermSearch()) {
                                    <div class="picker-results">
                                        @for (ch of filteredChannelPerms(); track ch.id) {
                                            <button class="picker-item" (click)="addChannelPerm(ch.id)">
                                                #{{ ch.name }}
                                            </button>
                                        }
                                        @if (filteredChannelPerms().length === 0) {
                                            <span class="picker-empty">No matching channels</span>
                                        }
                                    </div>
                                }
                            }
                            <span class="discord-desc">Per-channel permission floor. Everyone in the channel gets at least this level (useful for invite-only channels with no roles).</span>
                        </div>

                        <!-- Rate Limits -->
                        <div class="discord-field discord-field--wide">
                            <label class="discord-label" for="discord_rate_limits">Rate Limits by Level (JSON)</label>
                            <textarea class="discord-textarea" id="discord_rate_limits" rows="2"
                                [ngModel]="discordValues()['rate_limit_by_level'] ?? discordConfig()?.rate_limit_by_level ?? '{}'"
                                (ngModelChange)="setDiscordValue('rate_limit_by_level', $event)"
                                placeholder='{"1": 5, "2": 15, "3": 50}'></textarea>
                            <span class="discord-desc">Max messages per window by permission level. JSON object.</span>
                        </div>
                    </div>
                    <div class="discord-actions">
                        <button
                            class="save-btn"
                            [disabled]="savingDiscord() || !discordDirty()"
                            (click)="saveDiscordConfig()"
                        >{{ savingDiscord() ? 'Saving...' : 'Save Discord Config' }}</button>
                        @if (discordDirty()) {
                            <button class="cancel-btn cancel-btn--sm" (click)="resetDiscordChanges()">Discard Changes</button>
                        }
                    </div>
                }
            </div>
        }
    `,
    styles: `
        ${SECTION_STYLES}
        .discord-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 1rem;
            margin-bottom: 1rem;
        }
        .discord-field { display: flex; flex-direction: column; gap: 0.3rem; }
        .discord-field--wide { grid-column: 1 / -1; }
        .discord-label { font-size: 0.78rem; color: var(--text-secondary); font-weight: 600; }
        .discord-input, .discord-select, .discord-textarea {
            padding: 0.55rem 0.65rem;
            background: var(--bg-input);
            border: 1px solid var(--border-bright);
            border-radius: var(--radius);
            color: var(--text-primary);
            font-size: 0.9rem;
            font-family: inherit;
            width: 100%;
            min-height: 44px;
        }
        .discord-textarea { resize: vertical; font-size: 0.8rem; font-family: var(--font-mono); min-height: 60px; }
        .discord-select { cursor: pointer; }
        .discord-input:focus, .discord-select:focus, .discord-textarea:focus {
            border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none;
        }
        .discord-desc { font-size: 0.78rem; color: var(--text-tertiary); margin-top: 0.1rem; }
        .discord-select--sm { padding: 0.45rem 0.55rem; font-size: 0.8rem; width: auto; min-width: 130px; min-height: 38px; }
        .discord-actions { display: flex; gap: 0.5rem; align-items: center; }
        .chip-list { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.5rem; }
        .chip {
            display: inline-flex; align-items: center; gap: 0.35rem;
            padding: 0.35rem 0.6rem; background: var(--accent-cyan-dim); color: var(--accent-cyan);
            border: 1px solid var(--accent-cyan); border-radius: var(--radius-sm);
            font-size: 0.78rem; font-weight: 600; min-height: 32px;
        }
        .chip-remove { background: none; border: none; color: inherit; cursor: pointer; font-size: 1.1rem; padding: 0.25rem 0.35rem; min-width: 32px; min-height: 32px; line-height: 1; opacity: 0.7; display: inline-flex; align-items: center; justify-content: center; }
        .chip-remove:hover { opacity: 1; }
        .picker-search { margin-bottom: 0.4rem; }
        .picker-results {
            display: flex; flex-direction: column; gap: 0.2rem;
            max-height: 200px; overflow-y: auto;
            background: var(--bg-raised); border: 1px solid var(--border);
            border-radius: var(--radius); padding: 0.35rem;
        }
        .picker-item {
            background: none; border: none; color: var(--text-primary);
            text-align: left; padding: 0.5rem 0.65rem; cursor: pointer;
            border-radius: var(--radius-sm); font-size: 0.8rem; font-family: inherit;
            display: flex; justify-content: space-between; align-items: center;
            min-height: 40px; transition: background 0.12s;
        }
        .picker-item:hover { background: var(--bg-surface); color: var(--accent-cyan); }
        .picker-id { font-size: 0.78rem; color: var(--text-tertiary); font-family: var(--font-mono); }
        .picker-empty { font-size: 0.8rem; color: var(--text-tertiary); padding: 0.5rem 0.65rem; }
        .role-perm-grid { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.5rem; }
        .role-perm-row {
            display: flex; align-items: center; gap: 0.5rem;
            padding: 0.5rem 0.65rem; background: var(--bg-raised); border-radius: var(--radius-sm);
            min-height: 44px;
        }
        .role-name { font-size: 0.8rem; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .channel-name { font-size: 0.8rem; font-weight: 600; flex: 1; color: var(--text-primary); }
        @media (max-width: 600px) { .discord-grid { grid-template-columns: 1fr; } }
    `,
})
export class DiscordSettingsComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly notifications = inject(NotificationService);

    readonly collapsed = signal(false);
    readonly discordConfig = signal<DiscordConfig | null>(null);
    readonly discordValues = signal<Record<string, string>>({});
    readonly savingDiscord = signal(false);
    readonly discordDirty = computed(() => Object.keys(this.discordValues()).length > 0);
    readonly guildChannels = signal<GuildChannel[]>([]);
    readonly guildRoles = signal<GuildRole[]>([]);
    readonly agentsList = signal<SimpleAgent[]>([]);
    readonly channelSearch = signal('');
    readonly channelPermSearch = signal('');

    /** String helper for template. */
    String = String;

    ngOnInit(): void {
        this.loadDiscordConfig();
        this.loadGuildCache();
        this.loadAgentsList();
    }

    toggleSection(): void {
        this.collapsed.update(v => !v);
    }

    setDiscordValue(key: string, value: string): void {
        const original = this.discordConfig()?.[key as keyof DiscordConfig] ?? '';
        this.discordValues.update(vals => {
            const next = { ...vals };
            if (value === original) {
                delete next[key];
            } else {
                next[key] = value;
            }
            return next;
        });
    }

    resetDiscordChanges(): void {
        this.discordValues.set({});
    }

    async saveDiscordConfig(): Promise<void> {
        const updates = this.discordValues();
        if (Object.keys(updates).length === 0) return;
        this.savingDiscord.set(true);
        try {
            await firstValueFrom(this.api.put<{ ok: boolean }>('/settings/discord', updates));
            this.discordConfig.update(cfg => cfg ? { ...cfg, ...updates } : cfg);
            this.discordValues.set({});
            this.notifications.success('Discord configuration saved');
        } catch {
            this.notifications.error('Failed to save Discord configuration');
        } finally {
            this.savingDiscord.set(false);
        }
    }

    get textChannels(): GuildChannel[] {
        return this.guildChannels().filter(c => c.type === 0).sort((a, b) => a.position - b.position);
    }

    private getSelectedChannelIds(): string[] {
        const raw = this.discordValues()['additional_channel_ids'] ?? this.discordConfig()?.additional_channel_ids ?? '';
        return raw.split(',').map(s => s.trim()).filter(Boolean);
    }

    getSelectedChannels(): { id: string; name: string }[] {
        const ids = this.getSelectedChannelIds();
        const channelMap = new Map<string, GuildChannel>(this.guildChannels().map(c => [c.id, c]));
        return ids.map(id => {
            const ch = channelMap.get(id);
            return { id, name: ch?.name ?? id };
        });
    }

    filteredChannels(): GuildChannel[] {
        const selected = new Set(this.getSelectedChannelIds());
        const q = this.channelSearch().toLowerCase();
        return this.textChannels
            .filter(c => !selected.has(c.id) && c.name.toLowerCase().includes(q))
            .slice(0, 15);
    }

    addChannel(channelId: string): void {
        const ids = this.getSelectedChannelIds();
        if (!ids.includes(channelId)) {
            ids.push(channelId);
            this.setDiscordValue('additional_channel_ids', ids.join(','));
        }
        this.channelSearch.set('');
    }

    removeChannel(channelId: string): void {
        const ids = this.getSelectedChannelIds().filter(id => id !== channelId);
        this.setDiscordValue('additional_channel_ids', ids.join(','));
    }

    getConfigurableRoles(): GuildRole[] {
        return this.guildRoles()
            .filter(r => r.name !== '@everyone' && !r.managed)
            .sort((a, b) => b.position - a.position);
    }

    getRolePermLevel(roleId: string): string {
        const raw = this.discordValues()['role_permissions'] ?? this.discordConfig()?.role_permissions ?? '{}';
        try {
            const perms = JSON.parse(raw) as Record<string, number>;
            return perms[roleId] !== undefined ? String(perms[roleId]) : '';
        } catch {
            return '';
        }
    }

    setRolePermLevel(roleId: string, level: string): void {
        const raw = this.discordValues()['role_permissions'] ?? this.discordConfig()?.role_permissions ?? '{}';
        let perms: Record<string, number> = {};
        try { perms = JSON.parse(raw); } catch { /* ignore */ }
        if (level === '') {
            delete perms[roleId];
        } else {
            perms[roleId] = parseInt(level, 10);
        }
        this.setDiscordValue('role_permissions', JSON.stringify(perms));
    }

    roleColor(role: GuildRole): string {
        if (!role.color) return 'var(--text-primary)';
        return '#' + role.color.toString(16).padStart(6, '0');
    }

    private getChannelPerms(): Record<string, number> {
        const raw = this.discordValues()['channel_permissions'] ?? this.discordConfig()?.channel_permissions ?? '{}';
        try { return JSON.parse(raw); } catch { return {}; }
    }

    getChannelPermEntries(): { id: string; name: string; level: number }[] {
        const perms = this.getChannelPerms();
        const channelMap = new Map<string, GuildChannel>(this.guildChannels().map(c => [c.id, c]));
        return Object.entries(perms).map(([id, level]) => ({
            id,
            name: channelMap.get(id)?.name ?? id,
            level,
        }));
    }

    filteredChannelPerms(): GuildChannel[] {
        const existing = new Set(Object.keys(this.getChannelPerms()));
        const q = this.channelPermSearch().toLowerCase();
        return this.textChannels
            .filter(c => !existing.has(c.id) && c.name.toLowerCase().includes(q))
            .slice(0, 15);
    }

    addChannelPerm(channelId: string): void {
        const perms = this.getChannelPerms();
        if (!(channelId in perms)) {
            perms[channelId] = 2;
            this.setDiscordValue('channel_permissions', JSON.stringify(perms));
        }
        this.channelPermSearch.set('');
    }

    setChannelPermLevel(channelId: string, level: string): void {
        const perms = this.getChannelPerms();
        perms[channelId] = parseInt(level, 10);
        this.setDiscordValue('channel_permissions', JSON.stringify(perms));
    }

    removeChannelPerm(channelId: string): void {
        const perms = this.getChannelPerms();
        delete perms[channelId];
        this.setDiscordValue('channel_permissions', JSON.stringify(perms));
    }

    private async loadDiscordConfig(): Promise<void> {
        try {
            const result = await firstValueFrom(
                this.api.get<{ discordConfig: DiscordConfig }>('/settings/discord')
            );
            this.discordConfig.set(result.discordConfig);
        } catch {
            // Non-critical
        }
    }

    private async loadGuildCache(): Promise<void> {
        try {
            const result = await firstValueFrom(
                this.api.get<{ channels: GuildChannel[]; roles: GuildRole[] }>('/settings/discord/guild-cache')
            );
            this.guildChannels.set(result.channels ?? []);
            this.guildRoles.set(result.roles ?? []);
        } catch {
            // Non-critical
        }
    }

    private async loadAgentsList(): Promise<void> {
        try {
            const result = await firstValueFrom(
                this.api.get<SimpleAgent[]>('/agents')
            );
            this.agentsList.set(result.map(a => ({ id: a.id, name: a.name })));
        } catch {
            // Non-critical
        }
    }
}
