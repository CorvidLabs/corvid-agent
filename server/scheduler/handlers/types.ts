/**
 * Shared context passed to all scheduler action handlers.
 */
import type { Database } from 'bun:sqlite';
import type { ProcessManager } from '../../process/manager';
import type { WorkTaskService } from '../../work/service';
import type { AutonomousLoopService } from '../../improvement/service';
import type { AgentMessenger } from '../../algochat/agent-messenger';
import type { ReputationScorer } from '../../reputation/scorer';
import type { ReputationAttestation } from '../../reputation/attestation';
import type { OutcomeTrackerService } from '../../feedback/outcome-tracker';
import type { DailyReviewService } from '../../improvement/daily-review';
import type { SystemStateDetector } from '../system-state';

export interface HandlerContext {
    db: Database;
    processManager: ProcessManager;
    workTaskService: WorkTaskService | null;
    agentMessenger: AgentMessenger | null;
    improvementLoopService: AutonomousLoopService | null;
    reputationScorer: ReputationScorer | null;
    reputationAttestation: ReputationAttestation | null;
    outcomeTrackerService: OutcomeTrackerService | null;
    dailyReviewService: DailyReviewService | null;
    systemStateDetector: SystemStateDetector;
    runningExecutions: Set<string>;
    resolveScheduleTenantId(agentId: string): string;
}
