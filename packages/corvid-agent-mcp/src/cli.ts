#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createCorvidMcpServer } from './server.js';

const baseUrl = process.env.CORVID_AGENT_URL ?? 'http://localhost:3000';
const apiKey = process.env.CORVID_AGENT_API_KEY;
const agentId = process.env.CORVID_AGENT_ID;

const server = createCorvidMcpServer({ baseUrl, apiKey, agentId });
const transport = new StdioServerTransport();

async function main() {
  await server.connect(transport);
  process.stderr.write(`corvid-agent-mcp server running (target: ${baseUrl})\n`);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
