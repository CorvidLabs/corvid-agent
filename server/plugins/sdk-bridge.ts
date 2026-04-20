import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import type { PluginRegistry } from './registry';

/**
 * Convert loaded plugin tools into SDK MCP tool definitions so agents can invoke them.
 * Each plugin tool is wrapped with its Zod schema; ZodObject schemas expose named fields
 * while other schema types fall back to a generic passthrough.
 */
export function buildPluginSdkTools(
  registry: PluginRegistry,
  agentId: string,
  sessionId: string,
): ReturnType<typeof tool>[] {
  const pluginTools = registry.getPluginTools();
  if (pluginTools.length === 0) return [];

  return pluginTools.map((pt) => {
    const schema = pt.inputSchema;
    // Extract ZodObject shape for named-field tools; fall back to passthrough for others
    const shape: Record<string, z.ZodType> =
      schema instanceof z.ZodObject ? (schema.shape as Record<string, z.ZodType>) : { _input: z.unknown().optional() };

    const toolName = pt.name;
    const pluginName = pt.pluginName;

    return tool(toolName, pt.description, shape, async (args) => {
      const result = await registry.executeTool(toolName, args, {
        agentId,
        sessionId,
        grantedCapabilities: [],
      });
      const text = result.error ? `Plugin error (${pluginName}): ${result.error}` : result.result;
      return { content: [{ type: 'text' as const, text }] };
    });
  });
}
