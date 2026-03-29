import { Component, ChangeDetectionStrategy, inject, OnInit, signal, computed, ElementRef } from '@angular/core';
import { DecimalPipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { NotificationService } from '../../core/services/notification.service';
import { SessionService } from '../../core/services/session.service';
import { GuidedTourService } from '../../core/services/guided-tour.service';
import { firstValueFrom } from 'rxjs';
import QRCode from 'qrcode';

interface SettingsData {
    creditConfig: Record<string, string>;
    system: {
        schemaVersion: number;
        agentCount: number;
        projectCount: number;
        sessionCount: number;
    };
}

interface OperationalMode {
    mode: string;
}

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

interface PSKContact {
    id: string;
    nickname: string;
    network: string;
    mobileAddress: string | null;
    active: boolean;
    createdAt: string;
    uri?: string;
}

@Component({
    selector: 'app-settings',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, DecimalPipe, TitleCasePipe, SkeletonComponent],
    template: `
        <div class="settings">
            <h2>Settings</h2>

            @if (loading()) {
                <app-skeleton variant="line" [count]="6" />
            } @else {
                <!-- System Info -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('system')">
                        <span class="section-chevron" [class.section-chevron--open]="!collapsedSections().has('system')">&#9654;</span>
                        System Info
                    </h3>
                    @if (!collapsedSections().has('system')) {
                        <div class="info-grid section-collapse">
                            <div class="info-item">
                                <span class="info-label">Schema Version</span>
                                <span class="info-value">{{ settings()?.system?.schemaVersion }}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Agents</span>
                                <span class="info-value">{{ settings()?.system?.agentCount }}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Projects</span>
                                <span class="info-value">{{ settings()?.system?.projectCount }}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">Sessions</span>
                                <span class="info-value">{{ settings()?.system?.sessionCount }}</span>
                            </div>
                        </div>
                    }
                </div>

                <!-- Help -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('help')">
                        <span class="section-chevron" [class.section-chevron--open]="!collapsedSections().has('help')">&#9654;</span>
                        Help
                    </h3>
                    @if (!collapsedSections().has('help')) {
                        <div class="info-grid section-collapse">
                            <div class="info-item info-item--action">
                                <span class="info-label">Guided Tour</span>
                                <button class="save-btn save-btn--sm" (click)="replayTour()">Replay Tour</button>
                            </div>
                            <div class="info-item info-item--action">
                                <span class="info-label">Keyboard Shortcuts</span>
                                <span class="info-value">Press <kbd>?</kbd> to view</span>
                            </div>
                        </div>
                    }
                </div>

                <!-- System Health -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('health')">
                        <span class="section-chevron" [class.section-chevron--open]="!collapsedSections().has('health')">&#9654;</span>
                        System Health
                    </h3>
                    @if (!collapsedSections().has('health')) {
                        <div class="health-grid section-collapse">
                            <div class="health-item">
                                <span class="health-dot" [attr.data-status]="algochatStatus() ? 'ok' : 'off'" [class.health-dot-pulse]="algochatStatus()?.enabled"></span>
                                <span class="health-name">AlgoChat</span>
                                <span class="health-status">{{ algochatStatus()?.enabled ? 'Connected' : 'Disconnected' }}</span>
                            </div>
                            <div class="health-item">
                                <span class="health-dot" [attr.data-status]="operationalMode() === 'normal' ? 'ok' : operationalMode() === 'paused' ? 'off' : 'warn'" [class.health-dot-pulse]="operationalMode() === 'normal'"></span>
                                <span class="health-name">Operations</span>
                                <span class="health-status">{{ operationalMode() | titlecase }}</span>
                            </div>
                            <div class="health-item">
                                <span class="health-dot" [attr.data-status]="(settings()?.system?.sessionCount ?? 0) > 0 ? 'ok' : 'off'"></span>
                                <span class="health-name">Sessions</span>
                                <span class="health-status">{{ settings()?.system?.sessionCount }} total</span>
                            </div>
                            <div class="health-item">
                                <span class="health-dot" [attr.data-status]="pskContacts().length > 0 ? 'ok' : 'off'"></span>
                                <span class="health-name">Mobile Contacts</span>
                                <span class="health-status">{{ pskContacts().length }} configured</span>
                            </div>
                        </div>
                    }
                </div>

                <!-- Discord Configuration -->
                @if (discordConfig()) {
                    <div class="settings__section">
                        <h3 class="section-toggle" (click)="toggleSection('discord')">
                            <span class="section-chevron" [class.section-chevron--open]="!collapsedSections().has('discord')">&#9654;</span>
                            Discord
                            @if (discordDirty()) {
                                <span class="dirty-badge dirty-badge-pulse">Unsaved changes</span>
                            }
                        </h3>
                        @if (!collapsedSections().has('discord')) {
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

                                <!-- Channel Permissions — NEW -->
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

                <!-- AlgoChat Status -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('algochat')">
                        <span class="section-chevron" [class.section-chevron--open]="!collapsedSections().has('algochat')">&#9654;</span>
                        AlgoChat
                    </h3>
                    @if (!collapsedSections().has('algochat')) {
                        @if (algochatStatus(); as status) {
                            <div class="info-grid section-collapse">
                                <div class="info-item">
                                    <span class="info-label">Status</span>
                                    <span class="info-value" [class.info-value--active]="status.enabled" [class.info-value--inactive]="!status.enabled">
                                        {{ status.enabled ? 'Connected' : 'Disconnected' }}
                                    </span>
                                </div>
                                @if (status.address && status.address !== 'local') {
                                    <div class="info-item">
                                        <span class="info-label">Address</span>
                                        <code class="info-code">{{ status.address }}</code>
                                    </div>
                                }
                                <div class="info-item">
                                    <span class="info-label">Network</span>
                                    <span class="info-value network-badge" [attr.data-network]="status.network">{{ status.network }}</span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Server Balance</span>
                                    <span class="info-value" [class.algo-balance--low]="status.balance < 1000000">
                                        {{ status.balance / 1000000 | number:'1.2-4' }} ALGO
                                    </span>
                                </div>
                                <div class="info-item">
                                    <span class="info-label">Active Chats</span>
                                    <span class="info-value">{{ status.activeConversations }}</span>
                                </div>
                            </div>
                        } @else {
                            <p class="muted">AlgoChat not configured</p>
                        }
                    }
                </div>

                <!-- Connect Mobile — Multi-Contact PSK -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('mobile')">
                        <span class="section-chevron" [class.section-chevron--open]="!collapsedSections().has('mobile')">&#9654;</span>
                        Connect Mobile
                        @if (pskContacts().length > 0) {
                            <span class="section-badge">{{ pskContacts().length }}</span>
                        }
                    </h3>
                    @if (!collapsedSections().has('mobile')) {
                        <p class="connect-desc">
                            Share your agent with friends. Each contact gets their own encrypted PSK channel.
                        </p>

                        <!-- Contact list -->
                        @if (pskContacts().length > 0) {
                            <div class="contact-list">
                                @for (contact of pskContacts(); track contact.id) {
                                    <div class="contact-card contact-interactive">
                                        <div class="contact-header">
                                            @if (editingContactId() === contact.id) {
                                                <input
                                                    class="contact-nickname-input"
                                                    [value]="editingNickname()"
                                                    (input)="editingNickname.set(asInputValue($event))"
                                                    (keydown.enter)="saveNickname(contact.id)"
                                                    (keydown.escape)="cancelEditNickname()"
                                                />
                                                <button class="icon-btn" (click)="saveNickname(contact.id)" title="Save">&#10003;</button>
                                                <button class="icon-btn" (click)="cancelEditNickname()" title="Cancel">&#10005;</button>
                                            } @else {
                                                <span class="contact-nickname" (dblclick)="startEditNickname(contact)">{{ contact.nickname }}</span>
                                                <button class="icon-btn" (click)="startEditNickname(contact)" title="Rename">&#9998;</button>
                                            }
                                            <span class="contact-status" [class.contact-status--active]="contact.mobileAddress"
                                                  [class.contact-status--waiting]="!contact.mobileAddress">
                                                {{ contact.mobileAddress ? 'Connected' : 'Waiting' }}
                                            </span>
                                        </div>
                                        @if (contact.mobileAddress) {
                                            <code class="contact-address">{{ contact.mobileAddress }}</code>
                                        }
                                        <div class="contact-actions">
                                            <button class="save-btn save-btn--sm" (click)="toggleQR(contact)">
                                                {{ expandedContactId() === contact.id ? 'Hide QR' : 'Show QR' }}
                                            </button>
                                            <button class="save-btn save-btn--sm" (click)="copyContactUri(contact)">Copy URI</button>
                                            <button class="cancel-btn cancel-btn--sm" (click)="cancelContact(contact)">Delete</button>
                                        </div>
                                        @if (expandedContactId() === contact.id && contact.uri) {
                                            <div class="qr-container">
                                                <canvas class="qr-canvas"></canvas>
                                            </div>
                                        }
                                    </div>
                                }
                            </div>
                        } @else {
                            <p class="muted">No contacts yet. Add one to get started.</p>
                        }

                        <!-- Add contact -->
                        <div class="add-contact">
                            @if (addingContact()) {
                                <div class="add-contact-form">
                                    <input
                                        class="contact-nickname-input"
                                        placeholder="Nickname (e.g. Alice)"
                                        [value]="newContactNickname()"
                                        (input)="newContactNickname.set(asInputValue($event))"
                                        (keydown.enter)="createContact()"
                                        (keydown.escape)="addingContact.set(false)"
                                    />
                                    <button class="save-btn save-btn--sm" [disabled]="creatingContact()" (click)="createContact()">
                                        {{ creatingContact() ? 'Creating...' : 'Create' }}
                                    </button>
                                    <button class="icon-btn" (click)="addingContact.set(false)">&#10005;</button>
                                </div>
                            } @else {
                                <button class="save-btn" (click)="addingContact.set(true)">+ Add Contact</button>
                            }
                        </div>
                    }
                </div>

                <!-- Operational Mode -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('mode')">
                        <span class="section-chevron" [class.section-chevron--open]="!collapsedSections().has('mode')">&#9654;</span>
                        Operational Mode
                        <span class="section-badge section-badge--mode" [attr.data-mode]="operationalMode()">{{ operationalMode() }}</span>
                    </h3>
                    @if (!collapsedSections().has('mode')) {
                        <div class="mode-selector section-collapse">
                            @for (mode of modes; track mode) {
                                <button
                                    class="mode-btn"
                                    [class.mode-btn--active]="operationalMode() === mode"
                                    (click)="setMode(mode)"
                                >{{ mode }}</button>
                            }
                        </div>
                        <p class="mode-desc">
                            @switch (operationalMode()) {
                                @case ('normal') { Agents execute tools immediately without approval. }
                                @case ('queued') { Tool calls are queued for manual approval before execution. }
                                @case ('paused') { All sessions are paused. No tool execution. }
                            }
                        </p>
                    }
                </div>

                <!-- OpenRouter Provider -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('openrouter')">
                        <span class="section-chevron" [class.section-chevron--open]="!collapsedSections().has('openrouter')">&#9654;</span>
                        OpenRouter
                        @if (openrouterStatus()?.status === 'available') {
                            <span class="status-badge status-badge--ok">Connected</span>
                        }
                    </h3>
                    @if (!collapsedSections().has('openrouter')) {
                        <div class="info-grid section-collapse">
                            <div class="info-item">
                                <span class="info-label">Status</span>
                                <span class="info-value">{{ openrouterStatus()?.status ?? 'Not configured' }}</span>
                            </div>
                            @if (openrouterStatus()?.configuredModels) {
                                <div class="info-item">
                                    <span class="info-label">Configured Models</span>
                                    <span class="info-value">{{ openrouterStatus()?.configuredModels }}</span>
                                </div>
                            }
                        </div>
                        <p class="muted" style="margin-top: 0.5rem;">
                            Set <code>OPENROUTER_API_KEY</code> in your environment to enable.
                            Models are routed via <code>https://openrouter.ai</code>.
                        </p>
                        @if (openrouterModels().length > 0) {
                            <div class="openrouter-models">
                                <h4>Available Models</h4>
                                <div class="model-list">
                                    @for (model of openrouterModels(); track model.model) {
                                        <div class="model-item">
                                            <span class="model-name">{{ model.displayName }}</span>
                                            <span class="model-price">
                                                \${{ model.inputPricePerMillion }}/\${{ model.outputPricePerMillion }} per M tokens
                                            </span>
                                        </div>
                                    }
                                </div>
                            </div>
                        }
                    }
                </div>

                <!-- Credit Configuration -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('credits')">
                        <span class="section-chevron" [class.section-chevron--open]="!collapsedSections().has('credits')">&#9654;</span>
                        Credit Configuration
                        @if (isDirty()) {
                            <span class="dirty-badge dirty-badge-pulse">Unsaved changes</span>
                        }
                    </h3>
                    @if (!collapsedSections().has('credits')) {
                        <div class="credit-grid section-collapse">
                            @for (field of creditFields; track field.key) {
                                <div class="credit-field">
                                    <label class="credit-label" [for]="'credit_' + field.key">{{ field.label }}</label>
                                    <input
                                        class="credit-input"
                                        [class.credit-input--dirty]="isCreditDirty(field.key)"
                                        type="number"
                                        [id]="'credit_' + field.key"
                                        [ngModel]="getCreditValue(field.key)"
                                        (ngModelChange)="setCreditValue(field.key, $event)"
                                    />
                                    <span class="credit-desc">{{ field.description }}</span>
                                </div>
                            }
                        </div>
                        <div class="credit-actions">
                            <button
                                class="save-btn"
                                [disabled]="saving() || !isDirty()"
                                (click)="saveCreditConfig()"
                            >{{ saving() ? 'Saving...' : 'Save Credit Config' }}</button>
                            @if (isDirty()) {
                                <button class="cancel-btn cancel-btn--sm" (click)="resetCreditChanges()">Discard Changes</button>
                            }
                        </div>
                    }
                </div>

                <!-- Notification Preferences -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('notifications')">
                        <span class="section-chevron" [class.section-chevron--open]="!collapsedSections().has('notifications')">&#9654;</span>
                        Notifications
                    </h3>
                    @if (!collapsedSections().has('notifications')) {
                        <div class="notification-prefs section-collapse">
                            <div class="notif-row">
                                <div class="notif-info">
                                    <span class="notif-name">Session Completed</span>
                                    <span class="notif-desc">Notify when a session finishes successfully</span>
                                </div>
                                <label class="notif-toggle">
                                    <input type="checkbox" [checked]="notifSessionComplete()" (change)="notifSessionComplete.set($any($event.target).checked); saveNotifPrefs()" />
                                    <span class="notif-toggle__track"><span class="notif-toggle__thumb"></span></span>
                                </label>
                            </div>
                            <div class="notif-row">
                                <div class="notif-info">
                                    <span class="notif-name">Session Errors</span>
                                    <span class="notif-desc">Notify when a session encounters an error</span>
                                </div>
                                <label class="notif-toggle">
                                    <input type="checkbox" [checked]="notifSessionError()" (change)="notifSessionError.set($any($event.target).checked); saveNotifPrefs()" />
                                    <span class="notif-toggle__track"><span class="notif-toggle__thumb"></span></span>
                                </label>
                            </div>
                            <div class="notif-row">
                                <div class="notif-info">
                                    <span class="notif-name">Approval Requests</span>
                                    <span class="notif-desc">Notify when an agent needs tool approval</span>
                                </div>
                                <label class="notif-toggle">
                                    <input type="checkbox" [checked]="notifApproval()" (change)="notifApproval.set($any($event.target).checked); saveNotifPrefs()" />
                                    <span class="notif-toggle__track"><span class="notif-toggle__thumb"></span></span>
                                </label>
                            </div>
                            <div class="notif-row">
                                <div class="notif-info">
                                    <span class="notif-name">Work Task Updates</span>
                                    <span class="notif-desc">Notify on PR creation, merge, or failure</span>
                                </div>
                                <label class="notif-toggle">
                                    <input type="checkbox" [checked]="notifWorkTask()" (change)="notifWorkTask.set($any($event.target).checked); saveNotifPrefs()" />
                                    <span class="notif-toggle__track"><span class="notif-toggle__thumb"></span></span>
                                </label>
                            </div>
                            <div class="notif-row">
                                <div class="notif-info">
                                    <span class="notif-name">Agent Messages</span>
                                    <span class="notif-desc">Notify when an agent sends you a message</span>
                                </div>
                                <label class="notif-toggle">
                                    <input type="checkbox" [checked]="notifAgentMessage()" (change)="notifAgentMessage.set($any($event.target).checked); saveNotifPrefs()" />
                                    <span class="notif-toggle__track"><span class="notif-toggle__thumb"></span></span>
                                </label>
                            </div>
                        </div>
                    }
                </div>

                <!-- Environment Info -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('environment')">
                        <span class="section-chevron" [class.section-chevron--open]="!collapsedSections().has('environment')">&#9654;</span>
                        Environment
                    </h3>
                    @if (!collapsedSections().has('environment')) {
                        <div class="env-grid section-collapse">
                            <div class="env-item">
                                <span class="env-key">ANTHROPIC_API_KEY</span>
                                <span class="env-value env-value--set">Configured</span>
                            </div>
                            <div class="env-item">
                                <span class="env-key">OPENROUTER_API_KEY</span>
                                <span class="env-value" [class.env-value--set]="openrouterStatus()?.status === 'available'" [class.env-value--unset]="openrouterStatus()?.status !== 'available'">
                                    {{ openrouterStatus()?.status === 'available' ? 'Configured' : 'Not set' }}
                                </span>
                            </div>
                            <div class="env-item">
                                <span class="env-key">DISCORD_TOKEN</span>
                                <span class="env-value" [class.env-value--set]="!!discordConfig()" [class.env-value--unset]="!discordConfig()">
                                    {{ discordConfig() ? 'Configured' : 'Not set' }}
                                </span>
                            </div>
                            <div class="env-item">
                                <span class="env-key">GITHUB_TOKEN</span>
                                <span class="env-value env-value--set">Configured</span>
                            </div>
                        </div>
                        <p class="env-hint">Environment variables are set in your <code>.env</code> file or system environment. Restart the server after changes.</p>
                    }
                </div>

                <!-- Database Backup -->
                <div class="settings__section">
                    <h3 class="section-toggle" (click)="toggleSection('database')">
                        <span class="section-chevron" [class.section-chevron--open]="!collapsedSections().has('database')">&#9654;</span>
                        Database
                    </h3>
                    @if (!collapsedSections().has('database')) {
                        <button
                            class="backup-btn"
                            [disabled]="backingUp()"
                            (click)="runBackup()"
                        >{{ backingUp() ? 'Backing up...' : 'Create Backup' }}</button>
                        @if (backupResult()) {
                            <p class="backup-result">{{ backupResult() }}</p>
                        }
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .settings { padding: 1.5rem; max-width: 900px; }
        .settings h2 { margin: 0 0 1.5rem; color: var(--text-primary); }
        .settings h3 { margin: 0 0 0.75rem; color: var(--text-primary); font-size: 0.85rem; }
        .loading, .muted { color: var(--text-secondary); font-size: 0.8rem; }

        /* Collapsible sections */
        .section-toggle {
            cursor: pointer; display: flex; align-items: center; gap: 0.5rem;
            user-select: none; transition: color 0.15s;
        }
        .section-toggle:hover { color: var(--accent-cyan); }
        .section-chevron { font-size: 0.55rem; color: var(--text-tertiary); width: 0.75rem; }
        .section-badge {
            font-size: 0.55rem; font-weight: 700; padding: 1px 6px; border-radius: var(--radius-sm);
            background: var(--accent-cyan-dim); color: var(--accent-cyan); border: 1px solid var(--accent-cyan);
            text-transform: uppercase; letter-spacing: 0.04em;
        }
        .section-badge--mode[data-mode="normal"] { color: var(--accent-green); border-color: var(--accent-green); background: var(--accent-green-dim); }
        .section-badge--mode[data-mode="queued"] { color: var(--accent-amber); border-color: var(--accent-amber); background: var(--accent-amber-dim); }
        .section-badge--mode[data-mode="paused"] { color: var(--accent-red); border-color: var(--accent-red); background: var(--accent-red-dim); }
        .dirty-badge {
            font-size: 0.55rem; font-weight: 600; padding: 1px 6px; border-radius: var(--radius-sm);
            background: var(--accent-amber-dim); color: var(--accent-amber); border: 1px solid var(--accent-amber);
            margin-left: auto;
        }

        /* Health grid */
        .health-grid { display: flex; flex-direction: column; gap: 0.5rem; }
        .health-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.5rem; background: var(--bg-raised); border-radius: var(--radius); }
        .health-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .health-dot[data-status="ok"] { background: var(--accent-green); box-shadow: 0 0 6px var(--accent-green); }
        .health-dot[data-status="warn"] { background: var(--accent-amber); box-shadow: 0 0 6px var(--accent-amber); }
        .health-dot[data-status="off"] { background: var(--text-tertiary); }
        .health-name { font-size: 0.75rem; font-weight: 600; color: var(--text-primary); min-width: 120px; }
        .health-status { font-size: 0.7rem; color: var(--text-secondary); }

        /* Credit dirty input */
        .credit-input--dirty { border-color: var(--accent-amber) !important; }
        .credit-actions { display: flex; gap: 0.5rem; align-items: center; }

        /* Discord config */
        .discord-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 1rem;
            margin-bottom: 1rem;
        }
        .discord-field {
            display: flex;
            flex-direction: column;
            gap: 0.2rem;
        }
        .discord-field--wide { grid-column: 1 / -1; }
        .discord-label {
            font-size: 0.7rem;
            color: var(--text-secondary);
            font-weight: 600;
        }
        .discord-input, .discord-select, .discord-textarea {
            padding: 0.45rem;
            background: var(--bg-input);
            border: 1px solid var(--border-bright);
            border-radius: var(--radius);
            color: var(--text-primary);
            font-size: 0.85rem;
            font-family: inherit;
            width: 100%;
        }
        .discord-textarea {
            resize: vertical;
            font-size: 0.75rem;
            font-family: var(--font-mono, monospace);
        }
        .discord-select { cursor: pointer; }
        .discord-input:focus, .discord-select:focus, .discord-textarea:focus {
            border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none;
        }
        .discord-desc {
            font-size: 0.6rem;
            color: var(--text-tertiary);
        }
        .discord-select--sm { padding: 0.3rem; font-size: 0.75rem; width: auto; min-width: 120px; }
        .discord-actions { display: flex; gap: 0.5rem; align-items: center; }

        /* Chip picker */
        .chip-list { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.4rem; }
        .chip {
            display: inline-flex; align-items: center; gap: 0.3rem;
            padding: 0.2rem 0.5rem; background: var(--accent-cyan-dim); color: var(--accent-cyan);
            border: 1px solid var(--accent-cyan); border-radius: var(--radius-sm);
            font-size: 0.7rem; font-weight: 600;
        }
        .chip-remove {
            background: none; border: none; color: inherit; cursor: pointer;
            font-size: 0.85rem; padding: 0; line-height: 1; opacity: 0.7;
        }
        .chip-remove:hover { opacity: 1; }
        .picker-search { margin-bottom: 0.3rem; }
        .picker-results {
            display: flex; flex-direction: column; gap: 0.15rem;
            max-height: 160px; overflow-y: auto;
            background: var(--bg-raised); border: 1px solid var(--border);
            border-radius: var(--radius); padding: 0.3rem;
        }
        .picker-item {
            background: none; border: none; color: var(--text-primary);
            text-align: left; padding: 0.3rem 0.5rem; cursor: pointer;
            border-radius: var(--radius-sm); font-size: 0.75rem; font-family: inherit;
            display: flex; justify-content: space-between; align-items: center;
        }
        .picker-item:hover { background: var(--bg-surface); color: var(--accent-cyan); }
        .picker-id { font-size: 0.6rem; color: var(--text-tertiary); font-family: var(--font-mono, monospace); }
        .picker-empty { font-size: 0.7rem; color: var(--text-tertiary); padding: 0.3rem 0.5rem; }

        /* Role/Channel permission grid */
        .role-perm-grid { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.4rem; }
        .role-perm-row {
            display: flex; align-items: center; gap: 0.5rem;
            padding: 0.3rem 0.5rem; background: var(--bg-raised);
            border-radius: var(--radius-sm);
        }
        .role-name { font-size: 0.75rem; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .channel-name { font-size: 0.75rem; font-weight: 600; flex: 1; color: var(--text-primary); }

        .settings__section {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 1.25rem;
            margin-bottom: 1.25rem;
        }

        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 0.75rem;
        }
        .info-item {
            display: flex;
            flex-direction: column;
            gap: 0.2rem;
        }
        .info-label {
            font-size: 0.6rem;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }
        .info-value {
            font-size: 1rem;
            font-weight: 700;
            color: var(--text-primary);
        }
        .info-value--active { color: var(--accent-green); }
        .info-value--inactive { color: var(--accent-red); }
        .info-code {
            background: var(--bg-raised);
            color: var(--accent-magenta);
            padding: 2px 6px;
            border-radius: var(--radius-sm);
            font-size: 0.7rem;
            border: 1px solid var(--border);
            word-break: break-all;
        }
        .network-badge {
            text-transform: uppercase;
            font-size: 0.75rem;
        }
        .network-badge[data-network="testnet"] { color: var(--network-testnet); }
        .network-badge[data-network="mainnet"] { color: var(--network-mainnet); }
        .network-badge[data-network="localnet"] { color: var(--accent-gold); }
        .algo-balance--low { color: var(--accent-red, #ff4d4f) !important; }

        /* Connect Mobile — Contact List */
        .connect-desc {
            font-size: 0.75rem;
            color: var(--text-secondary);
            margin-bottom: 1rem;
        }
        .contact-list {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            margin-bottom: 1rem;
            max-height: 500px;
            overflow-y: auto;
        }
        .contact-card {
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 0.75rem;
        }
        .contact-header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.35rem;
        }
        .contact-nickname {
            font-weight: 700;
            font-size: 0.85rem;
            color: var(--text-primary);
            cursor: pointer;
        }
        .contact-nickname-input {
            padding: 0.25rem 0.4rem;
            background: var(--bg-input);
            border: 1px solid var(--accent-cyan);
            border-radius: var(--radius-sm);
            color: var(--text-primary);
            font-size: 0.8rem;
            font-family: inherit;
            font-weight: 600;
            outline: none;
            width: 140px;
        }
        .contact-status {
            font-size: 0.65rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-left: auto;
        }
        .contact-status--active { color: var(--accent-green); }
        .contact-status--waiting { color: var(--accent-yellow, #f5a623); }
        .contact-address {
            display: block;
            font-size: 0.6rem;
            color: var(--accent-magenta);
            background: var(--bg-surface);
            padding: 2px 4px;
            border-radius: var(--radius-sm);
            margin-bottom: 0.4rem;
            word-break: break-all;
        }
        .contact-actions {
            display: flex;
            gap: 0.4rem;
            flex-wrap: wrap;
        }
        .icon-btn {
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            font-size: 0.85rem;
            padding: 0.1rem 0.3rem;
            border-radius: var(--radius-sm);
        }
        .icon-btn:hover { color: var(--text-primary); background: var(--bg-surface); }
        .qr-container {
            display: flex;
            justify-content: center;
            margin-top: 0.75rem;
        }
        .qr-canvas {
            border-radius: var(--radius);
            border: 2px solid var(--accent-cyan);
            box-shadow: 0 0 12px rgba(0, 229, 255, 0.2);
        }
        .add-contact {
            margin-top: 0.5rem;
        }
        .add-contact-form {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        /* Operational mode */
        .mode-selector {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 0.5rem;
        }
        .mode-btn {
            padding: 0.45rem 0.85rem;
            background: var(--bg-raised);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            color: var(--text-secondary);
            font-size: 0.75rem;
            font-family: inherit;
            font-weight: 600;
            cursor: pointer;
            text-transform: capitalize;
            transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .mode-btn:hover { border-color: var(--border-bright); color: var(--text-primary); }
        .mode-btn--active {
            border-color: var(--accent-cyan);
            color: var(--accent-cyan);
            background: var(--accent-cyan-dim);
        }
        .mode-desc {
            font-size: 0.7rem;
            color: var(--text-tertiary);
            margin: 0;
        }

        /* Credit fields */
        .credit-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 1rem;
            margin-bottom: 1rem;
        }
        .credit-field {
            display: flex;
            flex-direction: column;
            gap: 0.2rem;
        }
        .credit-label {
            font-size: 0.7rem;
            color: var(--text-secondary);
            font-weight: 600;
        }
        .credit-input {
            padding: 0.45rem;
            background: var(--bg-input);
            border: 1px solid var(--border-bright);
            border-radius: var(--radius);
            color: var(--text-primary);
            font-size: 0.85rem;
            font-family: inherit;
            width: 100%;
        }
        .credit-input:focus { border-color: var(--accent-cyan); box-shadow: var(--glow-cyan); outline: none; }
        .credit-desc {
            font-size: 0.6rem;
            color: var(--text-tertiary);
        }

        /* Buttons */
        .save-btn, .backup-btn, .cancel-btn {
            padding: 0.5rem 1.25rem;
            border-radius: var(--radius);
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            font-family: inherit;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            transition: background 0.15s;
        }
        .save-btn {
            background: var(--accent-cyan-dim);
            color: var(--accent-cyan);
            border: 1px solid var(--accent-cyan);
        }
        .save-btn:hover:not(:disabled) { background: rgba(0, 229, 255, 0.2); }
        .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .save-btn--sm, .cancel-btn--sm {
            padding: 0.3rem 0.7rem;
            font-size: 0.65rem;
        }
        .backup-btn {
            background: var(--accent-magenta-dim);
            color: var(--accent-magenta);
            border: 1px solid var(--accent-magenta);
        }
        .backup-btn:hover:not(:disabled) { background: rgba(255, 0, 170, 0.2); }
        .backup-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .cancel-btn {
            background: transparent;
            color: var(--accent-red, #ff4d4f);
            border: 1px solid var(--accent-red, #ff4d4f);
        }
        .cancel-btn:hover { background: rgba(255, 77, 79, 0.1); }
        .backup-result {
            font-size: 0.7rem;
            color: var(--accent-green);
            margin-top: 0.5rem;
        }

        /* Notification preferences */
        .notification-prefs { display: flex; flex-direction: column; gap: 0.35rem; }
        .notif-row {
            display: flex; align-items: center; justify-content: space-between;
            padding: 0.55rem 0.65rem; background: var(--bg-raised);
            border-radius: var(--radius); gap: 1rem;
        }
        .notif-info { display: flex; flex-direction: column; gap: 0.1rem; }
        .notif-name { font-size: 0.75rem; font-weight: 600; color: var(--text-primary); }
        .notif-desc { font-size: 0.6rem; color: var(--text-tertiary); }
        .notif-toggle { position: relative; display: inline-flex; cursor: pointer; }
        .notif-toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
        .notif-toggle__track {
            width: 36px; height: 20px; border-radius: 10px;
            background: var(--border-bright); transition: background 0.2s;
            position: relative; flex-shrink: 0;
        }
        .notif-toggle input:checked + .notif-toggle__track { background: var(--accent-cyan); }
        .notif-toggle__thumb {
            position: absolute; top: 2px; left: 2px;
            width: 16px; height: 16px; border-radius: 50%;
            background: var(--text-primary); transition: transform 0.2s;
        }
        .notif-toggle input:checked + .notif-toggle__track .notif-toggle__thumb {
            transform: translateX(16px);
            background: var(--bg-deep);
        }

        /* Environment info */
        .env-grid { display: flex; flex-direction: column; gap: 0.35rem; }
        .env-item {
            display: flex; align-items: center; justify-content: space-between;
            padding: 0.45rem 0.65rem; background: var(--bg-raised); border-radius: var(--radius);
        }
        .env-key {
            font-size: 0.7rem; font-weight: 600; color: var(--text-primary);
            font-family: var(--font-mono, monospace);
        }
        .env-value { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
        .env-value--set { color: var(--accent-green); }
        .env-value--unset { color: var(--text-tertiary); }
        .env-hint { font-size: 0.65rem; color: var(--text-tertiary); margin-top: 0.5rem; }
        .env-hint code {
            background: var(--bg-raised); padding: 1px 4px; border-radius: 3px;
            font-size: 0.6rem; border: 1px solid var(--border);
        }

        @media (max-width: 600px) {
            .settings { padding: 1rem; }
            .discord-grid { grid-template-columns: 1fr; }
            .credit-grid { grid-template-columns: 1fr; }
            .info-grid { grid-template-columns: 1fr; }
            .mode-selector { flex-wrap: wrap; }
            .notif-row { flex-direction: column; align-items: stretch; gap: 0.35rem; }
            .notif-toggle { align-self: flex-end; }
        }
    `,
})
export class SettingsComponent implements OnInit {
    private readonly api = inject(ApiService);
    private readonly notifications = inject(NotificationService);
    private readonly sessionService = inject(SessionService);
    private readonly tourService = inject(GuidedTourService);
    private readonly settingsRouter = inject(Router);
    private readonly elRef = inject(ElementRef);

