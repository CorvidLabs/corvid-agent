import { Database } from 'bun:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { AlgoChatBridge } from '../algochat/bridge';
import { createAgent } from '../db/agents';
import { runMigrations } from '../db/schema';
import { createRequestContext } from '../middleware/guards';
import { handleOnboardingRoutes } from '../routes/onboarding';

let db: Database;
const defaultContext = createRequestContext();

function fakeReq(method: string, path: string): { req: Request; url: URL } {
  const url = new URL(`http://localhost:3000${path}`);
  return { req: new Request(url.toString(), { method }), url };
}

beforeAll(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterAll(() => db.close());

describe('Onboarding Routes', () => {
  it('returns null for non-matching paths', () => {
    const { req, url } = fakeReq('GET', '/api/other');
    const res = handleOnboardingRoutes(req, url, db, null, null, defaultContext);
    expect(res).toBeNull();
  });

  it('returns null for POST method', () => {
    const { req, url } = fakeReq('POST', '/api/onboarding/status');
    const res = handleOnboardingRoutes(req, url, db, null, null, defaultContext);
    expect(res).toBeNull();
  });

  it('returns incomplete status with no bridge', async () => {
    const { req, url } = fakeReq('GET', '/api/onboarding/status');
    const res = await handleOnboardingRoutes(req, url, db, null, null, defaultContext);
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(200);

    const data = await (res as Response).json();
    expect(data.wallet.configured).toBe(false);
    expect(data.wallet.address).toBeNull();
    expect(data.wallet.funded).toBe(false);
    expect(data.bridge.running).toBe(false);
    expect(data.bridge.network).toBeNull();
    expect(data.agent.exists).toBe(false);
    expect(data.agent.count).toBe(0);
    expect(data.project.exists).toBe(false);
    expect(data.project.count).toBe(0);
    expect(data.complete).toBe(false);
  });

  it('returns status with bridge configured', async () => {
    const mockBridge = {
      getStatus: async () => ({
        address: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        balance: 10_000_000,
        network: 'localnet',
      }),
    } as unknown as AlgoChatBridge;

    const { req, url } = fakeReq('GET', '/api/onboarding/status');
    const res = await handleOnboardingRoutes(req, url, db, mockBridge, null, defaultContext);
    const data = await (res as Response).json();

    expect(data.wallet.configured).toBe(true);
    expect(data.wallet.address).toBe('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(data.wallet.funded).toBe(true);
    expect(data.bridge.running).toBe(true);
    expect(data.bridge.network).toBe('localnet');
  });

  it('wallet.funded is false when balance is 0', async () => {
    const mockBridge = {
      getStatus: async () => ({
        address: 'SOME_ADDRESS',
        balance: 0,
        network: 'localnet',
      }),
    } as unknown as AlgoChatBridge;

    const { req, url } = fakeReq('GET', '/api/onboarding/status');
    const res = await handleOnboardingRoutes(req, url, db, mockBridge, null, defaultContext);
    const data = await (res as Response).json();
    expect(data.wallet.configured).toBe(true);
    expect(data.wallet.funded).toBe(false);
  });

  it('reflects agent existence after creation', async () => {
    createAgent(db, { name: 'TestOnboardAgent' });

    const { req, url } = fakeReq('GET', '/api/onboarding/status');
    const res = await handleOnboardingRoutes(req, url, db, null, null, defaultContext);
    const data = await (res as Response).json();

    expect(data.agent.exists).toBe(true);
    expect(data.agent.count).toBeGreaterThanOrEqual(1);
  });

  it('reflects project existence after creation', async () => {
    // Insert a project directly
    db.query(
      `INSERT INTO projects (id, name, working_dir, tenant_id)
             VALUES (?, ?, ?, ?)`,
    ).run('test-proj', 'TestProject', '/tmp/test', 'default');

    const { req, url } = fakeReq('GET', '/api/onboarding/status');
    const res = await handleOnboardingRoutes(req, url, db, null, null, defaultContext);
    const data = await (res as Response).json();

    expect(data.project.exists).toBe(true);
    expect(data.project.count).toBeGreaterThanOrEqual(1);
  });

  it('complete is true when all conditions met', async () => {
    // We already have agent and project from previous tests
    const mockBridge = {
      getStatus: async () => ({
        address: 'FUNDED_WALLET',
        balance: 5_000_000,
        network: 'localnet',
      }),
    } as unknown as AlgoChatBridge;

    const { req, url } = fakeReq('GET', '/api/onboarding/status');
    const res = await handleOnboardingRoutes(req, url, db, mockBridge, null, defaultContext);
    const data = await (res as Response).json();
    expect(data.complete).toBe(true);
  });
});
