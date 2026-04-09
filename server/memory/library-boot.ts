/**
 * Boot-time shared library loader.
 *
 * Reads all non-archived CRVLIB entries from the local SQLite cache at startup
 * and formats them as a context string suitable for injection into agent sessions.
 *
 * Called once during bootstrap, after LibrarySyncService is initialized.
 */
import type { Database } from 'bun:sqlite';
import type { LibraryCategory } from '../db/agent-library';
import { listLibraryEntries } from '../db/agent-library';

/** Category display order — highest-signal content first. */
const CATEGORY_ORDER: LibraryCategory[] = ['standard', 'reference', 'guide', 'decision', 'runbook'];

const CATEGORY_LABEL: Record<LibraryCategory, string> = {
  standard: 'Standards',
  reference: 'References',
  guide: 'Guides',
  decision: 'Decisions',
  runbook: 'Runbooks',
};

/**
 * Load all non-archived shared library entries from the local DB and return
 * a formatted context string grouped by category (standards → references → guides
 * → decisions → runbooks).
 *
 * Returns an empty string if the library is empty.
 */
export function loadSharedLibrary(db: Database): string {
  const entries = listLibraryEntries(db, { limit: 500 });
  if (entries.length === 0) return '';

  // Group entries by category, preserving insertion order within each group.
  const grouped = new Map<LibraryCategory, typeof entries>(CATEGORY_ORDER.map((cat) => [cat, []]));
  for (const entry of entries) {
    const bucket = grouped.get(entry.category);
    if (bucket) {
      bucket.push(entry);
    } else {
      // Unknown future category — append to the last bucket.
      grouped.get('runbook')!.push(entry);
    }
  }

  const lines: string[] = ['## Shared Agent Library (CRVLIB)', ''];

  for (const cat of CATEGORY_ORDER) {
    const catEntries = grouped.get(cat) ?? [];
    if (catEntries.length === 0) continue;

    lines.push(`### ${CATEGORY_LABEL[cat]}`);
    lines.push('');

    for (const entry of catEntries) {
      const tagSuffix = entry.tags.length > 0 ? ` [${entry.tags.join(', ')}]` : '';
      lines.push(`**${entry.key}**${tagSuffix} — by ${entry.authorName}`);
      lines.push('');
      lines.push(entry.content);
      lines.push('');
    }
  }

  return lines.join('\n');
}