    readonly loading = signal(true);
    readonly saving = signal(false);
    readonly backingUp = signal(false);
    readonly settings = signal<SettingsData | null>(null);
    readonly operationalMode = signal('normal');
    readonly backupResult = signal<string | null>(null);
    readonly algochatStatus = this.sessionService.algochatStatus;

    // Discord config state
    readonly discordConfig = signal<DiscordConfig | null>(null);
    readonly discordValues = signal<Record<string, string>>({});
    readonly savingDiscord = signal(false);
    readonly discordDirty = computed(() => Object.keys(this.discordValues()).length > 0);

    // Guild cache for smart pickers
    readonly guildChannels = signal<GuildChannel[]>([]);
    readonly guildRoles = signal<GuildRole[]>([]);
    readonly agentsList = signal<SimpleAgent[]>([]);
    readonly channelSearch = signal('');
    readonly channelPermSearch = signal('');

    // Multi-contact PSK state
    readonly pskContacts = signal<PSKContact[]>([]);
    readonly expandedContactId = signal<string | null>(null);
    readonly addingContact = signal(false);
    readonly newContactNickname = signal('');
    readonly creatingContact = signal(false);
    readonly editingContactId = signal<string | null>(null);
    readonly editingNickname = signal('');

    // OpenRouter state
    readonly openrouterStatus = signal<{ status: string; configuredModels?: number } | null>(null);
    readonly openrouterModels = signal<Array<{ model: string; displayName: string; inputPricePerMillion: number; outputPricePerMillion: number }>>([]);

