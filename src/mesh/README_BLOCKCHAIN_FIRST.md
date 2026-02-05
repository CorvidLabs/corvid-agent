# Blockchain-First Mesh Networking

This document explains the blockchain-first routing changes made to the CorvidAgent mesh networking system.

## Overview

The mesh networking system has been updated to **primarily use the localnet blockchain** for agent-to-agent communication, with mesh direct communication and process manager as fallback options.

## Key Changes

### 1. Routing Priority (NEW)

```
1. Blockchain/Localnet (PRIMARY)    ← NEW DEFAULT
2. Mesh Direct (FALLBACK)
3. Process Manager (FINAL FALLBACK)
```

**Previous behavior:**
- Auto routing preferred mesh direct communication
- Blockchain was only used when explicitly requested

**New behavior:**
- Auto routing prefers blockchain/localnet communication
- Mesh direct is used only when blockchain is unavailable
- Process manager is the final fallback

### 2. Configuration Options

#### MeshAgentMessenger Constructor
```typescript
new MeshAgentMessenger(db, config, service, walletService, directory, processManager, {
  // Existing options...
  preferBlockchain: true,        // NEW: Default true
  localnetOnly: true,           // NEW: Default true
  blockchainConfig: {           // NEW: Blockchain-specific settings
    localnet: {
      algodHost: 'http://localhost',
      algodPort: 4001,
      algodToken: 'aaaa...'
    },
    messaging: {
      maxRetries: 3,
      timeoutMs: 30000,
      confirmationRounds: 1
    }
  }
});
```

#### Request-Level Overrides
```typescript
await messenger.meshInvoke({
  fromAgentId: 'agent1',
  toAgentId: 'agent2',
  content: 'Hello!',
  useLocalnet: true,              // NEW: Force blockchain routing
  routePreference: 'auto'         // Will use blockchain due to useLocalnet
});
```

### 3. Blockchain Availability Detection

The system automatically detects if localnet is available:

```typescript
// Checks:
// 1. AlgoChatService is available
// 2. Configuration points to localhost/127.0.0.1
// 3. Network is set to 'localnet'
// 4. Service health (if available)

const available = await messenger.isBlockchainAvailable();
```

### 4. Enhanced Statistics

```typescript
const stats = messenger.getMeshStats();
console.log(stats.routing);
// Output:
{
  preferBlockchain: true,
  localnetOnly: true,
  blockchainAvailable: true
}
```

## Usage Examples

### Basic Usage (Auto-routes to Blockchain)
```typescript
const result = await messenger.meshInvoke({
  fromAgentId: 'agent1',
  toAgentId: 'agent2',
  content: 'Hello from blockchain!'
  // routePreference defaults to 'auto' → uses blockchain
});

console.log(result.route); // 'blockchain'
```

### Force Mesh Direct
```typescript
const result = await messenger.meshInvoke({
  fromAgentId: 'agent1',
  toAgentId: 'agent2',
  content: 'Hello via mesh!',
  routePreference: 'direct'  // Force mesh routing
});

console.log(result.route); // 'mesh_direct'
```

### Force Blockchain
```typescript
const result = await messenger.meshInvoke({
  fromAgentId: 'agent1',
  toAgentId: 'agent2',
  content: 'Hello via localnet!',
  useLocalnet: true  // Force blockchain even if routePreference is 'direct'
});

console.log(result.route); // 'blockchain'
```

## Benefits of Blockchain-First Approach

### 1. **Consistency & Persistence**
- All messages are recorded on the blockchain
- Provides audit trail and message history
- Survives agent restarts and network partitions

### 2. **Localnet Performance**
- Fast confirmation times (< 1 second)
- Low latency with localhost network
- Reliable delivery guarantees

### 3. **Simplified Development**
- Single communication path for most scenarios
- Easier debugging and monitoring
- Consistent behavior across environments

### 4. **Graceful Degradation**
- Automatically falls back to mesh direct when blockchain unavailable
- Falls back to process manager as final option
- No communication failures due to fallback chain

## Migration Guide

