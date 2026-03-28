import { Routes } from '@angular/router';
import { SubTabShellComponent } from './shared/components/sub-tab-shell.component';
import type { SubTab } from './shared/components/sub-tab-shell.component';

// ── Sub-tab configurations ──────────────────────────────────────────────

const SETTINGS_TABS: SubTab[] = [
    { label: 'General', path: './', exact: true },
    { label: 'Security', path: 'security' },
    { label: 'Access Control', path: 'access-control' },
    { label: 'Automation', path: 'automation' },
    { label: 'Integrations', path: 'integrations' },
];

const AGENTS_TABS: SubTab[] = [
    { label: 'All Agents', path: './', exact: true },
    { label: 'Flock Directory', path: 'flock-directory' },
    { label: 'Projects', path: 'projects' },
    { label: 'Models', path: 'models' },
];

const SESSIONS_TABS: SubTab[] = [
    { label: 'Conversations', path: './', exact: true },
    { label: 'Work Tasks', path: 'work-tasks' },
    { label: 'Councils', path: 'councils' },
];

const OBSERVE_TABS: SubTab[] = [
    { label: 'Comms', path: './', exact: true },
    { label: 'Memory', path: 'memory' },
    { label: 'Analytics', path: 'analytics' },
    { label: 'Logs', path: 'logs' },
    { label: 'Reputation', path: 'reputation' },
];

// ── Route definitions ───────────────────────────────────────────────────

