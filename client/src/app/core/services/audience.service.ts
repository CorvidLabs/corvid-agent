import { Injectable, signal, computed } from '@angular/core';

export type Audience = 'normal' | 'developer' | 'enterprise';

const STORAGE_KEY = 'corvid_audience';

/** Which sidebar sections each audience can see */
const AUDIENCE_SECTIONS: Record<Audience, Set<string>> = {
    normal: new Set(['core', 'sessions']),
    developer: new Set(['core', 'sessions', 'automation', 'integrations', 'monitoring']),
    enterprise: new Set(['core', 'sessions', 'automation', 'integrations', 'monitoring', 'community', 'config']),
};

/** Which sidebar links within "core" each audience sees */
const AUDIENCE_CORE_LINKS: Record<Audience, Set<string>> = {
    normal: new Set(['/dashboard', '/agents', '/agents/projects']),
    developer: new Set(['/dashboard', '/agents', '/agents/projects', '/agents/models', '/agents/personas', '/agents/skill-bundles']),
    enterprise: new Set(['/dashboard', '/agents', '/agents/projects', '/agents/models', '/agents/personas', '/agents/skill-bundles']),
};

@Injectable({ providedIn: 'root' })
export class AudienceService {
    readonly audience = signal<Audience>(this.load());
    readonly isNormal = computed(() => this.audience() === 'normal');
    readonly isDeveloper = computed(() => this.audience() === 'developer');
    readonly isEnterprise = computed(() => this.audience() === 'enterprise');

    /** Check if a sidebar section should be visible for the current audience */
    isSectionVisible(sectionKey: string): boolean {
        return AUDIENCE_SECTIONS[this.audience()].has(sectionKey);
    }

    /** Check if a core link should be visible for the current audience */
    isCoreLinkVisible(route: string): boolean {
        return AUDIENCE_CORE_LINKS[this.audience()].has(route);
    }

    setAudience(audience: Audience): void {
        this.audience.set(audience);
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY, audience);
        }
    }

    private load(): Audience {
        if (typeof localStorage === 'undefined') return 'normal';
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'normal' || stored === 'developer' || stored === 'enterprise') {
            return stored;
        }
        return 'normal';
    }
}
