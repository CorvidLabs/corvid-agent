export interface NotificationPayload {
    notificationId: string;
    agentId: string;
    sessionId: string | null;
    title: string | null;
    message: string;
    level: string;
    timestamp: string;
}

export interface ChannelSendResult {
    success: boolean;
    externalRef?: string;
    error?: string;
}
