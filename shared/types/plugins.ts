/**
 * Plugin interfaces for the agent framework.
 *
 * These interfaces define the contracts that integration plugins, tool plugins,
 * schedule action handlers, and the event bus must implement. They are designed
 * to be dependency-free — referencing only structural types rather than concrete
 * service implementations — so that plugin authors need not import the full
 * framework.
 *
 * @see {@link ./agent-config.ts} for the deployment configuration schema.
 */

import type { AgentDeploymentConfig } from './agent-config';

// ── Re-exported Structural Types ────────────────────────────────────────────
// These use structural (duck) typing so plugins don't import concrete classes.

/**
 * Minimal database handle expected by plugins.
 * Matches Bun's `Database` interface structurally.
 */
export interface PluginDatabase {
  query(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): void;
  };
  run(sql: string, ...params: unknown[]): void;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): void;
  };
}

/**
 * Minimal logger interface expected by plugins.
 * Matches the Logger interface from server/lib/logger.ts.
 */
export interface PluginLogger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child(module: string): PluginLogger;
}

// ── Event Bus ───────────────────────────────────────────────────────────────

/**
 * Typed event bus for decoupling framework components and plugins.
 *
 * Plugins can emit events (e.g. 'bridge:message', 'tool:executed') and
 * subscribe to events from other components without direct coupling.
 */
export interface EventBus {
  /** Emit an event to all subscribers of the given topic. */
  emit(topic: string, data: unknown): void;
  /** Subscribe to events on the given topic. */
  on(topic: string, handler: (data: unknown) => void): void;
  /** Unsubscribe a previously registered handler. */
  off(topic: string, handler: (data: unknown) => void): void;
}

// ── Plugin Context ──────────────────────────────────────────────────────────

/**
 * Context provided to integration plugins during initialization.
 *
 * Contains references to core framework services that plugins may need.
 * Uses structural types to avoid circular imports with concrete implementations.
 */
export interface PluginContext {
  /** Database handle for direct queries. */
  db: PluginDatabase;
  /** Process manager reference (typed as unknown to avoid circular imports). */
  processManager: unknown;
  /** The full deployment configuration. */
  config: AgentDeploymentConfig;
  /** Scoped logger for the plugin. */
  logger: PluginLogger;
  /** Event bus for inter-component communication. */
  eventBus: EventBus;
}

// ── Integration Plugin ──────────────────────────────────────────────────────

/** Health check result returned by plugins. */
export interface PluginHealthResult {
  /** Whether the plugin is operating normally. */
  healthy: boolean;
  /** Optional details about the health status. */
  details?: string;
}

/**
 * Base interface for all integration plugins.
 *
 * Integration plugins follow a lifecycle: initialize -> start -> stop.
 * The framework calls these methods in order during bootstrap and shutdown.
 *
 * @example
 * ```typescript
 * class MyPlugin implements IntegrationPlugin {
 *   name = 'my-plugin';
 *   version = '1.0.0';
 *   async initialize(ctx: PluginContext) { ... }
 *   async start() { ... }
 *   async stop() { ... }
 * }
 * ```
 */
export interface IntegrationPlugin {
  /** Unique plugin name. */
  name: string;
  /** Semantic version of the plugin. */
  version: string;

  /** Called once with the framework context. Set up internal state here. */
  initialize(context: PluginContext): Promise<void>;
  /** Called after initialize(). Start polling, listeners, etc. */
  start(): Promise<void>;
  /** Called during shutdown. Clean up resources. */
  stop(): Promise<void>;

  /** Optional health check for monitoring. */
  healthCheck?(): Promise<PluginHealthResult>;
}

// ── Bridge Plugin ───────────────────────────────────────────────────────────

/**
 * A message received from an external communication bridge.
 *
 * Bridges normalize messages from Discord, Telegram, Slack, etc. into
 * this common shape so the framework can handle them uniformly.
 */
export interface BridgeMessage {
  /** Source platform identifier (e.g. 'discord', 'telegram', 'slack'). */
  source: string;
  /** Platform-specific channel or chat identifier. */
  channelId: string;
  /** Platform-specific user identifier. */
  userId: string;
  /** Human-readable user name. */
  userName: string;
  /** Message text content. */
  content: string;
  /** Optional thread or reply-chain identifier. */
  threadId?: string;
  /** Arbitrary platform-specific metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Bridge plugin for bidirectional messaging with external platforms.
 *
 * Extends {@link IntegrationPlugin} with send/receive capabilities.
 * Each bridge normalizes platform-specific messages into {@link BridgeMessage}.
 */
export interface BridgePlugin extends IntegrationPlugin {
  /** Discriminator for bridge plugins. */
  type: 'bridge';

  /** Send a text message to the specified channel on this platform. */
  sendMessage(channelId: string, content: string): Promise<void>;

  /** Register a handler for incoming messages from this platform. */
  onMessage?(handler: (message: BridgeMessage) => void): void;
}

// ── Tool Plugin ─────────────────────────────────────────────────────────────

/**
 * Context provided to tool handlers during execution.
 */
export interface ToolContext {
  /** The agent ID executing this tool. */
  agentId: string;
  /** The session ID, if the tool is invoked within a session. */
  sessionId?: string;
  /** Database handle. */
  db: PluginDatabase;
  /** Scoped logger. */
  logger: PluginLogger;
}

/**
 * Result returned by a tool handler.
 */
export interface ToolResult {
  /** Text content to return to the LLM. */
  content: string;
  /** Whether this result represents an error. */
  isError?: boolean;
}

/**
 * Plugin interface for registering custom MCP tools.
 *
 * Tool plugins define a JSON Schema for their input and a handler function.
 * They are registered with the framework and exposed to LLM sessions.
 *
 * @example
 * ```typescript
 * const myTool: ToolPlugin = {
 *   name: 'my_custom_tool',
 *   description: 'Does something useful',
 *   inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
 *   async handler(ctx, args) {
 *     return { content: `Result for ${args.query}` };
 *   },
 * };
 * ```
 */
export interface ToolPlugin {
  /** Unique tool name (should use snake_case). */
  name: string;
  /** Human-readable description of what the tool does. */
  description: string;
  /** JSON Schema describing the tool's input parameters. */
  inputSchema: Record<string, unknown>;
  /** Execute the tool with the given arguments. */
  handler(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult>;
}

// ── Action Handler Plugin ───────────────────────────────────────────────────

/**
 * Context provided to schedule action handlers during execution.
 */
export interface ActionContext {
  /** The schedule that triggered this action. */
  scheduleId: string;
  /** The unique execution ID for this run. */
  executionId: string;
  /** Schedule-specific configuration parameters. */
  config: Record<string, unknown>;
  /** Database handle. */
  db: PluginDatabase;
  /** Process manager reference (typed as unknown to avoid circular imports). */
  processManager: unknown;
  /** Scoped logger. */
  logger: PluginLogger;
}

/**
 * Result returned by a schedule action handler.
 */
export interface ActionResult {
  /** Whether the action completed successfully. */
  success: boolean;
  /** Optional human-readable summary of what was done. */
  summary?: string;
  /** Error message if success is false. */
  error?: string;
}

/**
 * Plugin interface for registering custom schedule action types.
 *
 * Action handlers are invoked by the scheduler when a schedule's action type
 * matches the handler's {@link actionType}.
 */
export interface ActionHandlerPlugin {
  /** The action type string this handler responds to. */
  actionType: string;
  /** Human-readable description of this action type. */
  description: string;
  /** Execute the action. */
  handler(context: ActionContext): Promise<ActionResult>;
}
