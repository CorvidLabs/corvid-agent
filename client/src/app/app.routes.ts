import { Routes } from '@angular/router';
import { SubTabShellComponent } from './shared/components/sub-tab-shell.component';
import type { SubTab } from './shared/components/sub-tab-shell.component';

// ── Sub-tab configurations ──────────────────────────────────────────────

const SETTINGS_TABS: SubTab[] = [
    { label: 'General', path: './', exact: true },
    { label: 'Security', path: 'security' },
    { label: 'Wallets', path: 'wallets' },
    { label: 'Spending', path: 'spending' },
    { label: 'Allowlist', path: 'allowlist' },
    { label: 'GH Allowlist', path: 'github-allowlist' },
    { label: 'Repo Blocklist', path: 'repo-blocklist' },
    { label: 'Marketplace', path: 'marketplace' },
    { label: 'Schedules', path: 'schedules' },
    { label: 'Workflows', path: 'workflows' },
    { label: 'Webhooks', path: 'webhooks' },
    { label: 'Polling', path: 'mention-polling' },
    { label: 'MCP Servers', path: 'mcp-servers' },
];

const AGENTS_TABS: SubTab[] = [
    { label: 'All Agents', path: './', exact: true },
    { label: 'Flock Directory', path: 'flock-directory' },
    { label: 'Projects', path: 'projects' },
    { label: 'Models', path: 'models' },
    { label: 'Personas', path: 'personas' },
    { label: 'Skill Bundles', path: 'skill-bundles' },
];

const SESSIONS_TABS: SubTab[] = [
    { label: 'Conversations', path: './', exact: true },
    { label: 'Work Tasks', path: 'work-tasks' },
    { label: 'Councils', path: 'councils' },
];

const OBSERVE_TABS: SubTab[] = [
    { label: 'Live Feed', path: './', exact: true },
    { label: 'Analytics', path: 'analytics' },
    { label: 'Logs', path: 'logs' },
    { label: 'Brain Viewer', path: 'brain-viewer' },
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
            {
                path: 'new',
                loadComponent: () =>
                    import('./features/sessions/session-launcher.component').then((m) => m.SessionLauncherComponent),
            },
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
            { path: 'brain-viewer', redirectTo: '/observe/brain-viewer', pathMatch: 'full' },
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
                    import('./features/feed/live-feed.component').then((m) => m.LiveFeedComponent),
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
                path: 'brain-viewer',
                loadComponent: () =>
                    import('./features/brain-viewer/brain-viewer.component').then((m) => m.BrainViewerComponent),
            },
            {
                path: 'reputation',
                loadComponent: () =>
                    import('./features/reputation/reputation.component').then((m) => m.ReputationComponent),
            },
        ],
    },

    // ── Settings (consolidated — now includes Automate views) ────────────
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
                    import('./features/security-overview/security-overview.component').then((m) => m.SecurityOverviewComponent),
            },
            {
                path: 'wallets',
                loadComponent: () =>
                    import('./features/wallets/wallet-viewer.component').then((m) => m.WalletViewerComponent),
            },
            {
                path: 'spending',
                loadComponent: () =>
                    import('./features/spending/spending.component').then((m) => m.SpendingComponent),
            },
            {
                path: 'allowlist',
                loadComponent: () =>
                    import('./features/allowlist/allowlist.component').then((m) => m.AllowlistComponent),
            },
            {
                path: 'github-allowlist',
                loadComponent: () =>
                    import('./features/github-allowlist/github-allowlist.component').then((m) => m.GitHubAllowlistComponent),
            },
            {
                path: 'repo-blocklist',
                loadComponent: () =>
                    import('./features/repo-blocklist/repo-blocklist.component').then((m) => m.RepoBlocklistComponent),
            },
            {
                path: 'marketplace',
                loadComponent: () =>
                    import('./features/marketplace/marketplace.component').then((m) => m.MarketplaceComponent),
            },
            // Automate views (moved from /automate/* to /settings/*)
            {
                path: 'schedules',
                loadComponent: () =>
                    import('./features/schedules/schedule-list.component').then((m) => m.ScheduleListComponent),
            },
            {
                path: 'workflows',
                loadComponent: () =>
                    import('./features/workflows/workflow-list.component').then((m) => m.WorkflowListComponent),
            },
            {
                path: 'webhooks',
                loadComponent: () =>
                    import('./features/webhooks/webhook-list.component').then((m) => m.WebhookListComponent),
            },
            {
                path: 'mention-polling',
                loadComponent: () =>
                    import('./features/mention-polling/mention-polling-list.component').then((m) => m.MentionPollingListComponent),
            },
            {
                path: 'mcp-servers',
                loadComponent: () =>
                    import('./features/mcp-servers/mcp-server-list.component').then((m) => m.McpServerListComponent),
            },
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
    { path: 'brain-viewer', redirectTo: 'observe/brain-viewer', pathMatch: 'full' },
    { path: 'reputation', redirectTo: 'observe/reputation', pathMatch: 'full' },

    // Old automate paths -> settings/*
    { path: 'automate', redirectTo: 'settings/schedules', pathMatch: 'full' },
    { path: 'automate/workflows', redirectTo: 'settings/workflows', pathMatch: 'full' },
    { path: 'automate/webhooks', redirectTo: 'settings/webhooks', pathMatch: 'full' },
    { path: 'automate/mention-polling', redirectTo: 'settings/mention-polling', pathMatch: 'full' },
    { path: 'automate/mcp-servers', redirectTo: 'settings/mcp-servers', pathMatch: 'full' },
    { path: 'schedules', redirectTo: 'settings/schedules', pathMatch: 'full' },
    { path: 'workflows', redirectTo: 'settings/workflows', pathMatch: 'full' },
    { path: 'webhooks', redirectTo: 'settings/webhooks', pathMatch: 'full' },
    { path: 'mention-polling', redirectTo: 'settings/mention-polling', pathMatch: 'full' },
    { path: 'mcp-servers', redirectTo: 'settings/mcp-servers', pathMatch: 'full' },

    // Old flat settings paths
    { path: 'security', redirectTo: 'settings/security', pathMatch: 'full' },
    { path: 'wallets', redirectTo: 'settings/wallets', pathMatch: 'full' },
    { path: 'spending', redirectTo: 'settings/spending', pathMatch: 'full' },
    { path: 'allowlist', redirectTo: 'settings/allowlist', pathMatch: 'full' },
    { path: 'github-allowlist', redirectTo: 'settings/github-allowlist', pathMatch: 'full' },
    { path: 'repo-blocklist', redirectTo: 'settings/repo-blocklist', pathMatch: 'full' },
    { path: 'marketplace', redirectTo: 'settings/marketplace', pathMatch: 'full' },

    {
        path: '**',
        loadComponent: () =>
            import('./shared/components/route-error.component').then((m) => m.RouteErrorComponent),
    },
];
