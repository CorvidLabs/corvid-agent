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
