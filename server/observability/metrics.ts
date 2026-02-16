/**
 * Prometheus metrics using OpenTelemetry SDK.
 *
 * Opt-in: metrics collection is always active (lightweight), but the
 * Prometheus exporter endpoint is only started when metrics are initialized.
 * Metrics are exposed via the /metrics endpoint in server/index.ts.
 */

// We use a manual Prometheus-compatible approach since @opentelemetry/exporter-prometheus
// requires starting its own HTTP server. Instead we collect metrics in-memory and
// render them in Prometheus text format on demand.

/**
 * Escape label values for Prometheus text format.
 * Backslashes and double-quotes must be escaped to avoid malformed output.
 */
function escapeLabelValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

interface CounterLabels {
    [key: string]: string;
}

interface HistogramEntry {
    sum: number;
    count: number;
    buckets: Map<number, number>; // upper bound → count
}

class Counter {
    readonly name: string;
    readonly help: string;
    readonly labelNames: string[];
    private values = new Map<string, number>();

    constructor(name: string, help: string, labelNames: string[] = []) {
        this.name = name;
        this.help = help;
        this.labelNames = labelNames;
    }

    inc(labels: CounterLabels = {}, value: number = 1): void {
        const key = this.labelKey(labels);
        this.values.set(key, (this.values.get(key) ?? 0) + value);
    }

    toPrometheus(): string {
        const lines: string[] = [
            `# HELP ${this.name} ${this.help}`,
            `# TYPE ${this.name} counter`,
        ];
        for (const [key, value] of this.values) {
            lines.push(`${this.name}${key} ${value}`);
        }
        return lines.join('\n');
    }

    private labelKey(labels: CounterLabels): string {
        if (this.labelNames.length === 0) return '';
        const parts = this.labelNames
            .filter(name => labels[name] !== undefined)
            .map(name => `${name}="${escapeLabelValue(labels[name])}"`);
        return parts.length > 0 ? `{${parts.join(',')}}` : '';
    }
}

class Gauge {
    readonly name: string;
    readonly help: string;
    readonly labelNames: string[];
    private values = new Map<string, number>();

    constructor(name: string, help: string, labelNames: string[] = []) {
        this.name = name;
        this.help = help;
        this.labelNames = labelNames;
    }

    set(labels: CounterLabels, value: number): void;
    set(value: number): void;
    set(labelsOrValue: CounterLabels | number, maybeValue?: number): void {
        if (typeof labelsOrValue === 'number') {
            this.values.set('', labelsOrValue);
        } else {
            const key = this.labelKey(labelsOrValue);
            this.values.set(key, maybeValue!);
        }
    }

    inc(labels: CounterLabels = {}, value: number = 1): void {
        const key = this.labelKey(labels);
        this.values.set(key, (this.values.get(key) ?? 0) + value);
    }

    dec(labels: CounterLabels = {}, value: number = 1): void {
        const key = this.labelKey(labels);
        this.values.set(key, (this.values.get(key) ?? 0) - value);
    }

    toPrometheus(): string {
        const lines: string[] = [
            `# HELP ${this.name} ${this.help}`,
            `# TYPE ${this.name} gauge`,
        ];
        for (const [key, value] of this.values) {
            lines.push(`${this.name}${key} ${value}`);
        }
        return lines.join('\n');
    }

    private labelKey(labels: CounterLabels): string {
        if (this.labelNames.length === 0) return '';
        const parts = this.labelNames
            .filter(name => labels[name] !== undefined)
            .map(name => `${name}="${escapeLabelValue(labels[name])}"`);
        return parts.length > 0 ? `{${parts.join(',')}}` : '';
    }
}

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

class Histogram {
    readonly name: string;
    readonly help: string;
    readonly labelNames: string[];
    private bucketBounds: number[];
    private entries = new Map<string, HistogramEntry>();

    constructor(name: string, help: string, labelNames: string[] = [], buckets?: number[]) {
        this.name = name;
        this.help = help;
        this.labelNames = labelNames;
        this.bucketBounds = buckets ?? DEFAULT_BUCKETS;
    }

