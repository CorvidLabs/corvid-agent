export interface GitHubEvent {
    id: string;
    type: string;
    repo: string;
    actor: string;
    action?: string;
    title?: string;
    number?: number;
    url?: string;
    ref?: string;
    commits?: number;
    createdAt: string;
}

export interface GitHubPR {
    repo: string;
    number: number;
    title: string;
    author: string;
    state: string;
    draft: boolean;
    url: string;
    labels: string[];
    createdAt: string;
    updatedAt: string;
}

export interface GitHubIssue {
    repo: string;
    number: number;
    title: string;
    author: string;
    labels: string[];
    url: string;
    createdAt: string;
    updatedAt: string;
}

export interface GitHubRun {
    id: number;
    repo: string;
    name: string;
    branch: string;
    status: string;
    conclusion: string;
    url: string;
    createdAt: string;
}

export interface ActivitySummary {
    openPRs: number;
    openIssues: number;
    recentCommits: number;
    ciPassRate: number;
    lastUpdated: string;
}
