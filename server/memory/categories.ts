/**
 * Auto-categorization of memories using keyword heuristics.
 *
 * Zero API cost — purely local pattern matching.
 * Returns the best-fit category and a confidence score.
 */

export type MemoryCategory =
    | 'config'       // Configuration, settings, environment
    | 'code'         // Code snippets, functions, architecture
    | 'person'       // People, contacts, team members
    | 'project'      // Project details, repos, tasks
    | 'credential'   // API keys, tokens, passwords
    | 'preference'   // User preferences, styles, choices
    | 'fact'         // General knowledge, definitions
    | 'conversation' // Conversation summaries, chat context
    | 'task'         // TODO items, action items, reminders
    | 'general';     // Uncategorized fallback

export interface CategoryResult {
    category: MemoryCategory;
    confidence: number;  // 0.0 – 1.0
}

interface CategoryRule {
    category: MemoryCategory;
    /** Keywords that suggest this category (matched case-insensitively). */
    keywords: string[];
    /** Key-name patterns (matched against the memory key). */
    keyPatterns: RegExp[];
    /** Base weight multiplier when keyword is in key vs content. */
    keyWeight: number;
}

const RULES: CategoryRule[] = [
    {
        category: 'credential',
        keywords: ['api key', 'api_key', 'apikey', 'token', 'password', 'secret', 'mnemonic', 'private key', 'auth', 'bearer', 'credential', 'oauth'],
        keyPatterns: [/api[-_]?key/i, /token/i, /password/i, /secret/i, /credential/i, /auth/i],
        keyWeight: 2.5,
    },
    {
        category: 'config',
        keywords: ['config', 'configuration', 'setting', 'env', 'environment', 'variable', 'flag', 'option', 'parameter', 'threshold', 'timeout', 'port', 'host', 'url', 'endpoint'],
        keyPatterns: [/config/i, /setting/i, /env/i, /\.env/i, /param/i],
        keyWeight: 2.0,
    },
    {
        category: 'code',
        keywords: ['function', 'class', 'interface', 'import', 'export', 'const ', 'let ', 'var ', 'return', 'async', 'await', 'module', 'snippet', 'algorithm', 'implementation', 'typescript', 'javascript', 'python', 'sql', 'query'],
        keyPatterns: [/code/i, /snippet/i, /impl/i, /func/i, /algo/i],
        keyWeight: 1.8,
    },
    {
        category: 'person',
        keywords: ['person', 'contact', 'email', 'phone', 'team', 'member', 'colleague', 'manager', 'user', 'name is', 'works at', 'role is'],
        keyPatterns: [/person/i, /contact/i, /team/i, /member/i, /who/i],
        keyWeight: 2.0,
    },
    {
        category: 'project',
        keywords: ['project', 'repo', 'repository', 'github', 'branch', 'deploy', 'release', 'version', 'milestone', 'sprint', 'roadmap', 'architecture'],
        keyPatterns: [/project/i, /repo/i, /deploy/i, /release/i],
        keyWeight: 1.8,
    },
    {
        category: 'task',
        keywords: ['todo', 'task', 'action item', 'reminder', 'deadline', 'due date', 'follow up', 'follow-up', 'assign', 'blocker', 'priority'],
        keyPatterns: [/todo/i, /task/i, /remind/i, /action/i],
        keyWeight: 2.0,
    },
    {
        category: 'preference',
        keywords: ['prefer', 'preference', 'style', 'like', 'dislike', 'favorite', 'default', 'theme', 'format', 'convention', 'habit'],
        keyPatterns: [/pref/i, /style/i, /like/i, /favorite/i],
        keyWeight: 1.5,
    },
    {
        category: 'conversation',
        keywords: ['conversation', 'discussion', 'chat', 'said', 'told me', 'mentioned', 'summary', 'recap', 'notes from', 'meeting'],
        keyPatterns: [/convo/i, /chat/i, /summary/i, /meeting/i, /notes/i],
        keyWeight: 1.8,
    },
    {
        category: 'fact',
        keywords: ['definition', 'means', 'is a', 'refers to', 'stands for', 'acronym', 'concept', 'explanation', 'documentation'],
        keyPatterns: [/fact/i, /def/i, /what[-_]?is/i, /glossary/i],
        keyWeight: 1.5,
    },
];

/**
 * Categorize a memory by its key and content using keyword heuristics.
 */
export function categorize(key: string, content: string): CategoryResult {
    const keyLower = key.toLowerCase();
    const contentLower = content.toLowerCase();
    const combined = `${keyLower} ${contentLower}`;

    let bestCategory: MemoryCategory = 'general';
    let bestScore = 0;

    for (const rule of RULES) {
        let score = 0;

        // Check key patterns (high signal)
        for (const pattern of rule.keyPatterns) {
            if (pattern.test(keyLower)) {
                score += rule.keyWeight;
            }
        }

        // Check keywords in combined text
        for (const kw of rule.keywords) {
            if (combined.includes(kw.toLowerCase())) {
                // Keywords found in the key are weighted higher
                const inKey = keyLower.includes(kw.toLowerCase());
                score += inKey ? 1.5 : 1.0;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestCategory = rule.category;
        }
    }

    // Confidence: normalize score on a 0–1 scale
    // A score of 5+ is high confidence, 1–2 is low
    const confidence = Math.min(1.0, bestScore / 5.0);

    return {
        category: bestCategory,
        confidence: bestScore > 0 ? Math.max(0.1, confidence) : 0.0,
    };
}

/**
 * Get all available categories.
 */
export function allCategories(): MemoryCategory[] {
    return ['config', 'code', 'person', 'project', 'credential', 'preference', 'fact', 'conversation', 'task', 'general'];
}
