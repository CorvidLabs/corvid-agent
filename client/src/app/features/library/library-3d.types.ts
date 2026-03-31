import * as THREE from 'three';
import type { LibraryEntry, LibraryCategory } from '../../core/services/library.service';

/* ── Category config ──────────────────────────────────── */

export interface CategoryZone {
    category: LibraryCategory;
    label: string;
    color: number;
    angle: number; // radians, position in pentagon
    position: THREE.Vector3;
}

export const CATEGORY_COLORS: Record<LibraryCategory, number> = {
    guide: 0x00e5ff,
    reference: 0xa78bfa,
    decision: 0xf59e0b,
    standard: 0x10b981,
    runbook: 0xf43f5e,
};

export const CATEGORY_LABELS: Record<LibraryCategory, string> = {
    guide: 'Guides',
    reference: 'Reference',
    decision: 'Decisions',
    standard: 'Standards',
    runbook: 'Runbooks',
};

export const ALL_CATEGORIES: LibraryCategory[] = ['guide', 'reference', 'decision', 'standard', 'runbook'];
export const ZONE_RADIUS = 40; // Distance from center for each zone
export const BOOK_SPREAD = 12; // Spread of books within a zone

/* ── Internal 3D types ──────────────────────────────────── */

export interface BookNode3D {
    entry: LibraryEntry;
    mesh: THREE.Mesh;
    glowMesh: THREE.Mesh;
    label: THREE.Sprite;
    position: THREE.Vector3;
    baseY: number;
    pulsePhase: number;
}
