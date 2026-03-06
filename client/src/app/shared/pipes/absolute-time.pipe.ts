import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'absoluteTime' })
export class AbsoluteTimePipe implements PipeTransform {
    transform(value: string | null | undefined): string {
        if (!value) return '';

        const normalized = value.includes('T') || value.endsWith('Z') ? value : value.replace(' ', 'T') + 'Z';
        const date = new Date(normalized);
        return date.toLocaleString();
    }
}
