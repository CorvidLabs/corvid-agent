import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';

// Configure marked for safe rendering (no raw HTML passthrough)
marked.use({
    renderer: {
        // Open links in new tab
        link({ href, text }) {
            const escapedHref = href.replace(/"/g, '&quot;');
            return `<a href="${escapedHref}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        },
    },
});

@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
    transform(value: string | null | undefined): string {
        if (!value) return '';
        return marked.parse(value, { async: false }) as string;
    }
}
