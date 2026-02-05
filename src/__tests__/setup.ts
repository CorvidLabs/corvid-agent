/**
 * Jest setup file for mesh networking tests
 */

// Mock Redis globally
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    hset: jest.fn().mockResolvedValue('OK'),
    hget: jest.fn().mockResolvedValue(''),
    hgetall: jest.fn().mockResolvedValue({}),
    hdel: jest.fn().mockResolvedValue(1),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(''),
    del: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn().mockResolvedValue('OK'),
    unsubscribe: jest.fn().mockResolvedValue('OK'),
    publish: jest.fn().mockResolvedValue(1),
    on: jest.fn(),
    off: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    status: 'ready'
  }));
});

// Mock Algorand SDK
jest.mock('algosdk', () => ({
  Algodv2: jest.fn().mockImplementation(() => ({
    getTransactionParams: jest.fn().mockResolvedValue({
      do: jest.fn().mockResolvedValue({
        fee: 1000,
        firstValid: 1000,
        lastValid: 2000,
        genesisHash: 'test-hash',
        genesisID: 'test-id'
      })
    }),
    getApplicationByID: jest.fn().mockResolvedValue({
      do: jest.fn().mockResolvedValue({
        params: {
          'global-state': []
        }
      })
    }),
    sendRawTransaction: jest.fn().mockResolvedValue({
      do: jest.fn().mockResolvedValue({ txId: 'test-tx-id' })
    }),
    status: jest.fn().mockResolvedValue({
      do: jest.fn().mockResolvedValue({ 'last-round': 1000 })
    }),
    pendingTransactionInformation: jest.fn().mockResolvedValue({
      do: jest.fn().mockResolvedValue({ 'confirmed-round': 1001 })
    })
  })),
  Indexer: jest.fn().mockImplementation(() => ({})),
  makeApplicationCallTxnFromObject: jest.fn().mockReturnValue({
    signTxn: jest.fn().mockReturnValue(new Uint8Array())
  }),
  mnemonicToSecretKey: jest.fn().mockReturnValue({
    addr: 'test-address',
    sk: new Uint8Array(64)
  }),
  OnApplicationComplete: {
    NoOpOC: 0
  }
}));

// Mock database operations
jest.mock('../../server/db/agent-messages', () => ({
  createAgentMessage: jest.fn().mockImplementation((db, data) => ({
    id: 'msg-' + Date.now(),
    ...data,
    createdAt: new Date(),
    status: 'pending'
  })),
  updateAgentMessageStatus: jest.fn(),
  getAgentMessage: jest.fn().mockReturnValue(null),
  getThreadMessages: jest.fn().mockReturnValue([])
}));

jest.mock('../../server/db/sessions', () => ({
  createSession: jest.fn().mockImplementation((db, data) => ({
    id: 'session-' + Date.now(),
    ...data,
    createdAt: new Date()
  }))
}));

jest.mock('../../server/db/agents', () => ({
  getAgent: jest.fn().mockImplementation((db, id) => ({
    id,
    name: `Agent ${id}`,
    walletAddress: `WALLET-${id}`,
    capabilities: ['chat']
  }))
}));

// Mock process manager
jest.mock('../../server/process/manager', () => ({
  ProcessManager: jest.fn().mockImplementation(() => ({
    startProcess: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    isRunning: jest.fn().mockReturnValue(false)
  }))
}));

// Mock logger creation
jest.mock('../../server/lib/logger', () => ({
  createLogger: jest.fn().mockImplementation((name) => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

// Mock environment variables
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.MESH_APP_ID = '1';
process.env.AGENT_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Global test timeout
jest.setTimeout(30000);

// Setup and teardown
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Utility functions for tests
global.testUtils = {
  createMockRedis: () => ({
    hset: jest.fn().mockResolvedValue('OK'),
    hget: jest.fn().mockResolvedValue(''),
    hgetall: jest.fn().mockResolvedValue({}),
    hdel: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn().mockResolvedValue('OK'),
    unsubscribe: jest.fn().mockResolvedValue('OK'),
    publish: jest.fn().mockResolvedValue(1),
    on: jest.fn(),
    off: jest.fn()
  }),

  createMockLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }),

  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
};