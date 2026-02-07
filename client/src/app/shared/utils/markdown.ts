/**
 * Shared markdown renderer for the corvid-agent client.
 *
 * Converts a subset of Markdown to HTML suitable for terminal-style display.
 * Supports: headings, bold, italic, strikethrough, inline code, code blocks,
 * links, images (as links), blockquotes, horizontal rules, unordered &
 * ordered lists, and tables.
 *
 * No external dependencies — pure function, safe for use with [innerHTML].
 */

/** Escape HTML entities so user content is never interpreted as markup. */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Apply inline markdown transformations (bold, italic, code, links, etc.)
 * to a single line of already-HTML-escaped text.
 */
function renderInline(line: string): string {
    // Inline code (must come first to prevent inner transformations)
    // We temporarily replace inline code with placeholders, then restore after other transforms.
    const codeSpans: string[] = [];
    let processed = line.replace(/`([^`]+)`/g, (_m, code) => {
        const idx = codeSpans.length;
        codeSpans.push(`<code>${code}</code>`);
        return `\x00CODE${idx}\x00`;
    });

    // Images → rendered as linked alt text (terminal-friendly)
    processed = processed.replace(
        /!\[([^\]]*)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener" class="md-link">🖼 $1</a>',
    );

    // Links
    processed = processed.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener" class="md-link">$1</a>',
    );

    // Bold + italic (***text*** or ___text___)
    processed = processed.replace(/\*{3}([^*]+)\*{3}/g, '<strong><em>$1</em></strong>');
    processed = processed.replace(/_{3}([^_]+)_{3}/g, '<strong><em>$1</em></strong>');

    // Bold (**text** or __text__)
    processed = processed.replace(/\*{2}([^*]+)\*{2}/g, '<strong>$1</strong>');
    processed = processed.replace(/_{2}([^_]+)_{2}/g, '<strong>$1</strong>');

    // Italic (*text* or _text_) — avoid matching inside words for underscores
    processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    processed = processed.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<em>$1</em>');

    // Strikethrough (~~text~~)
    processed = processed.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // Restore inline code
    processed = processed.replace(/\x00CODE(\d+)\x00/g, (_m, idx) => codeSpans[+idx]);

    return processed;
}

/**
 * Render a markdown string to HTML.
 *
 * Block-level constructs are processed line-by-line; inline transforms are
 * applied within each block.
 */
export function renderMarkdown(text: string): string {
    const escaped = escapeHtml(text);
    const lines = escaped.split('\n');
    const out: string[] = [];

    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // ── Fenced code blocks ──────────────────────────────────
        const fenceMatch = line.match(/^```(\w*)/);
        if (fenceMatch) {
            const lang = fenceMatch[1];
            const codeLines: string[] = [];
            i++;
            while (i < lines.length && !lines[i].startsWith('```')) {
                codeLines.push(lines[i]);
                i++;
            }
            i++; // skip closing ```
            const langAttr = lang ? ` data-lang="${lang}"` : '';
            out.push(`<pre class="md-codeblock"${langAttr}><code>${codeLines.join('\n')}</code></pre>`);
            continue;
        }

        // ── Horizontal rule ─────────────────────────────────────
        if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
            out.push('<hr class="md-hr">');
            i++;
            continue;
        }

        // ── Headings ────────────────────────────────────────────
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            out.push(`<div class="md-h md-h${level}">${renderInline(headingMatch[2])}</div>`);
            i++;
            continue;
        }

        // ── Table ───────────────────────────────────────────────
        if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*[-:]+[-| :]*$/.test(lines[i + 1])) {
            const tableLines: string[] = [line];
            const separatorLine = lines[i + 1];
            i += 2; // skip header + separator
            while (i < lines.length && lines[i].includes('|')) {
                tableLines.push(lines[i]);
                i++;
            }
            out.push(renderTable(tableLines, separatorLine));
            continue;
        }

        // ── Blockquote ──────────────────────────────────────────
        if (line.startsWith('&gt; ') || line === '&gt;') {
            const quoteLines: string[] = [];
            while (i < lines.length && (lines[i].startsWith('&gt; ') || lines[i] === '&gt;')) {
                quoteLines.push(lines[i].replace(/^&gt;\s?/, ''));
                i++;
            }
            out.push(`<blockquote class="md-blockquote">${quoteLines.map(renderInline).join('<br>')}</blockquote>`);
            continue;
        }

        // ── Unordered list ──────────────────────────────────────
        if (/^\s*[-*+]\s+/.test(line)) {
            const listItems: string[] = [];
            while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
                listItems.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
                i++;
            }
            out.push('<ul class="md-list">' + listItems.map(li => `<li>${renderInline(li)}</li>`).join('') + '</ul>');
            continue;
        }

        // ── Ordered list ────────────────────────────────────────
        if (/^\s*\d+[.)]\s+/.test(line)) {
            const listItems: string[] = [];
            while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
                listItems.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
                i++;
            }
            out.push('<ol class="md-list">' + listItems.map(li => `<li>${renderInline(li)}</li>`).join('') + '</ol>');
            continue;
        }

        // ── Empty line → break ──────────────────────────────────
        if (line.trim() === '') {
            out.push('<br>');
            i++;
            continue;
        }

        // ── Paragraph / normal text ─────────────────────────────
        out.push(renderInline(line));
        i++;
    }

    return out.join('\n');
}

/**
 * Render a pipe-delimited table.
 * `rows` includes the header as the first element (separator is passed separately).
 */
function renderTable(rows: string[], separator: string): string {
    const parseRow = (row: string): string[] =>
        row.split('|').map(c => c.trim()).filter((_c, i, arr) => i > 0 && i < arr.length); // drop leading/trailing empty

    // Determine alignment from separator row
    const alignCells = parseRow(separator);
    const aligns: string[] = alignCells.map(cell => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        return 'left';
    });

    const headerCells = parseRow(rows[0]);
    const bodyRows = rows.slice(1);

    let html = '<table class="md-table"><thead><tr>';
    for (let c = 0; c < headerCells.length; c++) {
        html += `<th style="text-align:${aligns[c] ?? 'left'}">${renderInline(headerCells[c])}</th>`;
    }
    html += '</tr></thead><tbody>';
    for (const row of bodyRows) {
        html += '<tr>';
        const cells = parseRow(row);
        for (let c = 0; c < headerCells.length; c++) {
            html += `<td style="text-align:${aligns[c] ?? 'left'}">${renderInline(cells[c] ?? '')}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
}
