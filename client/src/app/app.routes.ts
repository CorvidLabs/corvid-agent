import { Routes } from '@angular/router';

export const routes: Routes = [
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    {
        path: 'dashboard',
        loadComponent: () =>
            import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
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
        path: 'agents',
        loadComponent: () =>
            import('./features/agents/agent-list.component').then((m) => m.AgentListComponent),
    },
    {
        path: 'agents/new',
        loadComponent: () =>
            import('./features/agents/agent-form.component').then((m) => m.AgentFormComponent),
    },
    {
        path: 'agents/:id',
        loadComponent: () =>
            import('./features/agents/agent-detail.component').then((m) => m.AgentDetailComponent),
    },
    {
        path: 'agents/:id/edit',
        loadComponent: () =>
            import('./features/agents/agent-form.component').then((m) => m.AgentFormComponent),
    },
    {
        path: 'models',
        loadComponent: () =>
            import('./features/models/models.component').then((m) => m.ModelsComponent),
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
    {
        path: 'allowlist',
        loadComponent: () =>
            import('./features/allowlist/allowlist.component').then((m) => m.AllowlistComponent),
    },
    {
        path: 'wallets',
        loadComponent: () =>
            import('./features/wallets/wallet-viewer.component').then((m) => m.WalletViewerComponent),
    },
    {
        path: 'feed',
        loadComponent: () =>
            import('./features/feed/live-feed.component').then((m) => m.LiveFeedComponent),
    },
    {
        path: 'sessions',
        loadComponent: () =>
            import('./features/sessions/session-list.component').then((m) => m.SessionListComponent),
    },
    {
        path: 'sessions/new',
        loadComponent: () =>
            import('./features/sessions/session-launcher.component').then((m) => m.SessionLauncherComponent),
    },
    {
        path: 'sessions/:id',
        loadComponent: () =>
            import('./features/sessions/session-view.component').then((m) => m.SessionViewComponent),
    },
    {
        path: 'work-tasks',
        loadComponent: () =>
            import('./features/work-tasks/work-task-list.component').then((m) => m.WorkTaskListComponent),
    },
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
        path: 'settings',
        loadComponent: () =>
            import('./features/settings/settings.component').then((m) => m.SettingsComponent),
    },
];
