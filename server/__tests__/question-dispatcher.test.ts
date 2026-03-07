import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { QuestionDispatcher } from '../notifications/question-dispatcher';
import type { Database } from 'bun:sqlite';
import type { OwnerQuestion } from '../process/owner-question-manager';

// Mock the DB functions
const mockListChannels = mock(() => [] as Array<{ channelType: string; config: Record<string, unknown>; enabled: boolean }>);
const mockCreateDispatch = mock(() => {});

// Mock channel senders — all resolve to success
const mockGithub = mock(() => Promise.resolve({ success: true, externalRef: 'issue-1' }));
const mockTelegram = mock(() => Promise.resolve({ success: true, externalRef: 'msg-1' }));
const mockAlgoChat = mock(() => Promise.resolve({ success: true, externalRef: 'tx-1' }));
const mockSlack = mock(() => Promise.resolve({ success: true, externalRef: 'ts-1' }));

mock.module('../db/notifications', () => ({
    listChannelsForAgent: mockListChannels,
    createQuestionDispatch: mockCreateDispatch,
}));

mock.module('../notifications/channels/github-question', () => ({
    sendGitHubQuestion: mockGithub,
}));

mock.module('../notifications/channels/telegram-question', () => ({
    sendTelegramQuestion: mockTelegram,
}));

mock.module('../notifications/channels/algochat-question', () => ({
    sendAlgoChatQuestion: mockAlgoChat,
}));

mock.module('../notifications/channels/slack-question', () => ({
    sendSlackQuestion: mockSlack,
}));

function makeQuestion(overrides: Partial<OwnerQuestion> = {}): OwnerQuestion {
    return {
        id: 'q-1',
        agentId: 'agent-1',
        sessionId: 'sess-1',
        question: 'Should I proceed?',
        options: ['Yes', 'No'],
        context: 'Testing context',
        createdAt: '2026-03-07T00:00:00Z',
        timeoutMs: 300000,
        ...overrides,
    };
}

describe('QuestionDispatcher', () => {
    let dispatcher: QuestionDispatcher;
    const fakeDb = {} as Database;

    beforeEach(() => {
        dispatcher = new QuestionDispatcher(fakeDb);
        mockListChannels.mockReset();
        mockCreateDispatch.mockReset();
        mockGithub.mockReset();
        mockTelegram.mockReset();
        mockAlgoChat.mockReset();
        mockSlack.mockReset();
    });

    test('returns empty array when no channels configured', async () => {
        mockListChannels.mockReturnValue([]);
        const result = await dispatcher.dispatch(makeQuestion());
        expect(result).toEqual([]);
    });

    test('skips disabled channels', async () => {
        mockListChannels.mockReturnValue([
            { channelType: 'github', config: { repo: 'org/repo' }, enabled: false },
        ]);
        const result = await dispatcher.dispatch(makeQuestion());
        expect(result).toEqual([]);
        expect(mockGithub).not.toHaveBeenCalled();
    });

    test('dispatches to github channel and records dispatch', async () => {
        mockListChannels.mockReturnValue([
            { channelType: 'github', config: { repo: 'org/repo' }, enabled: true },
        ]);
        mockGithub.mockResolvedValue({ success: true, externalRef: 'issue-42' });

        const result = await dispatcher.dispatch(makeQuestion());
        expect(result).toEqual(['github']);
        expect(mockCreateDispatch).toHaveBeenCalledWith(fakeDb, 'q-1', 'github', 'issue-42');
    });

    test('handles channel dispatch failure gracefully', async () => {
        mockListChannels.mockReturnValue([
            { channelType: 'github', config: { repo: 'org/repo' }, enabled: true },
        ]);
        mockGithub.mockResolvedValue({ success: false, externalRef: '' });

        const result = await dispatcher.dispatch(makeQuestion());
        expect(result).toEqual([]);
        expect(mockCreateDispatch).not.toHaveBeenCalled();
    });

    test('handles channel dispatch exception gracefully', async () => {
        mockListChannels.mockReturnValue([
            { channelType: 'github', config: { repo: 'org/repo' }, enabled: true },
        ]);
        mockGithub.mockRejectedValue(new Error('network error'));

        const result = await dispatcher.dispatch(makeQuestion());
        expect(result).toEqual([]);
    });

    test('dispatches to multiple channels', async () => {
        mockListChannels.mockReturnValue([
            { channelType: 'github', config: { repo: 'org/repo' }, enabled: true },
            { channelType: 'telegram', config: { botToken: 'tok', chatId: '123' }, enabled: true },
        ]);
        mockGithub.mockResolvedValue({ success: true, externalRef: 'issue-1' });
        mockTelegram.mockResolvedValue({ success: true, externalRef: 'msg-1' });

        const result = await dispatcher.dispatch(makeQuestion());
        expect(result).toEqual(['github', 'telegram']);
        expect(mockCreateDispatch).toHaveBeenCalledTimes(2);
    });

    test('returns error for missing github repo config', async () => {
        mockListChannels.mockReturnValue([
            { channelType: 'github', config: {}, enabled: true },
        ]);
        // Clear env var to ensure it fails
        const origRepo = process.env.NOTIFICATION_GITHUB_REPO;
        delete process.env.NOTIFICATION_GITHUB_REPO;

        const result = await dispatcher.dispatch(makeQuestion());
        expect(result).toEqual([]);

        process.env.NOTIFICATION_GITHUB_REPO = origRepo;
    });

    test('returns error for missing telegram config', async () => {
        mockListChannels.mockReturnValue([
            { channelType: 'telegram', config: {}, enabled: true },
        ]);
        const origToken = process.env.TELEGRAM_BOT_TOKEN;
        const origChat = process.env.TELEGRAM_CHAT_ID;
        delete process.env.TELEGRAM_BOT_TOKEN;
        delete process.env.TELEGRAM_CHAT_ID;

        const result = await dispatcher.dispatch(makeQuestion());
        expect(result).toEqual([]);

        process.env.TELEGRAM_BOT_TOKEN = origToken;
        process.env.TELEGRAM_CHAT_ID = origChat;
    });

    test('returns error for unknown channel type', async () => {
        mockListChannels.mockReturnValue([
            { channelType: 'carrier_pigeon', config: {}, enabled: true },
        ]);

        const result = await dispatcher.dispatch(makeQuestion());
        expect(result).toEqual([]);
    });

    test('returns error for discord (notification-only)', async () => {
        mockListChannels.mockReturnValue([
            { channelType: 'discord', config: {}, enabled: true },
        ]);

        const result = await dispatcher.dispatch(makeQuestion());
        expect(result).toEqual([]);
    });

    test('algochat requires messenger to be set', async () => {
        mockListChannels.mockReturnValue([
            { channelType: 'algochat', config: { toAddress: 'ADDR123' }, enabled: true },
        ]);

        // No messenger set — should fail
        const result = await dispatcher.dispatch(makeQuestion());
        expect(result).toEqual([]);
    });
});
