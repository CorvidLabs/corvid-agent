import * as THREE from 'three';
import type { LibraryEntry, LibraryCategory } from '../../core/services/library.service';
import type { BookNode3D, CategoryZone } from './library-3d.types';
import { ALL_CATEGORIES, BOOK_SPREAD, CATEGORY_COLORS } from './library-3d.types';
import { createTextSprite } from './library-3d.utils';

/** Dispose and remove all book nodes from the scene. */
export function disposeBookNodes(nodes: BookNode3D[], scene: THREE.Scene): void {
    for (const node of nodes) {
        scene.remove(node.mesh);
        scene.remove(node.glowMesh);
        scene.remove(node.label);
        node.mesh.geometry.dispose();
        (node.mesh.material as THREE.Material).dispose();
        node.glowMesh.geometry.dispose();
        (node.glowMesh.material as THREE.Material).dispose();
        if (node.label.material instanceof THREE.SpriteMaterial && node.label.material.map) {
            node.label.material.map.dispose();
        }
        node.label.material.dispose();
    }
}

/** Draw the 2D minimap onto the given canvas context. */
export function drawMinimap(
    canvas: HTMLCanvasElement,
    categoryZones: CategoryZone[],
    bookNodes: BookNode3D[],
    cameraX: number,
    cameraZ: number,
    cameraYaw: number,
): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const scale = w / 160;

    ctx.clearRect(0, 0, w, w);
    ctx.fillStyle = 'rgba(5, 5, 10, 0.9)';
    ctx.fillRect(0, 0, w, w);

    for (const zone of categoryZones) {
        const mx = (zone.position.x + 80) * scale;
        const my = (zone.position.z + 80) * scale;
        ctx.beginPath();
        ctx.arc(mx, my, 4, 0, Math.PI * 2);
        ctx.fillStyle = `#${zone.color.toString(16).padStart(6, '0')}`;
        ctx.globalAlpha = 0.4;
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    for (const node of bookNodes) {
        const mx = (node.position.x + 80) * scale;
        const my = (node.position.z + 80) * scale;
        ctx.beginPath();
        ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `#${CATEGORY_COLORS[node.entry.category].toString(16).padStart(6, '0')}`;
        ctx.fill();
    }
    const cx = (cameraX + 80) * scale;
    const cy = (cameraZ + 80) * scale;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - Math.sin(cameraYaw) * 8, cy - Math.cos(cameraYaw) * 8);
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00e5ff';
    ctx.fill();
}

