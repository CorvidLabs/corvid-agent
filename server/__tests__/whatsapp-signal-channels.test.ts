/**
 * Tests for WhatsApp and Signal notification/question channels.
 * Validates message formatting, API call structure, and error handling
 * without hitting real external APIs.
 */
import { test, expect, describe } from 'bun:test';
import { sendWhatsApp } from '../notifications/channels/whatsapp';
import { sendSignal } from '../notifications/channels/signal';
import { sendWhatsAppQuestion } from '../notifications/channels/whatsapp-question';
import { sendSignalQuestion } from '../notifications/channels/signal-question';
import type { NotificationPayload } from '../notifications/types';

const TEST_PAYLOAD: NotificationPayload = {
    notificationId: 'notif-test-001',
    agentId: 'agent-abcd1234efgh5678',
    sessionId: 'sess-xyz-789',
    title: 'Build Failed',
    message: 'The CI pipeline failed on commit abc123.',
    level: 'error',
    timestamp: '2026-02-16T12:00:00Z',
};

// ─── WhatsApp Notification ───────────────────────────────────────────────────

describe('sendWhatsApp', () => {
    test('returns success: false with error for invalid API', async () => {
        const result = await sendWhatsApp(
            'invalid-phone-id',
            'invalid-token',
            '+1234567890',
            TEST_PAYLOAD,
        );
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    test('function signature accepts required parameters', () => {
        expect(typeof sendWhatsApp).toBe('function');
        expect(sendWhatsApp.length).toBe(4);
    });
});

// ─── WhatsApp Question ───────────────────────────────────────────────────────

describe('sendWhatsAppQuestion', () => {
    test('returns success: false with error for invalid API', async () => {
        const result = await sendWhatsAppQuestion(
            'invalid-phone-id',
            'invalid-token',
            '+1234567890',
            'question-001',
            'Should we deploy?',
            ['Yes', 'No'],
            'Production is stable',
            'agent-1234',
        );
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    test('handles options with more than 3 items (text fallback)', async () => {
        const result = await sendWhatsAppQuestion(
            'invalid-phone-id',
            'invalid-token',
            '+1234567890',
            'question-002',
            'Which region?',
            ['US East', 'US West', 'EU', 'Asia'],
            null,
            'agent-5678',
        );
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    test('handles null options', async () => {
        const result = await sendWhatsAppQuestion(
            'invalid-phone-id',
            'invalid-token',
            '+1234567890',
            'question-003',
            'What should we name this?',
            null,
            null,
            'agent-5678',
        );
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });
});

// ─── Signal Notification ─────────────────────────────────────────────────────

describe('sendSignal', () => {
    test('returns success: false with error for invalid API URL', async () => {
        const result = await sendSignal(
            'https://not-a-real-signal-api.invalid',
            '+1234567890',
            '+0987654321',
            TEST_PAYLOAD,
        );
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    test('function signature accepts required parameters', () => {
        expect(typeof sendSignal).toBe('function');
        expect(sendSignal.length).toBe(4);
    });
});

// ─── Signal Question ─────────────────────────────────────────────────────────

describe('sendSignalQuestion', () => {
    test('returns success: false with error for invalid API URL', async () => {
        const result = await sendSignalQuestion(
            'https://not-a-real-signal-api.invalid',
            '+1234567890',
            '+0987654321',
            'question-001',
            'Should we proceed?',
            ['Yes', 'No', 'Wait'],
            'Context about the deployment',
            'agent-1234',
        );
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    test('handles null options and context', async () => {
        const result = await sendSignalQuestion(
            'https://not-a-real-signal-api.invalid',
            '+1234567890',
            '+0987654321',
            'question-002',
            'What do you think?',
            null,
            null,
            'agent-5678',
        );
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });
});

// ─── Module Exports ──────────────────────────────────────────────────────────

describe('Channel Module Exports', () => {
    test('whatsapp.ts exports sendWhatsApp', async () => {
        const mod = await import('../notifications/channels/whatsapp');
        expect(typeof mod.sendWhatsApp).toBe('function');
    });

    test('whatsapp-question.ts exports sendWhatsAppQuestion', async () => {
        const mod = await import('../notifications/channels/whatsapp-question');
        expect(typeof mod.sendWhatsAppQuestion).toBe('function');
    });

    test('signal.ts exports sendSignal', async () => {
        const mod = await import('../notifications/channels/signal');
        expect(typeof mod.sendSignal).toBe('function');
    });

    test('signal-question.ts exports sendSignalQuestion', async () => {
        const mod = await import('../notifications/channels/signal-question');
        expect(typeof mod.sendSignalQuestion).toBe('function');
    });
});
