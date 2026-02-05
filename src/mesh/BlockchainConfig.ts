/**
 * Blockchain configuration for mesh networking
 * Optimized for localnet development and testing
 */

export interface BlockchainMeshConfig {
  // Core blockchain settings
  preferBlockchain: boolean;
  localnetOnly: boolean;

  // Localnet connection settings
  localnet: {
    algodHost: string;
    algodPort: number;
    algodToken: string;
    indexerHost?: string;
    indexerPort?: number;
    indexerToken?: string;
  };

  // Messaging settings
  messaging: {
    maxRetries: number;
    timeoutMs: number;
    confirmationRounds: number;
    defaultPaymentMicro: number;
  };

  // Fallback behavior
  fallback: {
    enableMeshFallback: boolean;
    enableProcessManagerFallback: boolean;
    maxFallbackDelay: number;
  };
}

/**
 * Default configuration for localnet blockchain messaging
 */
export const DEFAULT_BLOCKCHAIN_MESH_CONFIG: BlockchainMeshConfig = {
  preferBlockchain: true,
  localnetOnly: true,

  localnet: {
    algodHost: 'http://localhost',
    algodPort: 4001,
    algodToken: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    indexerHost: 'http://localhost',
    indexerPort: 8980,
    indexerToken: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  },

  messaging: {
    maxRetries: 3,
    timeoutMs: 30000, // 30 seconds
    confirmationRounds: 1, // Fast confirmation on localnet
    defaultPaymentMicro: 1000 // 0.001 ALGO
  },

  fallback: {
    enableMeshFallback: true,
    enableProcessManagerFallback: true,
    maxFallbackDelay: 5000 // 5 seconds
  }
};

/**
 * Validate blockchain configuration
 */
export function validateBlockchainConfig(config: Partial<BlockchainMeshConfig>): boolean {
  if (!config.localnet?.algodHost) {
    console.warn('Blockchain config missing algodHost');
    return false;
  }

  if (!config.localnet?.algodPort) {
    console.warn('Blockchain config missing algodPort');
    return false;
  }

  if (config.localnetOnly && !config.localnet.algodHost.includes('localhost') && !config.localnet.algodHost.includes('127.0.0.1')) {
    console.warn('Localnet-only mode but not connecting to localhost');
    return false;
  }

  return true;
}

/**
 * Create a blockchain config with overrides
 */
export function createBlockchainConfig(overrides: Partial<BlockchainMeshConfig> = {}): BlockchainMeshConfig {
  return {
    ...DEFAULT_BLOCKCHAIN_MESH_CONFIG,
    ...overrides,
    localnet: {
      ...DEFAULT_BLOCKCHAIN_MESH_CONFIG.localnet,
      ...overrides.localnet
    },
    messaging: {
      ...DEFAULT_BLOCKCHAIN_MESH_CONFIG.messaging,
      ...overrides.messaging
    },
    fallback: {
      ...DEFAULT_BLOCKCHAIN_MESH_CONFIG.fallback,
      ...overrides.fallback
    }
  };
}