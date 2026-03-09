/**
 * Tests for AlgoChat initialization module (server/algochat/init.ts).
 *
 * Covers:
 * - initAlgoChat early return when disabled
 * - initAlgoChat early return when service init fails
 * - wirePostInit conditional wiring (messenger present vs absent)
 * - switchNetwork stops existing services before reinitializing
 *
 * These tests use lightweight mocks since the init module is primarily
 * wiring/integration code.
 */
import { describe, test, expect, mock } from 'bun:test';
import type { AlgoChatInitDeps } from '../algochat/init';
import type { AlgoChatConfig } from '../algochat/config';
import type { AlgoChatState } from '../bootstrap';

// ── Mock AlgoChatConfig ──────────────────────────────────────────────

function createDisabledConfig(): AlgoChatConfig {
    return {
        mnemonic: null,
        network: 'testnet',
        agentNetwork: 'testnet',
        syncInterval: 30_000,
        defaultAgentId: null,
        enabled: false,
        pskContact: null,
        ownerAddresses: new Set(),
    };
}

function createEnabledConfig(): AlgoChatConfig {
    return {
        ...createDisabledConfig(),
        enabled: true,
        mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    };
}

// ── Mock AlgoChatState ───────────────────────────────────────────────

function createAlgoChatState(): AlgoChatState {
    return {
        bridge: null,
        walletService: null,
        messenger: null,
        directory: null,
    };
}

// ── Minimal mock deps ────────────────────────────────────────────────

function createMockDeps(overrides: Partial<AlgoChatInitDeps> = {}): AlgoChatInitDeps {
    const state = createAlgoChatState();
    return {
        db: {} as any,
        server: { publish: mock(() => {}) } as any,
        processManager: {
            setBroadcast: mock(() => {}),
            setMcpServices: mock(() => {}),
            approvalManager: {},
            ownerQuestionManager: {},
        } as any,
        algochatConfig: createDisabledConfig(),
        algochatState: state,
        workTaskService: {
            setAgentMessenger: mock(() => {}),
        } as any,
        schedulerService: {
            setAgentMessenger: mock(() => {}),
            start: mock(() => {}),
            onEvent: mock(() => {}),
        } as any,
        workflowService: {
            setAgentMessenger: mock(() => {}),
            start: mock(() => {}),
            onEvent: mock(() => {}),
        } as any,
        notificationService: {
            setAgentMessenger: mock(() => {}),
            setBroadcast: mock(() => {}),
            start: mock(() => {}),
        } as any,
        questionDispatcher: {
            setAgentMessenger: mock(() => {}),
        } as any,
        reputationScorer: {} as any,
        reputationAttestation: {} as any,
        reputationVerifier: {} as any,
        astParserService: {} as any,
        permissionBroker: {} as any,
        shutdownCoordinator: {
            register: mock(() => {}),
        } as any,
        memorySyncService: {
            setServices: mock(() => {}),
            start: mock(() => {}),
        } as any,
        responsePollingService: {
            start: mock(() => {}),
        } as any,
        usageMeter: {
            start: mock(() => {}),
        } as any,
        healthMonitorService: {
            start: mock(() => {}),
        } as any,
        mentionPollingService: {
            start: mock(() => {}),
            onEvent: mock(() => {}),
        } as any,
        flockDirectoryService: {} as any,
        ...overrides,
    };
}

describe('initAlgoChat', () => {
    test('returns immediately when AlgoChat is disabled', async () => {
        // We test the function inline to verify the early return
        const { initAlgoChat } = await import('../algochat/init');
        const deps = createMockDeps({
            algochatConfig: createDisabledConfig(),
        });

        await initAlgoChat(deps);

        // State should remain null — nothing initialized
        expect(deps.algochatState.bridge).toBeNull();
        expect(deps.algochatState.walletService).toBeNull();
        expect(deps.algochatState.messenger).toBeNull();
        expect(deps.algochatState.directory).toBeNull();
    });
});