    observe(labels: CounterLabels, value: number): void;
    observe(value: number): void;
    observe(labelsOrValue: CounterLabels | number, maybeValue?: number): void {
        let labels: CounterLabels;
        let value: number;
        if (typeof labelsOrValue === 'number') {
            labels = {};
            value = labelsOrValue;
        } else {
            labels = labelsOrValue;
            value = maybeValue!;
        }

        const key = this.labelKey(labels);
        let entry = this.entries.get(key);
        if (!entry) {
            entry = {
                sum: 0,
                count: 0,
                buckets: new Map(this.bucketBounds.map(b => [b, 0])),
            };
            this.entries.set(key, entry);
        }

        entry.sum += value;
        entry.count += 1;
        for (const bound of this.bucketBounds) {
            if (value <= bound) {
                entry.buckets.set(bound, (entry.buckets.get(bound) ?? 0) + 1);
            }
        }
    }

    toPrometheus(): string {
        const lines: string[] = [
            `# HELP ${this.name} ${this.help}`,
            `# TYPE ${this.name} histogram`,
        ];

        for (const [key, entry] of this.entries) {
            const labelSuffix = key;
            const comma = labelSuffix ? ',' : '';
            const lbrace = labelSuffix ? labelSuffix.slice(0, -1) : '{';

            let cumulativeCount = 0;
            for (const bound of this.bucketBounds) {
                cumulativeCount += entry.buckets.get(bound) ?? 0;
                if (labelSuffix) {
                    // has existing labels: {method="GET",route="/api"} → {method="GET",route="/api",le="0.5"}
                    lines.push(`${this.name}_bucket${lbrace}${comma}le="${bound}"} ${cumulativeCount}`);
                } else {
                    lines.push(`${this.name}_bucket{le="${bound}"} ${cumulativeCount}`);
                }
            }
            if (labelSuffix) {
                lines.push(`${this.name}_bucket${lbrace}${comma}le="+Inf"} ${entry.count}`);
                lines.push(`${this.name}_sum${labelSuffix} ${entry.sum}`);
                lines.push(`${this.name}_count${labelSuffix} ${entry.count}`);
            } else {
                lines.push(`${this.name}_bucket{le="+Inf"} ${entry.count}`);
                lines.push(`${this.name}_sum ${entry.sum}`);
                lines.push(`${this.name}_count ${entry.count}`);
            }
        }

        return lines.join('\n');
    }

    private labelKey(labels: CounterLabels): string {
        if (this.labelNames.length === 0) return '';
        const parts = this.labelNames
            .filter(name => labels[name] !== undefined)
            .map(name => `${name}="${escapeLabelValue(labels[name])}"`);
        return parts.length > 0 ? `{${parts.join(',')}}` : '';
    }
}

// ─── Metric instances ────────────────────────────────────────────────────

export const httpRequestsTotal = new Counter(
    'http_requests_total',
    'Total number of HTTP requests',
    ['method', 'route', 'status_code'],
);

export const httpRequestDuration = new Histogram(
    'http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method', 'route', 'status_code'],
);

export const sessionDuration = new Histogram(
    'session_duration_seconds',
    'Agent session duration in seconds',
    [],
    [1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600],
);

export const dbQueryDuration = new Histogram(
    'db_query_duration_seconds',
    'Database query duration in seconds',
    ['operation'],
);

export const agentMessagesTotal = new Counter(
    'agent_messages_total',
    'Total number of agent messages',
    ['direction', 'status'],
);

export const creditsConsumedTotal = new Counter(
    'credits_consumed_total',
    'Total credits consumed',
);

export const activeSessions = new Gauge(
    'active_sessions',
    'Number of currently active sessions',
);

// ─── Registry ────────────────────────────────────────────────────────────

const allMetrics = [
    httpRequestsTotal,
    httpRequestDuration,
    sessionDuration,
    dbQueryDuration,
    agentMessagesTotal,
    creditsConsumedTotal,
    activeSessions,
];

/**
 * Render all metrics in Prometheus text exposition format.
 */
export function renderMetrics(): string {
    return allMetrics
        .map(m => m.toPrometheus())
        .filter(s => s.includes('\n')) // skip empty metrics
        .join('\n\n') + '\n';
}
