/**
 * Prompt Injection Detection Service — heuristic scanner for inbound messages.
 *
 * Scans text for patterns that indicate prompt injection, command injection,
 * data exfiltration probes, jailbreak attempts, and encoding-based attacks.
 * Returns a confidence level and matched pattern details.
 *
 * Stateless and designed to complete in <10ms per message.
 *
 * @module
 */

// ─── Types ────────────────────────────────────────────────────────────────

export type InjectionConfidence = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface InjectionMatch {
    pattern: string;
    category: InjectionCategory;
    confidence: InjectionConfidence;
    /** Byte offset of match start within the original message */
    offset: number;
}

export type InjectionCategory =
    | 'role_impersonation'
    | 'command_injection'
    | 'data_exfiltration'
    | 'jailbreak'
    | 'encoding_attack';

export interface InjectionResult {
    /** Overall confidence level (highest across all matches) */
    confidence: InjectionConfidence;
    /** Whether the message should be blocked based on default policy */
    blocked: boolean;
    /** Individual pattern matches */
    matches: InjectionMatch[];
    /** Processing time in milliseconds */
    scanTimeMs: number;
}

// ─── Confidence ordering ──────────────────────────────────────────────────

const CONFIDENCE_ORDER: Record<InjectionConfidence, number> = {
    LOW: 0,
    MEDIUM: 1,
    HIGH: 2,
    CRITICAL: 3,
};

function maxConfidence(a: InjectionConfidence, b: InjectionConfidence): InjectionConfidence {
    return CONFIDENCE_ORDER[a] >= CONFIDENCE_ORDER[b] ? a : b;
}

// ─── Pattern definitions ──────────────────────────────────────────────────

interface PatternRule {
    regex: RegExp;
    label: string;
    category: InjectionCategory;
    confidence: InjectionConfidence;
}