    // Notification preferences
    readonly notifSessionComplete = signal(true);
    readonly notifSessionError = signal(true);
    readonly notifApproval = signal(true);
    readonly notifWorkTask = signal(true);
    readonly notifAgentMessage = signal(false);

    // Collapsible sections
    readonly collapsedSections = signal<Set<string>>(new Set());

    // Mutable copy for credit config editing
    private creditValues: Record<string, string> = {};
    readonly dirtyKeys = signal<Set<string>>(new Set());
    readonly isDirty = computed(() => this.dirtyKeys().size > 0);

    readonly modes = ['normal', 'queued', 'paused'];

    readonly creditFields = [
        { key: 'credits_per_algo', label: 'Credits per ALGO', description: 'How many credits 1 ALGO buys' },
        { key: 'credits_per_turn', label: 'Credits per Turn', description: 'Credits consumed per agent turn' },
        { key: 'credits_per_agent_message', label: 'Credits per Agent Message', description: 'Credits for agent-to-agent messages' },
        { key: 'low_credit_threshold', label: 'Low Credit Warning', description: 'Threshold for low-balance warnings' },
        { key: 'free_credits_on_first_message', label: 'Free Credits (First Message)', description: 'Credits given on first contact' },
        { key: 'reserve_per_group_message', label: 'Reserve per Group Message', description: 'Credits reserved for group chats' },
    ];

