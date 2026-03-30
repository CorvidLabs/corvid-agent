import type { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, it } from 'bun:test';
import { McpServiceContainer, type McpServices } from '../process/mcp-service-container';

/**
 * McpServiceContainer tests — service registration, availability checks,
 * and context building.
 */

// Minimal mock services
function makeMockServices(): McpServices {
  return {
    messenger: {} as McpServices['messenger'],
    directory: {} as McpServices['directory'],
    walletService: {} as McpServices['walletService'],
    encryptionConfig: { serverMnemonic: 'test-mnemonic', network: 'localnet' },
    workTaskService: {} as McpServices['workTaskService'],
    schedulerService: {} as McpServices['schedulerService'],
    notificationService: {} as McpServices['notificationService'],
  };
}

const fakeDb = {} as Database;

describe('McpServiceContainer', () => {
  let container: McpServiceContainer;

  beforeEach(() => {
    container = new McpServiceContainer();
  });

  // ── isAvailable ────────────────────────────────────────────────────

  it('is not available before services are registered', () => {
    expect(container.isAvailable).toBe(false);
  });

  it('is available after services are registered', () => {
    container.setServices(makeMockServices());
    expect(container.isAvailable).toBe(true);
  });

  // ── buildContext ───────────────────────────────────────────────────

  it('returns null when services are not registered', () => {
    const ctx = container.buildContext({ agentId: 'a1', db: fakeDb });
    expect(ctx).toBeNull();
  });

  it('returns a valid context when services are registered', () => {
    const services = makeMockServices();
    container.setServices(services);

    const ctx = container.buildContext({
      agentId: 'a1',
      db: fakeDb,
      sessionSource: 'web',
      sessionId: 's1',
      depth: 2,
    });

    expect(ctx).not.toBeNull();
    expect(ctx!.agentId).toBe('a1');
    expect(ctx!.db).toBe(fakeDb);
    expect(ctx!.agentMessenger).toBe(services.messenger);
    expect(ctx!.agentDirectory).toBe(services.directory);
    expect(ctx!.agentWalletService).toBe(services.walletService);
    expect(ctx!.depth).toBe(2);
    expect(ctx!.sessionSource).toBe('web');
    expect(ctx!.sessionId).toBe('s1');
    expect(ctx!.serverMnemonic).toBe('test-mnemonic');
    expect(ctx!.network).toBe('localnet');
  });

  it('includes optional services in context', () => {
    const services = makeMockServices();
    container.setServices(services);

    const ctx = container.buildContext({ agentId: 'a1', db: fakeDb });

    expect(ctx!.workTaskService).toBe(services.workTaskService);
    expect(ctx!.schedulerService).toBe(services.schedulerService);
    expect(ctx!.notificationService).toBe(services.notificationService);
  });

  it('creates schedulerToolUsage map when schedulerMode is true', () => {
    container.setServices(makeMockServices());

    const ctx = container.buildContext({
      agentId: 'a1',
      db: fakeDb,
      schedulerMode: true,
      schedulerActionType: 'work_task',
    });

    expect(ctx!.schedulerMode).toBe(true);
    expect(ctx!.schedulerActionType).toBe('work_task');
    expect(ctx!.schedulerToolUsage).toBeInstanceOf(Map);
    expect(ctx!.schedulerToolUsage!.size).toBe(0);
  });

  it('does not create schedulerToolUsage when schedulerMode is falsy', () => {
    container.setServices(makeMockServices());

    const ctx = container.buildContext({ agentId: 'a1', db: fakeDb });

    expect(ctx!.schedulerToolUsage).toBeUndefined();
  });

  it('passes through callback functions', () => {
    container.setServices(makeMockServices());
    const emitStatus = (_msg: string) => {};
    const extendTimeout = (_ms: number) => true;

    const ctx = container.buildContext({
      agentId: 'a1',
      db: fakeDb,
      emitStatus,
      extendTimeout,
    });

    expect(ctx!.emitStatus).toBe(emitStatus);
    expect(ctx!.extendTimeout).toBe(extendTimeout);
  });

  it('passes resolvedToolPermissions through', () => {
    container.setServices(makeMockServices());
    const perms = ['corvid_send_message', 'corvid_create_work_task'];

    const ctx = container.buildContext({
      agentId: 'a1',
      db: fakeDb,
      resolvedToolPermissions: perms,
    });

    expect(ctx!.resolvedToolPermissions).toBe(perms);
  });

  it('handles null resolvedToolPermissions', () => {
    container.setServices(makeMockServices());

    const ctx = container.buildContext({
      agentId: 'a1',
      db: fakeDb,
      resolvedToolPermissions: null,
    });

    expect(ctx!.resolvedToolPermissions).toBeNull();
  });

  // ── encryptionConfig edge cases ─────────────────────────────────────

  it('handles missing encryptionConfig gracefully', () => {
    const services = makeMockServices();
    delete services.encryptionConfig;
    container.setServices(services);

    const ctx = container.buildContext({ agentId: 'a1', db: fakeDb });

    expect(ctx!.serverMnemonic).toBeUndefined();
    expect(ctx!.network).toBeUndefined();
  });
});
