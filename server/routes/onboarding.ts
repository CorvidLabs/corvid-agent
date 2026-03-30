/**
 * Onboarding status route — returns setup progress for new users.
 *
 * GET /api/onboarding/status
 */

import type { Database } from 'bun:sqlite';
import type { AgentWalletService } from '../algochat/agent-wallet';
import type { AlgoChatBridge } from '../algochat/bridge';
import { listAgents } from '../db/agents';
import { listProjects } from '../db/projects';
import { json } from '../lib/response';

export interface OnboardingStatus {
  /** Whether the server wallet is configured and funded */
  wallet: { configured: boolean; address: string | null; funded: boolean };
  /** Whether the AlgoChat bridge is running */
  bridge: { running: boolean; network: string | null };
  /** Whether at least one agent exists */
  agent: { exists: boolean; count: number; walletConfigured: boolean };
  /** Whether at least one project exists */
  project: { exists: boolean; count: number };
  /** Overall onboarding complete when all steps are done */
  complete: boolean;
}

export function handleOnboardingRoutes(
  req: Request,
  url: URL,
  db: Database,
  algochatBridge: AlgoChatBridge | null,
  _agentWalletService: AgentWalletService | null,
): Response | Promise<Response> | null {
  if (url.pathname !== '/api/onboarding/status' || req.method !== 'GET') return null;

  return handleOnboardingStatus(db, algochatBridge);
}

async function handleOnboardingStatus(db: Database, algochatBridge: AlgoChatBridge | null): Promise<Response> {
  // Wallet status
  let walletConfigured = false;
  let walletAddress: string | null = null;
  let walletFunded = false;

  if (algochatBridge) {
    const status = await algochatBridge.getStatus();
    walletConfigured = !!status.address;
    walletAddress = status.address;
    walletFunded = (status.balance ?? 0) > 0;
  }

  // Bridge status
  const bridgeRunning = algochatBridge !== null;
  const bridgeNetwork = algochatBridge ? (await algochatBridge.getStatus()).network : null;

  // Agent status
  const agents = listAgents(db);
  const agentExists = agents.length > 0;
  const agentWalletConfigured = agents.some((a) => !!a.walletAddress);

  // Project status
  const projects = listProjects(db);
  const projectExists = projects.length > 0;

  const complete = walletConfigured && walletFunded && bridgeRunning && agentExists && projectExists;

  const status: OnboardingStatus = {
    wallet: { configured: walletConfigured, address: walletAddress, funded: walletFunded },
    bridge: { running: bridgeRunning, network: bridgeNetwork },
    agent: { exists: agentExists, count: agents.length, walletConfigured: agentWalletConfigured },
    project: { exists: projectExists, count: projects.length },
    complete,
  };

  return json(status);
}
