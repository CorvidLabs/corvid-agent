export type MentionPollingStatus = 'active' | 'paused';

export interface MentionPollingConfig {
    id: string;
    agentId: string;
    repo: string;
    mentionUsername: string;
    projectId: string;
    intervalSeconds: number;
    status: MentionPollingStatus;
    triggerCount: number;
    lastPollAt: string | null;
    lastSeenId: string | null;
    eventFilter: ('issue_comment' | 'issues' | 'pull_request_review_comment')[];
    allowedUsers: string[];
    createdAt: string;
    updatedAt: string;
}

export interface CreateMentionPollingInput {
    agentId: string;
    repo: string;
    mentionUsername: string;
    projectId?: string;
    intervalSeconds?: number;
    eventFilter?: MentionPollingConfig['eventFilter'];
    allowedUsers?: string[];
}

export interface UpdateMentionPollingInput {
    agentId?: string;
    mentionUsername?: string;
    projectId?: string;
    intervalSeconds?: number;
    status?: MentionPollingStatus;
    eventFilter?: MentionPollingConfig['eventFilter'];
    allowedUsers?: string[];
}

export interface MentionPollingStats {
    isRunning: boolean;
    activeConfigs: number;
    totalConfigs: number;
    totalTriggers: number;
}

export interface PollingActivity {
    id: string;
    name: string;
    status: string;
    repo: string | null;
    number: number | null;
    title: string | null;
    sender: string | null;
    url: string | null;
    isPR: boolean;
    triggerType: 'mention' | 'assignment' | 'review' | null;
    createdAt: string;
    updatedAt: string;
}
