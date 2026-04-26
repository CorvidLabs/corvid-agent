export type ScheduleStatus = 'active' | 'paused' | 'completed' | 'failed';

export type ScheduleActionType =
  | 'star_repo'
  | 'fork_repo'
  | 'review_prs'
  | 'work_task'
  | 'council_launch'
  | 'send_message'
  | 'github_suggest'
  | 'codebase_review'
  | 'dependency_audit'
  | 'improvement_loop'
  | 'memory_maintenance'
  | 'reputation_attestation'
  | 'outcome_analysis'
  | 'daily_review'
  | 'status_checkin'
  | 'marketplace_billing'
  | 'flock_testing'
  | 'flock_reputation_refresh'
  | 'evaluate_established'
  | 'discord_post'
  | 'github_comment_monitor'
  | 'custom';

export type ScheduleApprovalPolicy = 'auto' | 'owner_approve' | 'council_approve';

export interface ScheduleTriggerEvent {
  source: 'github_webhook' | 'github_poll';
  event: string;
  repo?: string;
}

export interface ScheduleAction {
  type: ScheduleActionType;
  repos?: string[];
  description?: string;
  projectId?: string;
  councilId?: string;
  toAgentId?: string;
  message?: string;
  maxPrs?: number;
  autoCreatePr?: boolean;
  prompt?: string;
  maxImprovementTasks?: number;
  focusArea?: string;
  /** Discord channel ID for discord_post actions. */
  channelId?: string;
  /** Optional embed title for discord_post actions. */
  embedTitle?: string;
  /** Optional embed color (decimal) for discord_post actions. */
  embedColor?: number;
}

// ─── Pipeline Types ─────────────────────────────────────────────────────────

/** Execution mode for schedule actions: independent (default) or pipeline. */
export type ScheduleExecutionMode = 'independent' | 'pipeline';

/** Condition for whether a pipeline step should run based on previous step outcome. */
export type PipelineStepCondition = 'always' | 'on_success' | 'on_failure';

/** A single step in a pipeline, wrapping an action with pipeline-specific metadata. */
export interface PipelineStep {
  /** Unique label for this step (used as key in pipeline context). */
  label: string;
  /** The action to execute. */
  action: ScheduleAction;
  /** When this step should run relative to the previous step. Defaults to 'on_success'. */
  condition?: PipelineStepCondition;
}

/** Shared context passed between pipeline steps during sequential execution. */
export interface PipelineContext {
  /** Results keyed by step label. */
  stepResults: Record<string, PipelineStepResult>;
  /** Accumulated summary across all steps. */
  summary: string;
  /** Whether any step has failed. */
  hasFailure: boolean;
}

export interface PipelineStepResult {
  label: string;
  actionType: ScheduleActionType;
  status: 'completed' | 'failed' | 'skipped';
  result: string | null;
  executionId: string;
  durationMs: number;
}

/** Pre-defined pipeline template for common automation patterns. */
export interface SchedulePipelineTemplate {
  id: string;
  name: string;
  description: string;
  steps: PipelineStep[];
  outputDestinations?: ScheduleOutputDestination[];
}

export type ScheduleOutputDestinationType = 'discord_channel' | 'algochat_agent' | 'algochat_address';
export type ScheduleOutputFormat = 'summary' | 'full' | 'on_error_only';

export interface ScheduleOutputDestination {
  type: ScheduleOutputDestinationType;
  target: string;
  format?: ScheduleOutputFormat;
}

export interface AgentSchedule {
  id: string;
  agentId: string;
  name: string;
  description: string;
  cronExpression: string;
  intervalMs: number | null;
  actions: ScheduleAction[];
  approvalPolicy: ScheduleApprovalPolicy;
  status: ScheduleStatus;
  maxExecutions: number | null;
  executionCount: number;
  maxBudgetPerRun: number | null;
  notifyAddress: string | null;
  triggerEvents: ScheduleTriggerEvent[] | null;
  outputDestinations: ScheduleOutputDestination[] | null;
  /** Execution mode: 'independent' runs actions in parallel, 'pipeline' runs steps sequentially with shared context. */
  executionMode: ScheduleExecutionMode;
  /** Pipeline steps — used when executionMode is 'pipeline'. */
  pipelineSteps: PipelineStep[] | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleExecutionStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'awaiting_approval'
  | 'approved'
  | 'denied';

export interface ScheduleExecution {
  id: string;
  scheduleId: string;
  agentId: string;
  status: ScheduleExecutionStatus;
  actionType: ScheduleActionType;
  actionInput: Record<string, unknown>;
  result: string | null;
  sessionId: string | null;
  workTaskId: string | null;
  costUsd: number;
  configSnapshot?: Record<string, unknown>;
  startedAt: string;
  completedAt: string | null;
}

export interface CreateScheduleInput {
  agentId: string;
  name: string;
  description?: string;
  cronExpression?: string;
  intervalMs?: number;
  actions: ScheduleAction[];
  approvalPolicy?: ScheduleApprovalPolicy;
  maxExecutions?: number;
  maxBudgetPerRun?: number;
  notifyAddress?: string;
  triggerEvents?: ScheduleTriggerEvent[];
  outputDestinations?: ScheduleOutputDestination[];
  executionMode?: ScheduleExecutionMode;
  pipelineSteps?: PipelineStep[];
}

export interface UpdateScheduleInput {
  agentId?: string;
  name?: string;
  description?: string;
  cronExpression?: string;
  intervalMs?: number;
  actions?: ScheduleAction[];
  approvalPolicy?: ScheduleApprovalPolicy;
  status?: ScheduleStatus;
  maxExecutions?: number;
  maxBudgetPerRun?: number;
  notifyAddress?: string | null;
  triggerEvents?: ScheduleTriggerEvent[] | null;
  outputDestinations?: ScheduleOutputDestination[] | null;
  executionMode?: ScheduleExecutionMode;
  pipelineSteps?: PipelineStep[] | null;
}