    ngOnInit(): void {
        this.loadAll();
    }

    /** Helper for template input events. */
    asInputValue(event: Event): string {
        return (event.target as HTMLInputElement).value;
    }

    replayTour(): void {
        this.tourService.reset();
        this.settingsRouter.navigate(['/dashboard']).then(() => {
            setTimeout(() => this.tourService.startTour(), 400);
        });
    }

    saveNotifPrefs(): void {
        const prefs = {
            sessionComplete: this.notifSessionComplete(),
            sessionError: this.notifSessionError(),
            approval: this.notifApproval(),
            workTask: this.notifWorkTask(),
            agentMessage: this.notifAgentMessage(),
        };
        localStorage.setItem('corvid_notif_prefs', JSON.stringify(prefs));
        this.notifications.success('Notification preferences saved');
    }

    private loadNotifPrefs(): void {
        try {
            const raw = localStorage.getItem('corvid_notif_prefs');
            if (raw) {
                const prefs = JSON.parse(raw);
                if (typeof prefs.sessionComplete === 'boolean') this.notifSessionComplete.set(prefs.sessionComplete);
                if (typeof prefs.sessionError === 'boolean') this.notifSessionError.set(prefs.sessionError);
                if (typeof prefs.approval === 'boolean') this.notifApproval.set(prefs.approval);
                if (typeof prefs.workTask === 'boolean') this.notifWorkTask.set(prefs.workTask);
                if (typeof prefs.agentMessage === 'boolean') this.notifAgentMessage.set(prefs.agentMessage);
            }
        } catch { /* ignore corrupt localStorage */ }
    }

