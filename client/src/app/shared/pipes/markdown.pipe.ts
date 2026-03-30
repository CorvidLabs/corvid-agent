import { Pipe, type PipeTransform } from '@angular/core';
import { marked } from 'marked';

// Configure marked for safe rendering with GFM support
marked.use({
    breaks: true,
    gfm: true,
    renderer: {
        // Open links in new tab
        link({ href, text }: { href: string; text: string }) {
            const escapedHref = href.replace(/"/g, '&quot;');
            return `<a href="${escapedHref}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        },
    },
});

@Pipe({ name: 'markdown', standalone: true })
export class MarkdownPipe implements PipeTransform {
    transform(value: string | null | undefined): string {
        if (!value) return '';
        return marked.parse(value, { async: false }) as string;
    }
}
