export interface SlackBridgeConfig {
    botToken: string;
    signingSecret: string;
    channelId: string;
    allowedUserIds: string[];
}

export interface SlackEventPayload {
    token: string;
    type: 'url_verification' | 'event_callback';
    challenge?: string;
    event?: SlackEvent;
}

export interface SlackEvent {
    type: string;
    user?: string;
    text?: string;
    channel?: string;
    ts?: string;
    thread_ts?: string;
    bot_id?: string;
    subtype?: string;
}

export interface SlackMessageEvent extends SlackEvent {
    type: 'message' | 'app_mention';
    user: string;
    text: string;
    channel: string;
    ts: string;
    thread_ts?: string;
}

export interface SlackChallenge {
    token: string;
    type: 'url_verification';
    challenge: string;
}