    toggleSection(section: string): void {
        this.collapsedSections.update((set) => {
            const next = new Set(set);
            if (next.has(section)) next.delete(section);
            else next.add(section);
            return next;
        });
    }

    getCreditValue(key: string): string {
        return this.creditValues[key] ?? this.settings()?.creditConfig?.[key] ?? '';
    }

    setCreditValue(key: string, value: string): void {
        this.creditValues[key] = value;
        const original = this.settings()?.creditConfig?.[key] ?? '';
        this.dirtyKeys.update((set) => {
            const next = new Set(set);
            if (value === original) next.delete(key);
            else next.add(key);
            return next;
        });
    }

    isCreditDirty(key: string): boolean {
        return this.dirtyKeys().has(key);
    }

    resetCreditChanges(): void {
        this.creditValues = {};
        this.dirtyKeys.set(new Set());
    }

    async setMode(mode: string): Promise<void> {
        try {
            await firstValueFrom(this.api.post<{ ok: boolean }>('/operational-mode', { mode }));
            this.operationalMode.set(mode);
            this.notifications.success(`Operational mode set to ${mode}`);
        } catch {
            this.notifications.error('Failed to update operational mode');
        }
    }

    async saveCreditConfig(): Promise<void> {
        if (!this.isDirty()) return;
        this.saving.set(true);
        try {
            await firstValueFrom(this.api.put<{ ok: boolean }>('/settings/credits', this.creditValues));
            this.notifications.success('Credit configuration saved');
            this.creditValues = {};
            this.dirtyKeys.set(new Set());
        } catch {
            this.notifications.error('Failed to save credit configuration');
        } finally {
            this.saving.set(false);
        }
    }

