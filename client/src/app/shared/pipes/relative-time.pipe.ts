import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'relativeTime' })
export class RelativeTimePipe implements PipeTransform {
    transform(value: string | null | undefined): string {
        if (!value) return '';

        // SQLite timestamps are UTC but lack a timezone suffix — normalize
        const normalized = value.includes('T') || value.endsWith('Z') ? value : value.replace(' ', 'T') + 'Z';
        const date = new Date(normalized);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();

        // Future dates (negative diff) — show "in X"
        if (diffMs < 0) {
            const futureSec = Math.floor(-diffMs / 1000);
            const futureMin = Math.floor(futureSec / 60);
            const futureHour = Math.floor(futureMin / 60);
            const futureDay = Math.floor(futureHour / 24);

            if (futureSec < 60) return 'in <1m';
            if (futureMin < 60) return `in ${futureMin}m`;
            if (futureHour < 24) return `in ${futureHour}h`;
            if (futureDay < 30) return `in ${futureDay}d`;
            return date.toLocaleDateString();
        }

        // Past dates
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);

        if (diffSec < 60) return 'just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHour < 24) return `${diffHour}h ago`;
        if (diffDay < 30) return `${diffDay}d ago`;

        return date.toLocaleDateString();
    }
}
