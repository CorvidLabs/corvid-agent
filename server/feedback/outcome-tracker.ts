/**
 * OutcomeTrackerService — stub type for the feedback loop module (PR #408).
 *
 * This interface is referenced by the scheduler for `outcome_analysis` actions.
 * The full implementation lives in the feedback-loop branch and will replace
 * this stub when PR #408 merges.
 */

export interface WeeklyAnalysis {
    overall: { mergeRate: number; merged: number; total: number };
    workTaskStats: { completed: number; total: number };
    topInsights: string[];
}

export interface OutcomeTrackerService {
    checkOpenPrs(): Promise<{ checked: number; updated: number }>;
    analyzeWeekly(agentId: string): WeeklyAnalysis;
    saveAnalysisToMemory(agentId: string, analysis: WeeklyAnalysis): void;
}