    async runBackup(): Promise<void> {
        this.backingUp.set(true);
        this.backupResult.set(null);
        try {
            const result = await firstValueFrom(this.api.post<{ path: string }>('/backup'));
            this.backupResult.set(`Backup created: ${result.path}`);
            this.notifications.success('Database backup created');
        } catch {
            this.notifications.error('Backup failed');
        } finally {
            this.backingUp.set(false);
        }
    }

    // ── Multi-contact PSK methods ────────────────────────────────────

    async createContact(): Promise<void> {
        const nickname = this.newContactNickname().trim();
        if (!nickname) {
            this.notifications.error('Please enter a nickname');
            return;
        }
        this.creatingContact.set(true);
        try {
            const result = await firstValueFrom(
                this.api.post<{ id: string; uri: string; nickname: string }>('/algochat/psk-contacts', { nickname })
            );
            // Reload contacts list and auto-expand the new one
            await this.loadPSKContacts();
            this.newContactNickname.set('');
            this.addingContact.set(false);
            this.notifications.success(`Contact "${result.nickname}" created`);
            // Auto-expand QR for the new contact
            this.toggleQR({ ...result, network: '', mobileAddress: null, active: true, createdAt: '', uri: result.uri });
        } catch {
            this.notifications.error('Failed to create contact');
        } finally {
            this.creatingContact.set(false);
        }
    }

