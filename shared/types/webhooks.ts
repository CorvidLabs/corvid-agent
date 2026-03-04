export type WebhookEventType =
    | 'issue_comment'
    | 'issues'
    | 'pull_request_review_comment'
    | 'issue_comment_pr';

export type WebhookRegistrationStatus = 'active' | 'paused';

export interface WebhookRegistration {
    id: string;
    agentId: string;
    repo: string;
    events: WebhookEventType[];
    mentionUsername: string;
    projectId: string;
    status: WebhookRegistrationStatus;
    triggerCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface CreateWebhookRegistrationInput {
    agentId: string;
    repo: string;
    events: WebhookEventType[];
    mentionUsername: string;
    projectId?: string;
}

export interface UpdateWebhookRegistrationInput {
    events?: WebhookEventType[];
    mentionUsername?: string;
    projectId?: string;
    status?: WebhookRegistrationStatus;
}

export interface WebhookDelivery {
    id: string;
    registrationId: string;
    event: string;
    action: string;
    repo: string;
    sender: string;
    body: string;
    htmlUrl: string;
    sessionId: string | null;
    workTaskId: string | null;
    status: 'processing' | 'completed' | 'failed' | 'ignored';
    result: string | null;
    createdAt: string;
}

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
    processedIds: string[];
    eventFilter: ('issue_comment' | 'issues' | 'pull_request_review_comment' | 'pull_request')[];
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
    mentionUsername?: string;
    projectId?: string;
    intervalSeconds?: number;
    status?: MentionPollingStatus;
    eventFilter?: MentionPollingConfig['eventFilter'];
    allowedUsers?: string[];
}
