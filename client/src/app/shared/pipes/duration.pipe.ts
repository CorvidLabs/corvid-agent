import { Pipe, PipeTransform } from '@angular/core';

/** Computes human-readable elapsed duration between two ISO timestamps. */
@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
    transform(startValue: string | null | undefined, endValue: string | null | undefined): string {
        if (!startValue) return '';
        if (!endValue) return 'running...';

        const normalize = (v: string): string =>
            v.includes('T') || v.endsWith('Z') ? v : v.replace(' ', 'T') + 'Z';

        const start = new Date(normalize(startValue)).getTime();
        const end = new Date(normalize(endValue)).getTime();
        const diffMs = Math.max(0, end - start);

        if (diffMs < 1000) return '<1s';

        const totalSec = Math.floor(diffMs / 1000);
        const hours = Math.floor(totalSec / 3600);
        const minutes = Math.floor((totalSec % 3600) / 60);
        const seconds = totalSec % 60;

        if (hours > 0) {
            return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        }
        if (minutes > 0) {
            return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
        }
        return `${seconds}s`;
    }
}