    async toggleQR(contact: PSKContact): Promise<void> {
        if (this.expandedContactId() === contact.id) {
            this.expandedContactId.set(null);
            return;
        }

        // Load URI if not cached
        if (!contact.uri) {
            try {
                const result = await firstValueFrom(
                    this.api.get<{ uri: string }>(`/algochat/psk-contacts/${contact.id}/qr`)
                );
                contact.uri = result.uri;
                // Update in the contacts array
                this.pskContacts.update((list) => list.map((c) => c.id === contact.id ? { ...c, uri: result.uri } : c));
            } catch {
                this.notifications.error('Failed to load QR code');
                return;
            }
        }

        this.expandedContactId.set(contact.id);
        this.renderQRWhenReady(contact.uri!);
    }

    async copyContactUri(contact: PSKContact): Promise<void> {
        let uri = contact.uri;
        if (!uri) {
            try {
                const result = await firstValueFrom(
                    this.api.get<{ uri: string }>(`/algochat/psk-contacts/${contact.id}/qr`)
                );
                uri = result.uri;
            } catch {
                this.notifications.error('Failed to get URI');
                return;
            }
        }
        await navigator.clipboard.writeText(uri);
        this.notifications.success('URI copied to clipboard');
    }

    async cancelContact(contact: PSKContact): Promise<void> {
        if (!confirm(`Delete contact "${contact.nickname}"? They will no longer be able to message your agent.`)) {
            return;
        }
        try {
            await firstValueFrom(this.api.delete(`/algochat/psk-contacts/${contact.id}`));
            this.notifications.success(`Contact "${contact.nickname}" deleted`);
            if (this.expandedContactId() === contact.id) {
                this.expandedContactId.set(null);
            }
            await this.loadPSKContacts();
        } catch {
            this.notifications.error('Failed to delete contact');
        }
    }

    startEditNickname(contact: PSKContact): void {
        this.editingContactId.set(contact.id);
        this.editingNickname.set(contact.nickname);
    }

    cancelEditNickname(): void {
        this.editingContactId.set(null);
        this.editingNickname.set('');
    }

