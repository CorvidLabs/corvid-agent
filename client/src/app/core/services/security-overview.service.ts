import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

export interface PatternSummary {
    name: string;
    category: string;
    severity: 'critical' | 'warning';
}

export interface GovernanceTierSummary {
    tier: number;
    label: string;
    description: string;
    quorumThreshold: number;
    requiresHumanApproval: boolean;
    allowsAutomation: boolean;
}

export interface GovernancePaths {
    basenames: string[];
    substrings: string[];
}

export interface SecurityOverview {
    protectedBasenames: string[];
    protectedSubstrings: string[];
    approvedDomains: string[];
    blockedPatterns: PatternSummary[];
    governanceTiers: GovernanceTierSummary[];
    governancePaths: {
        layer0: GovernancePaths;
        layer1: GovernancePaths;
    };
    autoMergeEnabled: boolean;
    allowlistCount: number;
    blocklistCount: number;
}

@Injectable({ providedIn: 'root' })
export class SecurityOverviewService {
    private readonly api = inject(ApiService);

    readonly data = signal<SecurityOverview | null>(null);
    readonly loading = signal(false);
    readonly error = signal<string | null>(null);

    async load(): Promise<void> {
        this.loading.set(true);
        this.error.set(null);
        try {
            const result = await firstValueFrom(this.api.get<SecurityOverview>('/security/overview'));
            this.data.set(result);
        } catch (err) {
            this.error.set(err instanceof Error ? err.message : 'Failed to load security overview');
        } finally {
            this.loading.set(false);
        }
    }
}