const PATTERNS: PatternRule[] = [
    // ── Role impersonation (CRITICAL) ─────────────────────────────
    {
        regex: /ignore\s+(all\s+)?previous\s+instructions/i,
        label: 'ignore_previous_instructions',
        category: 'role_impersonation',
        confidence: 'CRITICAL',
    },
    {
        regex: /ignore\s+(all\s+)?prior\s+instructions/i,
        label: 'ignore_prior_instructions',
        category: 'role_impersonation',
        confidence: 'CRITICAL',
    },
    {
        regex: /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|directives|rules)/i,
        label: 'disregard_instructions',
        category: 'role_impersonation',
        confidence: 'CRITICAL',
    },
    {
        regex: /you\s+are\s+now\s+(a|an|the|my)\s+/i,
        label: 'role_override_you_are_now',
        category: 'role_impersonation',
        confidence: 'HIGH',
    },
    {
        regex: /^system\s*:/im,
        label: 'system_prompt_prefix',
        category: 'role_impersonation',
        confidence: 'CRITICAL',
    },
    {
        regex: /\[system\]/i,
        label: 'system_tag',
        category: 'role_impersonation',
        confidence: 'HIGH',
    },
    {
        regex: /new\s+system\s+prompt\s*:/i,
        label: 'new_system_prompt',
        category: 'role_impersonation',
        confidence: 'CRITICAL',
    },
    {
        regex: /override\s+(your|system|the)\s+(instructions|prompt|rules|guidelines)/i,
        label: 'override_instructions',
        category: 'role_impersonation',
        confidence: 'CRITICAL',
    },
    {
        regex: /forget\s+(everything|all|your)\s+(you|instructions|rules|about)/i,
        label: 'forget_instructions',
        category: 'role_impersonation',
        confidence: 'HIGH',
    },
    {
        regex: /from\s+now\s+on\s*,?\s*(you\s+)?(are|will|must|should)\s+/i,
        label: 'from_now_on_directive',
        category: 'role_impersonation',
        confidence: 'HIGH',
    },
    {
        regex: /pretend\s+(you\s+are|to\s+be)\s+(a\s+)?/i,
        label: 'pretend_role',
        category: 'role_impersonation',
        confidence: 'MEDIUM',
    },
    {
        regex: /act\s+as\s+(if\s+you\s+are\s+)?(a|an|the|my)\s+/i,
        label: 'act_as_role',
        category: 'role_impersonation',
        confidence: 'MEDIUM',
    },

    // ── Command injection (HIGH/CRITICAL) ─────────────────────────
    {
        regex: /(?:^|\s)(?:execute|run|eval|exec)\s*:\s*/im,
        label: 'command_prefix',
        category: 'command_injection',
        confidence: 'HIGH',
    },
    {
        regex: /[;|`]\s*(?:rm|cat|curl|wget|chmod|chown|sudo|bash|sh|nc|ncat|python|perl|ruby|node|php)\s/i,
        label: 'shell_metachar_command',
        category: 'command_injection',
        confidence: 'CRITICAL',
    },
    {
        regex: /\$\(\s*(?:curl|wget|bash|sh|cat|rm)\s/i,
        label: 'command_substitution',
        category: 'command_injection',
        confidence: 'CRITICAL',
    },
    {
        regex: /`(?:curl|wget|bash|sh|cat|rm)\s[^`]*`/i,
        label: 'backtick_command',
        category: 'command_injection',
        confidence: 'HIGH',
    },
    {
        regex: /&&\s*(?:rm|curl|wget|chmod|sudo|bash|sh)\s/i,
        label: 'chained_command',
        category: 'command_injection',
        confidence: 'HIGH',
    },

    // ── Data exfiltration probes (MEDIUM/HIGH) ────────────────────
    {
        regex: /(?:show|display|print|list|reveal|dump|give)\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?(?:users?|passwords?|credentials?|secrets?|api\s*keys?|tokens?|database|env(?:ironment)?(?:\s*vars?)?)/i,
        label: 'data_exfil_probe',
        category: 'data_exfiltration',
        confidence: 'MEDIUM',
    },
    {
        regex: /what(?:'s| is) (?:in|inside)\s+(?:the\s+)?\.env/i,
        label: 'env_file_probe',
        category: 'data_exfiltration',
        confidence: 'HIGH',
    },
    {
        regex: /(?:read|access|open|cat)\s+(?:\/etc\/(?:passwd|shadow)|\.env|\.ssh|\.aws|credentials)/i,
        label: 'sensitive_file_access',
        category: 'data_exfiltration',
        confidence: 'HIGH',
    },
    {
        regex: /(?:export|send|upload|post)\s+(?:all\s+)?(?:the\s+)?(?:data|messages|conversations?|history|logs?)\s+(?:to|at|via)\s+/i,
        label: 'data_export_probe',
        category: 'data_exfiltration',
        confidence: 'HIGH',
    },
    {
        regex: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|UNION)\s+/,
        label: 'sql_keyword',
        category: 'data_exfiltration',
        confidence: 'MEDIUM',
    },

    // ── Jailbreak patterns (HIGH/CRITICAL) ────────────────────────
    {
        regex: /\bDAN\b(?:\s+mode|\s+prompt|\s+jailbreak)?/,
        label: 'dan_jailbreak',
        category: 'jailbreak',
        confidence: 'CRITICAL',
    },
    {
        regex: /developer\s+mode\s*(?:enabled|on|activated|output)/i,
        label: 'developer_mode',
        category: 'jailbreak',
        confidence: 'CRITICAL',
    },
    {
        regex: /(?:enable|activate|enter|switch\s+to)\s+(?:jailbreak|unrestricted|unfiltered|uncensored)\s*(?:mode)?/i,
        label: 'jailbreak_mode_request',
        category: 'jailbreak',
        confidence: 'CRITICAL',
    },
    {
        regex: /(?:bypass|disable|remove|ignore)\s+(?:your\s+)?(?:(?:safety|content)\s+)?(?:filters?|restrictions?|guidelines?|guardrails?)/i,
        label: 'bypass_safety',
        category: 'jailbreak',
        confidence: 'HIGH',
    },
    {
        regex: /(?:no\s+)?(?:ethical|moral|safety)\s+(?:constraints?|limitations?|restrictions?|guidelines?)\s+(?:apply|exist|needed)/i,
        label: 'no_ethics_claim',
        category: 'jailbreak',
        confidence: 'HIGH',
    },
    {
        regex: /(?:in\s+)?(?:this\s+)?(?:hypothetical|fictional|imaginary|alternate)\s+(?:scenario|world|universe|reality)/i,
        label: 'hypothetical_framing',
        category: 'jailbreak',
        confidence: 'MEDIUM',
    },

    // ── Encoding attacks (MEDIUM/HIGH) ────────────────────────────
    {
        regex: /(?:decode|interpret|translate|execute)\s+(?:this\s+)?(?:base64|b64|hex|unicode|rot13)\s*:/i,
        label: 'encoding_instruction',
        category: 'encoding_attack',
        confidence: 'HIGH',
    },
    {
        regex: /(?:[A-Za-z0-9+/]{40,}={0,2})/,
        label: 'base64_blob',
        category: 'encoding_attack',
        confidence: 'LOW',
    },
    {
        regex: /\\u[0-9a-fA-F]{4}(?:\\u[0-9a-fA-F]{4}){5,}/,
        label: 'unicode_escape_sequence',
        category: 'encoding_attack',
        confidence: 'MEDIUM',
    },
    {
        regex: /&#(?:x[0-9a-fA-F]+|\d+);(?:&#(?:x[0-9a-fA-F]+|\d+);){5,}/i,
        label: 'html_entity_sequence',
        category: 'encoding_attack',
        confidence: 'MEDIUM',
    },
    {
        regex: /(?:%[0-9a-fA-F]{2}){6,}/,
        label: 'url_encoding_sequence',
        category: 'encoding_attack',
        confidence: 'MEDIUM',
    },
];

// ─── Scanner ──────────────────────────────────────────────────────────────

/**
 * Scan a message for prompt injection patterns.
 *
 * Returns an `InjectionResult` with the overall confidence level,
 * whether the message should be blocked, and individual matches.
 *
 * Designed to be stateless and complete in <10ms for typical messages.
 */
export function scanForInjection(message: string): InjectionResult {
    const start = performance.now();
    const matches: InjectionMatch[] = [];
    let overall: InjectionConfidence = 'LOW';

    // Skip empty/very short messages — no meaningful injection possible
    if (!message || message.length < 4) {
        return {
            confidence: 'LOW',
            blocked: false,
            matches: [],
            scanTimeMs: performance.now() - start,
        };
    }

    for (const rule of PATTERNS) {
        const match = rule.regex.exec(message);
        if (match) {
            matches.push({
                pattern: rule.label,
                category: rule.category,
                confidence: rule.confidence,
                offset: match.index,
            });
            overall = maxConfidence(overall, rule.confidence);
        }
    }

    // Escalation: multiple MEDIUM matches → HIGH
    const mediumCount = matches.filter((m) => m.confidence === 'MEDIUM').length;
    if (mediumCount >= 3 && CONFIDENCE_ORDER[overall] < CONFIDENCE_ORDER['HIGH']) {
        overall = 'HIGH';
    }

    // Escalation: multiple HIGH matches → CRITICAL
    const highCount = matches.filter((m) => m.confidence === 'HIGH').length;
    if (highCount >= 2 && CONFIDENCE_ORDER[overall] < CONFIDENCE_ORDER['CRITICAL']) {
        overall = 'CRITICAL';
    }

    // Block on CRITICAL and HIGH by default
    const blocked = overall === 'CRITICAL' || overall === 'HIGH';

    return {
        confidence: overall,
        blocked,
        matches,
        scanTimeMs: performance.now() - start,
    };
}