    async saveNickname(contactId: string): Promise<void> {
        const nickname = this.editingNickname().trim();
        if (!nickname) return;
        try {
            await firstValueFrom(
                this.api.patch(`/algochat/psk-contacts/${contactId}`, { nickname })
            );
            this.pskContacts.update((list) => list.map((c) => c.id === contactId ? { ...c, nickname } : c));
            this.editingContactId.set(null);
            this.notifications.success('Contact renamed');
        } catch {
            this.notifications.error('Failed to rename contact');
        }
    }

    // ── Discord config methods ────────────────────────────────────────

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
            // Merge saved values into the loaded config
            this.discordConfig.update(cfg => cfg ? { ...cfg, ...updates } : cfg);
            this.discordValues.set({});
            this.notifications.success('Discord configuration saved');
        } catch {
            this.notifications.error('Failed to save Discord configuration');
        } finally {
            this.savingDiscord.set(false);
        }
    }

    // ── Guild-aware pickers ─────────────────────────────────────────

    /** Text channels from guild cache, sorted by position. */
    get textChannels(): GuildChannel[] {
        return this.guildChannels().filter(c => c.type === 0).sort((a, b) => a.position - b.position);
    }

    /** Currently selected additional channel IDs as an array. */
    private getSelectedChannelIds(): string[] {
        const raw = this.discordValues()['additional_channel_ids'] ?? this.discordConfig()?.additional_channel_ids ?? '';
        return raw.split(',').map(s => s.trim()).filter(Boolean);
    }

    /** Selected channels resolved to objects (for chip display). */
    getSelectedChannels(): { id: string; name: string }[] {
        const ids = this.getSelectedChannelIds();
        const channelMap = new Map(this.guildChannels().map(c => [c.id, c]));
        return ids.map(id => {
            const ch = channelMap.get(id);
            return { id, name: ch?.name ?? id };
        });
    }

    /** Channels matching search that aren't already selected. */
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

    /** Roles that can be configured (not @everyone, not bot-managed). */
    getConfigurableRoles(): GuildRole[] {
        return this.guildRoles()
            .filter(r => r.name !== '@everyone' && !r.managed)
            .sort((a, b) => b.position - a.position);
    }

    /** Get a role's configured permission level. */
    getRolePermLevel(roleId: string): string {
        const raw = this.discordValues()['role_permissions'] ?? this.discordConfig()?.role_permissions ?? '{}';
        try {
            const perms = JSON.parse(raw) as Record<string, number>;
            return perms[roleId] !== undefined ? String(perms[roleId]) : '';
        } catch {
            return '';
        }
    }

    /** Set a role's permission level in the JSON. */
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

    /** Convert role color int to CSS hex. */
    roleColor(role: GuildRole): string {
        if (!role.color) return 'var(--text-primary)';
        return '#' + role.color.toString(16).padStart(6, '0');
    }

    // ── Channel Permissions ──────────────────────────────────────────

    private getChannelPerms(): Record<string, number> {
        const raw = this.discordValues()['channel_permissions'] ?? this.discordConfig()?.channel_permissions ?? '{}';
        try { return JSON.parse(raw); } catch { return {}; }
    }

    getChannelPermEntries(): { id: string; name: string; level: number }[] {
        const perms = this.getChannelPerms();
        const channelMap = new Map(this.guildChannels().map(c => [c.id, c]));
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
            perms[channelId] = 2; // Default to Standard
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

    /** String helper for template. */
    String = String;

    private async loadDiscordConfig(): Promise<void> {
        try {
            const result = await firstValueFrom(
                this.api.get<{ discordConfig: DiscordConfig }>('/settings/discord')
            );
            this.discordConfig.set(result.discordConfig);
        } catch {
            // Non-critical — user may not have permission or Discord not configured
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
            // Non-critical — guild cache may not exist yet
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

    // ── Private ──────────────────────────────────────────────────────

    /** Retry rendering until the canvas element is available in the DOM. */
    private renderQRWhenReady(uri: string, attempt = 0): void {
        if (attempt > 20) return;
        const canvas = this.elRef.nativeElement.querySelector('.qr-canvas') as HTMLCanvasElement | null;
        if (canvas) {
            QRCode.toCanvas(canvas, uri, {
                width: 280,
                margin: 2,
                color: {
                    dark: '#0a0a12',
                    light: '#e0f7fa',
                },
            });
        } else {
            setTimeout(() => this.renderQRWhenReady(uri, attempt + 1), 50);
        }
    }

    private async loadPSKContacts(): Promise<void> {
        try {
            const result = await firstValueFrom(
                this.api.get<{ contacts: PSKContact[] }>('/algochat/psk-contacts')
            );
            this.pskContacts.set(result.contacts);
        } catch {
            // Non-critical
        }
    }

    private async loadAll(): Promise<void> {
        this.loading.set(true);
        this.loadNotifPrefs();
        try {
            const [settings, mode] = await Promise.all([
                firstValueFrom(this.api.get<SettingsData>('/settings')),
                firstValueFrom(this.api.get<OperationalMode>('/operational-mode')),
            ]);
            this.settings.set(settings);
            this.operationalMode.set(mode.mode);
            this.sessionService.loadAlgoChatStatus();

            // Load PSK contacts, Discord config, guild cache, agents, and OpenRouter status in parallel
            await Promise.all([
                this.loadPSKContacts(),
                this.loadDiscordConfig(),
                this.loadGuildCache(),
                this.loadAgentsList(),
                this.loadOpenRouterStatus(),
            ]);
        } catch {
            // Non-critical
        } finally {
            this.loading.set(false);
        }
    }

    private async loadOpenRouterStatus(): Promise<void> {
        try {
            const status = await firstValueFrom(this.api.get<{ status: string; configuredModels?: number }>('/openrouter/status'));
            this.openrouterStatus.set(status);

            if (status.status === 'available') {
                const configured = await firstValueFrom(this.api.get<{ models: Array<{ model: string; displayName: string; inputPricePerMillion: number; outputPricePerMillion: number }> }>('/openrouter/models/configured'));
                this.openrouterModels.set(configured.models ?? []);
            }
        } catch {
            this.openrouterStatus.set({ status: 'unavailable' });
        }
    }
}