### For Existing Code

**Old Code:**
```typescript
// This would have used mesh direct
const result = await messenger.meshInvoke({
  fromAgentId: 'agent1',
  toAgentId: 'agent2',
  content: 'Hello!'
});
```

**New Behavior:**
- Same code now uses blockchain by default
- No code changes required
- Better reliability and consistency

### To Preserve Old Behavior

If you specifically need mesh direct routing:

```typescript
const result = await messenger.meshInvoke({
  fromAgentId: 'agent1',
  toAgentId: 'agent2',
  content: 'Hello!',
  routePreference: 'direct'  // Force old mesh direct behavior
});
```

### Configuration for Non-Localnet

To disable blockchain-first routing:

```typescript
const messenger = new MeshAgentMessenger(db, config, service, wallet, directory, pm, {
  preferBlockchain: false,    // Disable blockchain-first
  localnetOnly: false        // Allow non-localnet routing
});
```

## Testing

### Unit Tests
```bash
npm test -- --testPathPattern=mesh/MeshAgentMessenger.test.ts
```

### Integration Tests
```bash
npm test -- --testPathPattern=mesh/integration.test.ts
```

### Test Blockchain Routing
```typescript
it('should route via blockchain by default', async () => {
  const result = await messenger.meshInvoke({
    fromAgentId: 'agent1',
    toAgentId: 'agent2',
    content: 'test'
  });

  expect(result.route).toBe('blockchain');
});
```

## Configuration Reference

### BlockchainMeshConfig
```typescript
interface BlockchainMeshConfig {
  preferBlockchain: boolean;     // Enable blockchain-first routing
  localnetOnly: boolean;         // Restrict to localnet only

  localnet: {
    algodHost: string;           // Algorand node host
    algodPort: number;           // Algorand node port
    algodToken: string;          // Authentication token
    indexerHost?: string;        // Optional indexer host
    indexerPort?: number;        // Optional indexer port
    indexerToken?: string;       // Optional indexer token
  };

  messaging: {
    maxRetries: number;          // Max retry attempts
    timeoutMs: number;           // Request timeout
    confirmationRounds: number;  // Block confirmations needed
    defaultPaymentMicro: number; // Default payment amount
  };

  fallback: {
    enableMeshFallback: boolean;       // Allow mesh fallback
    enableProcessManagerFallback: boolean; // Allow process manager fallback
    maxFallbackDelay: number;          // Max delay before fallback
  };
}
```

## Troubleshooting

### Blockchain Not Available
```
Error: Blockchain routing preferred but not available
```

**Solutions:**
1. Ensure localnet is running: `./sandbox up`
2. Check algod configuration in config
3. Verify AlgoChatService is initialized
4. Set `preferBlockchain: false` to use mesh direct

### Localnet Connection Issues
```
Error: Localnet-only mode enabled but not connected to localnet
```

**Solutions:**
1. Update `algodHost` to `http://localhost:4001`
2. Set `localnetOnly: false` to allow other networks
3. Verify localnet is accessible

### Performance Issues
```
Warning: Blockchain routing slower than expected
```

**Solutions:**
1. Check localnet node performance
2. Reduce `confirmationRounds` to 1
3. Increase `timeoutMs` for slower networks
4. Consider mesh direct fallback

## Implementation Details

### Routing Decision Flow
```
1. Check useLocalnet flag → Force blockchain if true
2. Check routePreference:
   - 'blockchain' → Use blockchain
   - 'direct' → Use mesh direct
   - 'auto' → Continue to step 3
3. Auto routing logic:
   - Check blockchain availability
   - If available → Use blockchain
   - If not available → Check mesh health
   - If mesh healthy → Use mesh direct
   - Otherwise → Use process manager
```

### Blockchain Availability Checks
1. Verify AlgoChatService exists
2. Check localnetOnly configuration
3. Validate algod host configuration
4. Optional: Ping localnet node for health

This blockchain-first approach provides more reliable, consistent, and auditable agent communication while maintaining backward compatibility and graceful fallback options.