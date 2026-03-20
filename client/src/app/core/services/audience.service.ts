import { Injectable } from '@angular/core';

/**
 * Audience service — unified mode. All sections and links are visible to everyone.
 * Kept as a lightweight service so existing injections don't break.
 */
@Injectable({ providedIn: 'root' })
export class AudienceService {
    /** All sidebar sections are always visible */
    isSectionVisible(_sectionKey: string): boolean {
        return true;
    }

    /** All core links are always visible */
    isCoreLinkVisible(_route: string): boolean {
        return true;
    }
}
