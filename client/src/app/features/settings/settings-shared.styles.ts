export const SECTION_STYLES = `
    .settings__section {
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 1.25rem;
        margin-bottom: 1.25rem;
    }
    .section-toggle {
        cursor: pointer; display: flex; align-items: center; gap: 0.5rem;
        user-select: none; transition: color 0.15s; margin: 0 0 0.75rem; color: var(--text-primary); font-size: 0.85rem;
    }
    .section-toggle:hover { color: var(--accent-cyan); }
    .section-chevron { font-size: 0.55rem; color: var(--text-tertiary); width: 0.75rem; }
    .section-badge {
        font-size: 0.55rem; font-weight: 700; padding: 1px 6px; border-radius: var(--radius-sm);
        background: var(--accent-cyan-dim); color: var(--accent-cyan); border: 1px solid var(--accent-cyan);
        text-transform: uppercase; letter-spacing: 0.04em;
    }
    .dirty-badge {
        font-size: 0.55rem; font-weight: 600; padding: 1px 6px; border-radius: var(--radius-sm);
        background: var(--accent-amber-dim); color: var(--accent-amber); border: 1px solid var(--accent-amber);
        margin-left: auto;
    }
    .dirty-badge-pulse { animation: pulse 2s infinite; }
    .muted { color: var(--text-secondary); font-size: 0.8rem; }
    .save-btn, .backup-btn, .cancel-btn {
        padding: 0.5rem 1.25rem;
        border-radius: var(--radius);
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        transition: background 0.15s;
    }
    .save-btn {
        background: var(--accent-cyan-dim);
        color: var(--accent-cyan);
        border: 1px solid var(--accent-cyan);
    }
    .save-btn:hover:not(:disabled) { background: var(--accent-cyan-mid); }
    .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .save-btn--sm, .cancel-btn--sm { padding: 0.3rem 0.7rem; font-size: 0.65rem; }
    .backup-btn {
        background: var(--accent-magenta-dim);
        color: var(--accent-magenta);
        border: 1px solid var(--accent-magenta);
    }
    .backup-btn:hover:not(:disabled) { background: var(--accent-magenta-border); }
    .backup-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .cancel-btn {
        background: transparent;
        color: var(--accent-red);
        border: 1px solid var(--accent-red);
    }
    .cancel-btn:hover { background: rgba(255, 77, 79, 0.1); }
    .info-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 0.75rem;
    }
    .info-item { display: flex; flex-direction: column; gap: 0.2rem; }
    .info-item--action { flex-direction: row; align-items: center; justify-content: space-between; }
    .info-label { font-size: 0.6rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
    .info-value { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
    .info-value--active { color: var(--accent-green); }
    .info-value--inactive { color: var(--accent-red); }
    .info-code {
        background: var(--bg-raised); color: var(--accent-magenta);
        padding: 2px 6px; border-radius: var(--radius-sm);
        font-size: 0.7rem; border: 1px solid var(--border); word-break: break-all;
    }
`;