export const routes: Routes = [
    { path: '', redirectTo: 'chat', pathMatch: 'full' },
    {
        path: 'chat',
        loadComponent: () =>
            import('./features/chat-home/chat-home.component').then((m) => m.ChatHomeComponent),
    },
    {
        path: 'dashboard',
        loadComponent: () =>
            import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
    },

    // ── Agents (consolidated) ───────────────────────────────────────────
    {
        path: 'agents',
        component: SubTabShellComponent,
        data: { tabs: AGENTS_TABS, groupLabel: 'Agents' },
        children: [
            {
                path: '',
                loadComponent: () =>
                    import('./features/agents/agent-list.component').then((m) => m.AgentListComponent),
            },
            {
                path: 'flock-directory',
                loadComponent: () =>
                    import('./features/flock-directory/flock-directory.component').then((m) => m.FlockDirectoryComponent),
            },
            {
                path: 'projects',
                loadComponent: () =>
                    import('./features/projects/project-list.component').then((m) => m.ProjectListComponent),
            },
            {
                path: 'projects/new',
                loadComponent: () =>
                    import('./features/projects/project-form.component').then((m) => m.ProjectFormComponent),
            },
            {
                path: 'projects/:id',
                loadComponent: () =>
                    import('./features/projects/project-detail.component').then((m) => m.ProjectDetailComponent),
            },
            {
                path: 'projects/:id/edit',
                loadComponent: () =>
                    import('./features/projects/project-form.component').then((m) => m.ProjectFormComponent),
            },
            {
                path: 'models',
                loadComponent: () =>
                    import('./features/models/models.component').then((m) => m.ModelsComponent),
            },
            // Personas & Skill Bundles remain accessible at old paths but removed from tabs
            {
                path: 'personas',
                loadComponent: () =>
                    import('./features/personas/persona-manager.component').then((m) => m.PersonaManagerComponent),
            },
            {
                path: 'skill-bundles',
                loadComponent: () =>
                    import('./features/skill-bundles/skill-bundle-list.component').then((m) => m.SkillBundleListComponent),
            },
            {
                path: 'new',
                loadComponent: () =>
                    import('./features/agents/agent-form.component').then((m) => m.AgentFormComponent),
            },
            {
                path: ':id',
                loadComponent: () =>
                    import('./features/agents/agent-detail.component').then((m) => m.AgentDetailComponent),
            },
            {
                path: ':id/edit',
                loadComponent: () =>
                    import('./features/agents/agent-form.component').then((m) => m.AgentFormComponent),
            },
        ],
    },

    // ── Sessions ───────────────────────────────────────────────────────
    {
        path: 'sessions',
        component: SubTabShellComponent,
        data: { tabs: SESSIONS_TABS, groupLabel: 'Sessions' },
        children: [
            {
                path: '',
                loadComponent: () =>
                    import('./features/sessions/session-list.component').then((m) => m.SessionListComponent),
            },
            // /sessions/new redirects to /chat (consolidated)
            { path: 'new', redirectTo: '/chat', pathMatch: 'full' },
            {
                path: 'work-tasks',
                loadComponent: () =>
                    import('./features/work-tasks/work-task-list.component').then((m) => m.WorkTaskListComponent),
            },
            {
                path: 'councils',
                loadComponent: () =>
                    import('./features/councils/council-list.component').then((m) => m.CouncilListComponent),
            },
            {
                path: 'councils/new',
                loadComponent: () =>
                    import('./features/councils/council-form.component').then((m) => m.CouncilFormComponent),
            },
            {
                path: 'councils/:id',
                loadComponent: () =>
                    import('./features/councils/council-detail.component').then((m) => m.CouncilDetailComponent),
            },
            {
                path: 'councils/:id/edit',
                loadComponent: () =>
                    import('./features/councils/council-form.component').then((m) => m.CouncilFormComponent),
            },
            {
                path: 'council-launches/:id',
                loadComponent: () =>
                    import('./features/councils/council-launch-view.component').then((m) => m.CouncilLaunchViewComponent),
            },
            // Backwards-compat: old observe views that lived under sessions/*
            { path: 'feed', redirectTo: '/observe', pathMatch: 'full' },
            { path: 'analytics', redirectTo: '/observe/analytics', pathMatch: 'full' },
            { path: 'logs', redirectTo: '/observe/logs', pathMatch: 'full' },
            { path: 'brain-viewer', redirectTo: '/observe/memory', pathMatch: 'full' },
            { path: 'reputation', redirectTo: '/observe/reputation', pathMatch: 'full' },
            {
                path: ':id',
                loadComponent: () =>
                    import('./features/sessions/session-view.component').then((m) => m.SessionViewComponent),
            },
        ],
    },

    // ── Observe (monitoring & analytics) ─────────────────────────────
    {
        path: 'observe',
        component: SubTabShellComponent,
        data: { tabs: OBSERVE_TABS, groupLabel: 'Observe' },
        children: [
            {
                path: '',
                loadComponent: () =>
                    import('./features/comms/unified-comms.component').then((m) => m.UnifiedCommsComponent),
            },
            {
                path: 'memory',
                loadComponent: () =>
                    import('./features/memory/unified-memory.component').then((m) => m.UnifiedMemoryComponent),
            },
            {
                path: 'analytics',
                loadComponent: () =>
                    import('./features/analytics/analytics.component').then((m) => m.AnalyticsComponent),
            },
            {
                path: 'logs',
                loadComponent: () =>
                    import('./features/logs/system-logs.component').then((m) => m.SystemLogsComponent),
            },
            {
                path: 'reputation',
                loadComponent: () =>
                    import('./features/reputation/reputation.component').then((m) => m.ReputationComponent),
            },
            // Backwards-compat redirects for old observe paths
            { path: 'live-feed', redirectTo: '/observe', pathMatch: 'full' },
            { path: 'agent-comms', redirectTo: '/observe', pathMatch: 'full' },
            { path: 'brain-viewer', redirectTo: '/observe/memory', pathMatch: 'full' },
            { path: 'memory-browser', redirectTo: '/observe/memory', pathMatch: 'full' },
        ],
    },

    // ── Settings (consolidated — 5 tabs) ─────────────────────────────
    {
        path: 'settings',
        component: SubTabShellComponent,
        data: { tabs: SETTINGS_TABS, groupLabel: 'Settings' },
        children: [
            {
                path: '',
                loadComponent: () =>
                    import('./features/settings/settings.component').then((m) => m.SettingsComponent),
            },
            {
                path: 'security',
                loadComponent: () =>
                    import('./features/settings-security/settings-security.component').then((m) => m.SettingsSecurityComponent),
            },
            {
                path: 'access-control',
                loadComponent: () =>
                    import('./features/settings-access/settings-access.component').then((m) => m.SettingsAccessComponent),
            },
            {
                path: 'automation',
                loadComponent: () =>
                    import('./features/settings-automation/settings-automation.component').then((m) => m.SettingsAutomationComponent),
            },
            {
                path: 'integrations',
                loadComponent: () =>
                    import('./features/settings-integrations/settings-integrations.component').then((m) => m.SettingsIntegrationsComponent),
            },
            // Backwards-compat: old flat settings paths → consolidated tabs
            { path: 'wallets', redirectTo: '/settings/security', pathMatch: 'full' },
            { path: 'spending', redirectTo: '/settings/security', pathMatch: 'full' },
            { path: 'allowlist', redirectTo: '/settings/access-control', pathMatch: 'full' },
            { path: 'github-allowlist', redirectTo: '/settings/access-control', pathMatch: 'full' },
            { path: 'repo-blocklist', redirectTo: '/settings/access-control', pathMatch: 'full' },
            { path: 'schedules', redirectTo: '/settings/automation', pathMatch: 'full' },
            { path: 'workflows', redirectTo: '/settings/automation', pathMatch: 'full' },
            { path: 'webhooks', redirectTo: '/settings/automation', pathMatch: 'full' },
            { path: 'mention-polling', redirectTo: '/settings/automation', pathMatch: 'full' },
            { path: 'mcp-servers', redirectTo: '/settings/integrations', pathMatch: 'full' },
            { path: 'contacts', redirectTo: '/settings/integrations', pathMatch: 'full' },
            { path: 'marketplace', redirectTo: '/settings/integrations', pathMatch: 'full' },
        ],
    },

    // ── Backwards-compatibility redirects ────────────────────────────────
    // Old flat paths -> nested paths
    { path: 'projects', redirectTo: 'agents/projects', pathMatch: 'full' },
    { path: 'projects/new', redirectTo: 'agents/projects/new', pathMatch: 'full' },
    { path: 'projects/:id', redirectTo: 'agents/projects/:id' },
    { path: 'models', redirectTo: 'agents/models', pathMatch: 'full' },
    { path: 'personas', redirectTo: 'agents/personas', pathMatch: 'full' },
    { path: 'skill-bundles', redirectTo: 'agents/skill-bundles', pathMatch: 'full' },
    { path: 'flock-directory', redirectTo: 'agents/flock-directory', pathMatch: 'full' },
    { path: 'work-tasks', redirectTo: 'sessions/work-tasks', pathMatch: 'full' },
    { path: 'councils', redirectTo: 'sessions/councils', pathMatch: 'full' },
    { path: 'council-launches/:id', redirectTo: 'sessions/council-launches/:id' },

    // Old flat observe paths -> observe/*
    { path: 'feed', redirectTo: 'observe', pathMatch: 'full' },
    { path: 'analytics', redirectTo: 'observe/analytics', pathMatch: 'full' },
    { path: 'logs', redirectTo: 'observe/logs', pathMatch: 'full' },
    { path: 'brain-viewer', redirectTo: 'observe/memory', pathMatch: 'full' },
    { path: 'reputation', redirectTo: 'observe/reputation', pathMatch: 'full' },
    { path: 'memory-browser', redirectTo: 'observe/memory', pathMatch: 'full' },
    { path: 'agent-comms', redirectTo: 'observe', pathMatch: 'full' },

    // Old automate paths -> settings/*
    { path: 'automate', redirectTo: 'settings/automation', pathMatch: 'full' },
    { path: 'automate/workflows', redirectTo: 'settings/automation', pathMatch: 'full' },
    { path: 'automate/webhooks', redirectTo: 'settings/automation', pathMatch: 'full' },
    { path: 'automate/mention-polling', redirectTo: 'settings/automation', pathMatch: 'full' },
    { path: 'automate/mcp-servers', redirectTo: 'settings/integrations', pathMatch: 'full' },
    { path: 'schedules', redirectTo: 'settings/automation', pathMatch: 'full' },
    { path: 'workflows', redirectTo: 'settings/automation', pathMatch: 'full' },
    { path: 'webhooks', redirectTo: 'settings/automation', pathMatch: 'full' },
    { path: 'mention-polling', redirectTo: 'settings/automation', pathMatch: 'full' },
    { path: 'mcp-servers', redirectTo: 'settings/integrations', pathMatch: 'full' },

    // Old flat settings paths
    { path: 'security', redirectTo: 'settings/security', pathMatch: 'full' },
    { path: 'wallets', redirectTo: 'settings/security', pathMatch: 'full' },
    { path: 'spending', redirectTo: 'settings/security', pathMatch: 'full' },
    { path: 'allowlist', redirectTo: 'settings/access-control', pathMatch: 'full' },
    { path: 'github-allowlist', redirectTo: 'settings/access-control', pathMatch: 'full' },
    { path: 'repo-blocklist', redirectTo: 'settings/access-control', pathMatch: 'full' },
    { path: 'marketplace', redirectTo: 'settings/integrations', pathMatch: 'full' },

    {
        path: '**',
        loadComponent: () =>
            import('./shared/components/route-error.component').then((m) => m.RouteErrorComponent),
    },
];