/** Build and add book/note meshes for all entries. Returns the new BookNode3D array. */
export function buildBookNodes(
    entries: LibraryEntry[],
    scene: THREE.Scene,
    categoryZones: CategoryZone[],
): BookNode3D[] {
    const nodes: BookNode3D[] = [];
    const now = Date.now();

    const dedupedEntries = entries.map((entry) => ({
        entry,
        pageCount: entry.totalPages ?? 1,
    }));

    // Group by category
    const grouped = new Map<LibraryCategory, { entry: LibraryEntry; pageCount: number }[]>();
    for (const cat of ALL_CATEGORIES) grouped.set(cat, []);
    for (const item of dedupedEntries) {
        const list = grouped.get(item.entry.category);
        if (list) list.push(item);
    }

    const shelfHeights = [1, 3, 5];

    for (const zone of categoryZones) {
        const zoneItems = grouped.get(zone.category) ?? [];
        const books = zoneItems.filter((item) => item.pageCount > 1);
        const notes = zoneItems.filter((item) => item.pageCount <= 1);
        const allItems = [...books, ...notes];
        const itemsPerShelf = Math.ceil(allItems.length / (shelfHeights.length * 2));

        let itemIdx = 0;
        for (let s = 0; s < 2 && itemIdx < allItems.length; s++) {
            const shelfAngle = zone.angle + ((s - 0.5) * 0.6);
            const sx = zone.position.x + Math.cos(shelfAngle) * (BOOK_SPREAD * 0.5);
            const sz = zone.position.z + Math.sin(shelfAngle) * (BOOK_SPREAD * 0.5);

            for (let h = 0; h < shelfHeights.length && itemIdx < allItems.length; h++) {
                const shelfY = shelfHeights[h];
                const slotsOnShelf = Math.min(itemsPerShelf || 5, allItems.length - itemIdx, 6);

                for (let slot = 0; slot < slotsOnShelf && itemIdx < allItems.length; slot++) {
                    const { entry, pageCount } = allItems[itemIdx++];
                    const isBook = pageCount > 1;

                    const slotOffset = slotsOnShelf > 1 ? (slot / (slotsOnShelf - 1) - 0.5) * 5 : 0;
                    const perpX = Math.cos(shelfAngle + Math.PI / 2) * slotOffset;
                    const perpZ = Math.sin(shelfAngle + Math.PI / 2) * slotOffset;
                    const x = sx + perpX;
                    const z = sz + perpZ;

                    const age = now - new Date(entry.updatedAt).getTime();
                    const recentGlow = Math.max(0, 1 - age / (1000 * 60 * 60 * 168));

                    let bookMesh: THREE.Mesh;
                    let height: number;

                    if (isBook) {
                        const thickness = 0.4 + Math.min(pageCount * 0.12, 1.0);
                        height = 1.8;
                        bookMesh = new THREE.Mesh(
                            new THREE.BoxGeometry(1.2, height, thickness),
                            new THREE.MeshStandardMaterial({
                                color: zone.color,
                                emissive: new THREE.Color(zone.color),
                                emissiveIntensity: 0.4 + recentGlow * 0.5,
                                roughness: 0.4, metalness: 0.3,
                            }),
                        );
                        const spineMesh = new THREE.Mesh(
                            new THREE.BoxGeometry(1.22, height * 0.6, thickness + 0.02),
                            new THREE.MeshStandardMaterial({
                                color: 0xffd700, emissive: new THREE.Color(0xffd700),
                                emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.5,
                            }),
                        );
                        spineMesh.position.y = -height * 0.15;
                        bookMesh.add(spineMesh);
                    } else {
                        height = 1.0;
                        bookMesh = new THREE.Mesh(
                            new THREE.BoxGeometry(0.8, height, 0.04),
                            new THREE.MeshStandardMaterial({
                                color: 0xf5f0e0,
                                emissive: new THREE.Color(zone.color),
                                emissiveIntensity: 0.1 + recentGlow * 0.15,
                                roughness: 0.9, metalness: 0.0,
                            }),
                        );
                        const fold = new THREE.Mesh(
                            new THREE.BoxGeometry(0.15, 0.15, 0.05),
                            new THREE.MeshStandardMaterial({
                                color: zone.color,
                                emissive: new THREE.Color(zone.color),
                                emissiveIntensity: 0.3,
                            }),
                        );
                        fold.position.set(0.33, height * 0.42, 0);
                        bookMesh.add(fold);
                    }

                    const y = shelfY + height / 2 + 0.12;
                    bookMesh.position.set(x, y, z);
                    bookMesh.rotation.y = shelfAngle;
                    bookMesh.userData = { entryKey: entry.key };
                    scene.add(bookMesh);

                    const glowMesh = new THREE.Mesh(
                        new THREE.SphereGeometry(isBook ? 1.2 : 0.5, 12, 12),
                        new THREE.MeshBasicMaterial({
                            color: isBook ? zone.color : 0xf5f0e0,
                            transparent: true,
                            opacity: isBook ? 0.06 + recentGlow * 0.1 : 0.02 + recentGlow * 0.04,
                        }),
                    );
                    glowMesh.position.copy(bookMesh.position);
                    scene.add(glowMesh);

                    const rawName = entry.title ?? (entry.book && pageCount > 1 ? entry.book : entry.key);
                    const displayName = entry.title
                        ? entry.title
                        : rawName
                            .replace(/^(ref|guide|std|dec|rb|runbook|decision|standard|reference)-/i, '')
                            .replace(/[-_]/g, ' ')
                            .replace(/\b\w/g, (c: string) => c.toUpperCase());
                    const labelBase = displayName.length > 28 ? `${displayName.slice(0, 26)}..` : displayName;
                    const labelText = isBook ? `${labelBase}  (${pageCount}p)` : labelBase;
                    const label = createTextSprite(labelText, isBook ? 0xffd700 : 0xcccccc, 512, 36, 14);
                    label.position.set(x, y + height / 2 + 0.5, z);
                    label.scale.set(5.5, 0.55, 1);
                    scene.add(label);

                    nodes.push({
                        entry,
                        mesh: bookMesh,
                        glowMesh,
                        label,
                        position: new THREE.Vector3(x, y, z),
                        baseY: y,
                        pulsePhase: Math.random() * Math.PI * 2,
                    });
                }
            }
        }
    }

    return nodes;
}
