/**
 * External MCP Client Manager.
 *
 * Connects to third-party MCP servers (e.g. @modelcontextprotocol/server-github)
 * via stdio transport, discovers their tools, and exposes them as DirectToolDefinitions
 * so they can be used by the direct execution engine alongside built-in tools.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { McpServerConfig } from '../../shared/types';
import type { DirectToolDefinition } from './direct-tools';
import { createLogger } from '../lib/logger';

const log = createLogger('ExternalMcp');

export interface ExternalMcpConnection {
    config: McpServerConfig;
    client: Client;
    transport: StdioClientTransport;
    tools: DirectToolDefinition[];
}

export class ExternalMcpClientManager {
    private connections: ExternalMcpConnection[] = [];

    /**
     * Connect to all provided MCP server configs.
     * Graceful degradation: if a server fails to start, log warning and skip it.
     */
    async connectAll(configs: McpServerConfig[]): Promise<ExternalMcpConnection[]> {
        const results: ExternalMcpConnection[] = [];

        for (const config of configs) {
            try {
                const connection = await this.connectOne(config);
                results.push(connection);
                log.info(`Connected to external MCP server: ${config.name}`, {
                    toolCount: connection.tools.length,
                    tools: connection.tools.map(t => t.name).join(', '),
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                log.warn(`Failed to connect to external MCP server: ${config.name}`, { error: msg });
            }
        }

        this.connections = results;
        return results;
    }

    private async connectOne(config: McpServerConfig): Promise<ExternalMcpConnection> {
        // Build env: merge current process env with config's env vars
        const env: Record<string, string> = { ...process.env as Record<string, string> };
        if (config.envVars) {
            for (const [k, v] of Object.entries(config.envVars)) {
                env[k] = v;
            }
        }

        const transport = new StdioClientTransport({
            command: config.command,
            args: config.args ?? [],
            env,
            cwd: config.cwd ?? undefined,
            stderr: 'pipe',
        });

        const client = new Client({
            name: `corvid-agent/${config.name}`,
            version: '1.0.0',
        });

        // Connect with a timeout
        const connectTimeout = 30_000;
        const connectPromise = client.connect(transport);
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Connection timeout after ${connectTimeout}ms`)), connectTimeout),
        );
        await Promise.race([connectPromise, timeoutPromise]);

        // Discover tools
        const toolsResult = await client.listTools();
        const tools = this.buildToolProxies(config, client, toolsResult.tools);

        return { config, client, transport, tools };
    }

    /**
     * Build DirectToolDefinition proxies for each tool discovered from an external MCP server.
     * Tool names are namespaced with the server name to avoid collisions.
     */
    private buildToolProxies(
        config: McpServerConfig,
        client: Client,
        mcpTools: Array<{ name: string; description?: string; inputSchema: { type: string; properties?: Record<string, object>; required?: string[] } }>,
    ): DirectToolDefinition[] {
        // Create a namespace prefix from the server name: "github-server" → "github_server"
        const prefix = config.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');

        return mcpTools.map((tool) => {
            const namespacedName = `${prefix}_${tool.name}`;

            return {
                name: namespacedName,
                description: tool.description ?? `External tool from ${config.name}`,
                parameters: tool.inputSchema as Record<string, unknown>,
                handler: async (args: Record<string, unknown>) => {
                    try {
                        const result = await client.callTool({
                            name: tool.name,
                            arguments: args,
                        });

                        // Extract text content from the result
                        const textParts: string[] = [];
                        if ('content' in result && Array.isArray(result.content)) {
                            for (const item of result.content) {
                                if (item.type === 'text' && typeof item.text === 'string') {
                                    textParts.push(item.text);
                                }
                            }
                        }

                        const text = textParts.length > 0
                            ? textParts.join('\n')
                            : JSON.stringify(result);

                        return {
                            text,
                            isError: 'isError' in result ? Boolean(result.isError) : undefined,
                        };
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        return { text: `External MCP tool error (${config.name}/${tool.name}): ${msg}`, isError: true };
                    }
                },
            };
        });
    }

    /** Get all tools from all connected external MCP servers. */
    getAllTools(): DirectToolDefinition[] {
        const tools: DirectToolDefinition[] = [];
        for (const conn of this.connections) {
            tools.push(...conn.tools);
        }
        return tools;
    }

    /** Disconnect all external MCP servers and kill child processes. */
    async disconnectAll(): Promise<void> {
        for (const conn of this.connections) {
            try {
                await conn.transport.close();
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                log.warn(`Error disconnecting external MCP server: ${conn.config.name}`, { error: msg });
            }
        }
        this.connections = [];
    }

    /** Get the number of active connections. */
    get connectionCount(): number {
        return this.connections.length;
    }
}