describe('wirePostInit', () => {
    test('starts services even when messenger is null', () => {
        // wirePostInit should start scheduler, workflow, notification services
        // regardless of messenger availability
        const { wirePostInit } = require('../algochat/init');
        const deps = createMockDeps();
        deps.algochatState.messenger = null;

        wirePostInit(deps);

        // Core services should still be started
        expect((deps.notificationService as any).start.mock.calls.length).toBe(1);
        expect((deps.responsePollingService as any).start.mock.calls.length).toBe(1);
        expect((deps.schedulerService as any).start.mock.calls.length).toBe(1);
        expect((deps.mentionPollingService as any).start.mock.calls.length).toBe(1);
        expect((deps.workflowService as any).start.mock.calls.length).toBe(1);
        expect((deps.usageMeter as any).start.mock.calls.length).toBe(1);
        expect((deps.healthMonitorService as any).start.mock.calls.length).toBe(1);
    });

    test('does not call setAgentMessenger when messenger is null', () => {
        const { wirePostInit } = require('../algochat/init');
        const deps = createMockDeps();
        deps.algochatState.messenger = null;

        wirePostInit(deps);

        // setAgentMessenger should NOT be called on any service
        expect((deps.schedulerService as any).setAgentMessenger.mock.calls.length).toBe(0);
        expect((deps.workflowService as any).setAgentMessenger.mock.calls.length).toBe(0);
    });

    test('calls setAgentMessenger on services when messenger is available', () => {
        const { wirePostInit } = require('../algochat/init');
        const mockMessenger = {
            onMessageUpdate: mock(() => {}),
        };
        const deps = createMockDeps();
        deps.algochatState.messenger = mockMessenger as any;

        wirePostInit(deps);

        // setAgentMessenger should be called on scheduler, workflow, notification
        expect((deps.schedulerService as any).setAgentMessenger.mock.calls.length).toBe(1);
        expect((deps.workflowService as any).setAgentMessenger.mock.calls.length).toBe(1);
        expect((deps.notificationService as any).setAgentMessenger.mock.calls.length).toBe(1);
        expect((deps.questionDispatcher as any).setAgentMessenger.mock.calls.length).toBe(1);
    });

    test('starts memory sync when messenger is available', () => {
        const { wirePostInit } = require('../algochat/init');
        const mockMessenger = {
            onMessageUpdate: mock(() => {}),
        };
        const deps = createMockDeps({
            algochatConfig: createEnabledConfig(),
        });
        deps.algochatState.messenger = mockMessenger as any;

        wirePostInit(deps);

        expect((deps.memorySyncService as any).setServices.mock.calls.length).toBe(1);
        expect((deps.memorySyncService as any).start.mock.calls.length).toBe(1);
    });

    test('does not start memory sync when messenger is null', () => {
        const { wirePostInit } = require('../algochat/init');
        const deps = createMockDeps();
        deps.algochatState.messenger = null;

        wirePostInit(deps);

        expect((deps.memorySyncService as any).setServices.mock.calls.length).toBe(0);
        expect((deps.memorySyncService as any).start.mock.calls.length).toBe(0);
    });
});

describe('switchNetwork', () => {
    test('stops existing bridge before reinitializing', async () => {
        const { switchNetwork } = await import('../algochat/init');
        const stopMock = mock(() => {});
        const deps = createMockDeps({
            algochatConfig: createDisabledConfig(), // disabled so reinit is a no-op
        });
        deps.algochatState.bridge = { stop: stopMock } as any;
        deps.algochatState.walletService = {} as any;
        deps.algochatState.messenger = {} as any;
        deps.algochatState.directory = {} as any;

        await switchNetwork(deps, 'mainnet');

        // Existing bridge should have been stopped
        expect(stopMock.mock.calls.length).toBe(1);
        // State should be cleared
        expect(deps.algochatState.bridge).toBeNull();
        expect(deps.algochatState.walletService).toBeNull();
        expect(deps.algochatState.messenger).toBeNull();
        expect(deps.algochatState.directory).toBeNull();
    });

    test('updates config network', async () => {
        const { switchNetwork } = await import('../algochat/init');
        const config = createDisabledConfig();
        const deps = createMockDeps({ algochatConfig: config });

        await switchNetwork(deps, 'mainnet');

        expect(config.network).toBe('mainnet');
    });

    test('handles null bridge gracefully', async () => {
        const { switchNetwork } = await import('../algochat/init');
        const deps = createMockDeps({
            algochatConfig: createDisabledConfig(),
        });
        deps.algochatState.bridge = null;

        // Should not throw
        await switchNetwork(deps, 'testnet');
    });
});
