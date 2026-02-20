export interface ExamCase {
    id: string;
    category: ExamCategory;
    name: string;
    prompt: string;
    systemPrompt?: string;
    tools?: string[];
    /** For multi-turn cases, follow-up messages sent after the initial prompt. */
    followUps?: string[];
    grade: (result: ExamResponse) => ExamGrade;
}

export type ExamCategory = 'coding' | 'context' | 'tools' | 'algochat' | 'council' | 'instruction';

export const EXAM_CATEGORIES: ExamCategory[] = ['coding', 'context', 'tools', 'algochat', 'council', 'instruction'];

export interface ExamResponse {
    content: string;
    toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
    turns: number;
    error?: string;
}

export interface ExamGrade {
    passed: boolean;
    reason: string;
    score: number;
}

export interface ExamResult {
    caseId: string;
    category: ExamCategory;
    name: string;
    grade: ExamGrade;
    durationMs: number;
}

export interface ExamScorecard {
    model: string;
    timestamp: string;
    overall: number;
    categories: Record<ExamCategory, { score: number; passed: number; total: number }>;
    results: ExamResult[];
    durationMs: number;
}
