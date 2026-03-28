import {
    Component,
    ChangeDetectionStrategy,
    input,
    output,
    signal,
    ElementRef,
    viewChild,
    OnDestroy,
    afterNextRender,
    effect,
} from '@angular/core';
import * as THREE from 'three';
import type { LibraryEntry, LibraryCategory } from '../../core/services/library.service';

/* ── Category config ──────────────────────────────────── */

interface CategoryZone {
    category: LibraryCategory;
    label: string;
    color: number;
    angle: number; // radians, position in pentagon
    position: THREE.Vector3;
}

const CATEGORY_COLORS: Record<LibraryCategory, number> = {
    guide: 0x00e5ff,
    reference: 0xa78bfa,
    decision: 0xf59e0b,
    standard: 0x10b981,
    runbook: 0xf43f5e,
};

const CATEGORY_LABELS: Record<LibraryCategory, string> = {
    guide: 'Guides',
    reference: 'Reference',
    decision: 'Decisions',
    standard: 'Standards',
    runbook: 'Runbooks',
};

const ALL_CATEGORIES: LibraryCategory[] = ['guide', 'reference', 'decision', 'standard', 'runbook'];
const ZONE_RADIUS = 40; // Distance from center for each zone
const BOOK_SPREAD = 12; // Spread of books within a zone

/* ── Internal 3D types ──────────────────────────────────── */

interface BookNode3D {
    entry: LibraryEntry;
    mesh: THREE.Mesh;
    glowMesh: THREE.Mesh;
    label: THREE.Sprite;
    position: THREE.Vector3;
    baseY: number;
    pulsePhase: number;
}

@Component({
    selector: 'app-library-3d',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="lib3d" #container>
            <canvas #canvas></canvas>

            <!-- Minimap -->
            <canvas class="lib3d__minimap" #minimap width="140" height="140"></canvas>

            <!-- Category legend / teleport buttons -->
            <div class="lib3d__legend">
                @for (zone of categoryZones; track zone.category) {
                    <button
                        class="lib3d__legend-btn"
                        [style.--zone-color]="'#' + zone.color.toString(16).padStart(6, '0')"
                        (click)="teleportToZone(zone)">
                        <span class="lib3d__legend-dot"></span>
                        {{ zone.label }}
                    </button>
                }
            </div>

            @if (hoveredEntry()) {
                <div class="lib3d__tooltip" [style.left.px]="tooltipX()" [style.top.px]="tooltipY()">
                    <strong>{{ hoveredEntry()!.key }}</strong>
                    <span class="lib3d__tooltip-cat">{{ hoveredEntry()!.category }}</span>
                </div>
            }

            @if (!pointerLocked()) {
                <div class="lib3d__lock-prompt">Click to enter — mouse look enabled</div>
            }
            <div class="lib3d__hint">
                @if (pointerLocked()) {
                    WASD to move · Mouse to look · Scroll to zoom · Click book to view · ESC to exit
                } @else {
                    Click anywhere to enter · WASD to move
                }
            </div>
        </div>
    `,
    styles: `
        .lib3d {
            position: relative;
            width: 100%;
            height: 600px;
            min-height: 400px;
            background: #05050a;
            border-radius: var(--radius, 6px);
            border: 1px solid var(--border, #1a1a2e);
            overflow: hidden;
        }
        canvas {
            display: block;
            width: 100%;
            height: 100%;
        }
        .lib3d__minimap {
            position: absolute;
            bottom: 12px;
            right: 12px;
            width: 140px;
            height: 140px;
            border-radius: 8px;
            border: 1px solid var(--border-bright, #2a2a3e);
            background: rgba(5, 5, 10, 0.85);
            backdrop-filter: blur(4px);
            pointer-events: none;
        }
        .lib3d__legend {
            position: absolute;
            top: 12px;
            left: 12px;
            display: flex;
            flex-direction: column;
            gap: 4px;
            z-index: 10;
        }
        .lib3d__legend-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 3px 10px;
            background: rgba(5, 5, 10, 0.85);
            border: 1px solid var(--border-bright, #2a2a3e);
            border-radius: 12px;
            font-size: 0.65rem;
            font-weight: 600;
            font-family: inherit;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--text-primary, #e0e0e0);
            cursor: pointer;
            backdrop-filter: blur(4px);
            transition: background 0.15s, border-color 0.15s;
        }
        .lib3d__legend-btn:hover {
            background: rgba(20, 20, 35, 0.9);
            border-color: var(--zone-color);
        }
        .lib3d__legend-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--zone-color);
            box-shadow: 0 0 6px var(--zone-color);
        }
        .lib3d__tooltip {
            position: absolute;
            z-index: 20;
            pointer-events: none;
            padding: 4px 10px;
            background: rgba(5, 5, 10, 0.9);
            border: 1px solid var(--border-bright, #2a2a3e);
            border-radius: 6px;
            font-size: 0.7rem;
            color: var(--text-primary, #e0e0e0);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            gap: 8px;
            white-space: nowrap;
        }
        .lib3d__tooltip-cat {
            font-size: 0.6rem;
            text-transform: uppercase;
            color: var(--text-secondary, #888);
        }
        .lib3d__lock-prompt {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 0.9rem;
            font-weight: 600;
            color: var(--accent-cyan, #00e5ff);
            pointer-events: none;
            text-shadow: 0 0 12px rgba(0, 229, 255, 0.5);
            animation: pulse-prompt 2s ease-in-out infinite;
            z-index: 15;
        }
        @keyframes pulse-prompt {
            0%, 100% { opacity: 0.7; }
            50% { opacity: 1; }
        }
        .lib3d__hint {
            position: absolute;
            bottom: 12px;
            left: 12px;
            font-size: 0.6rem;
            color: var(--text-secondary, #666);
            pointer-events: none;
        }

        @media (max-width: 600px) {
            .lib3d { height: 450px; }
            .lib3d__minimap { width: 100px; height: 100px; }
            .lib3d__legend { gap: 2px; }
            .lib3d__legend-btn { font-size: 0.58rem; padding: 2px 6px; }
        }
    `,
})
export class Library3DComponent implements OnDestroy {
    readonly entries = input.required<LibraryEntry[]>();
    readonly entrySelect = output<LibraryEntry>();
    readonly bookPageSelect = output<{ entry: LibraryEntry; pages: LibraryEntry[] }>();

    protected readonly hoveredEntry = signal<LibraryEntry | null>(null);
    protected readonly tooltipX = signal(0);
    protected readonly tooltipY = signal(0);
    protected readonly pointerLocked = signal(false);

    private readonly containerRef = viewChild.required<ElementRef<HTMLDivElement>>('container');
    private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
    private readonly minimapRef = viewChild.required<ElementRef<HTMLCanvasElement>>('minimap');

    // Three.js state
    private renderer: THREE.WebGLRenderer | null = null;
    private scene: THREE.Scene | null = null;
    private camera: THREE.PerspectiveCamera | null = null;
    private animationId = 0;
    private resizeObserver: ResizeObserver | null = null;

    private bookNodes: BookNode3D[] = [];
    private stars: THREE.Points | null = null;
    private zoneRings: THREE.Mesh[] = [];
    private zoneLabels: THREE.Sprite[] = [];
    private shelfGroups: THREE.Group[] = [];

    // Camera control
    private cameraTarget = new THREE.Vector3(0, 5, 0);
    private cameraPosition = new THREE.Vector3(0, 5, 55);
    private cameraYaw = 0;
    private cameraPitch = -0.05;
    private cameraDistance = 55;

    // Input state
    private keys = new Set<string>();
    private isDragging = false;
    private lastMouseX = 0;
    private lastMouseY = 0;
    private touchStartX = 0;
    private touchStartY = 0;

    // Raycasting
    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();

    // Reduced motion
    private reducedMotion = false;

    // Category zones (pentagonal layout)
    readonly categoryZones: CategoryZone[] = ALL_CATEGORIES.map((cat, i) => {
        const angle = (i / ALL_CATEGORIES.length) * Math.PI * 2 - Math.PI / 2;
        return {
            category: cat,
            label: CATEGORY_LABELS[cat],
            color: CATEGORY_COLORS[cat],
            angle,
            position: new THREE.Vector3(
                Math.cos(angle) * ZONE_RADIUS,
                0,
                Math.sin(angle) * ZONE_RADIUS,
            ),
        };
    });

    // Book grouping: maps book name → list of pages
    private bookGroups = new Map<string, LibraryEntry[]>();

    // Bound event handlers for cleanup
    private onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    private onKeyUp = (e: KeyboardEvent) => this.handleKeyUp(e);
    private onMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
    private onMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
    private onMouseUp = () => this.handleMouseUp();
    private onWheel = (e: WheelEvent) => this.handleWheel(e);
    private onClick = (e: MouseEvent) => this.handleClick(e);
    private onTouchStart = (e: TouchEvent) => this.handleTouchStart(e);
    private onTouchMove = (e: TouchEvent) => this.handleTouchMove(e);
    private onTouchEnd = () => this.handleTouchEnd();
    private onPointerLockChange = () => this.handlePointerLockChange();

    constructor() {
        this.reducedMotion =
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        afterNextRender(() => this.initScene());

        effect(() => {
            const entries = this.entries();
            if (this.scene) {
                this.rebuildBooks(entries);
            }
        });
    }

    ngOnDestroy(): void {
        this.cleanup();
    }

    /* ── Scene setup ───────────────────────────────────── */

    private initScene(): void {
        const container = this.containerRef().nativeElement;
        const canvas = this.canvasRef().nativeElement;
        const width = container.clientWidth;
        const height = container.clientHeight;

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(width, height);

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x05050a);
        this.scene.fog = new THREE.Fog(0x05050a, 60, 120);

        // Camera
        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 200);
        this.camera.position.copy(this.cameraPosition);
        this.camera.lookAt(this.cameraTarget);

        // Lighting
        const ambient = new THREE.AmbientLight(0x1a1a2e, 0.8);
        this.scene.add(ambient);

        const mainLight = new THREE.PointLight(0x00e5ff, 1.2, 100);
        mainLight.position.set(0, 30, 0);
        this.scene.add(mainLight);

        const fillLight = new THREE.PointLight(0xa78bfa, 0.5, 80);
        fillLight.position.set(-20, 15, 20);
        this.scene.add(fillLight);

        // Ground plane (subtle grid)
        const gridHelper = new THREE.GridHelper(120, 40, 0x111122, 0x0a0a15);
        this.scene.add(gridHelper);

        // Starfield ceiling
        this.createStarfield();

        // Zone rings and shelves
        this.createZoneMarkers();

        // Build books from entries
        this.rebuildBooks(this.entries());

        // Event listeners
        this.addEventListeners(container);

        // Resize observer
        this.resizeObserver = new ResizeObserver(() => this.handleResize());
        this.resizeObserver.observe(container);

        // Start render loop
        this.animate(0);
    }

    private createStarfield(): void {
        const count = 500;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 80 + Math.random() * 30;
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 20; // above
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.3,
            transparent: true,
            opacity: 0.6,
        });
        this.stars = new THREE.Points(geo, mat);
        this.scene!.add(this.stars);
    }

    private createZoneMarkers(): void {
        for (const zone of this.categoryZones) {
            // Ring marker on ground
            const ringGeo = new THREE.RingGeometry(BOOK_SPREAD + 2, BOOK_SPREAD + 2.3, 48);
            ringGeo.rotateX(-Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({
                color: zone.color,
                transparent: true,
                opacity: 0.25,
                side: THREE.DoubleSide,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.copy(zone.position);
            ring.position.y = 0.05;
            this.scene!.add(ring);
            this.zoneRings.push(ring);

            // Zone label
            const labelSprite = this.createTextSprite(zone.label, zone.color, 256, 48, 24);
            labelSprite.position.copy(zone.position);
            labelSprite.position.y = 0.5;
            labelSprite.scale.set(8, 1.5, 1);
            this.scene!.add(labelSprite);
            this.zoneLabels.push(labelSprite);

            // Shelf structure (3 arched stands)
            const shelfGroup = new THREE.Group();
            for (let i = 0; i < 3; i++) {
                const shelfAngle = zone.angle + ((i - 1) * 0.4);
                const sx = zone.position.x + Math.cos(shelfAngle) * (BOOK_SPREAD * 0.7);
                const sz = zone.position.z + Math.sin(shelfAngle) * (BOOK_SPREAD * 0.7);
                const postGeo = new THREE.BoxGeometry(0.15, 6, 0.15);
                const postMat = new THREE.MeshStandardMaterial({
                    color: zone.color,
                    transparent: true,
                    opacity: 0.15,
                    emissive: new THREE.Color(zone.color),
                    emissiveIntensity: 0.1,
                });
                const post = new THREE.Mesh(postGeo, postMat);
                post.position.set(sx, 3, sz);
                shelfGroup.add(post);
            }
            this.scene!.add(shelfGroup);
            this.shelfGroups.push(shelfGroup);
        }
    }

    /* ── Book objects ──────────────────────────────────── */

    private rebuildBooks(entries: LibraryEntry[]): void {
        // Remove existing books
        for (const node of this.bookNodes) {
            this.scene!.remove(node.mesh);
            this.scene!.remove(node.glowMesh);
            this.scene!.remove(node.label);
            node.mesh.geometry.dispose();
            (node.mesh.material as THREE.Material).dispose();
            node.glowMesh.geometry.dispose();
            (node.glowMesh.material as THREE.Material).dispose();
            if (node.label.material instanceof THREE.SpriteMaterial && node.label.material.map) {
                node.label.material.map.dispose();
            }
            node.label.material.dispose();
        }
        this.bookNodes = [];

        // Build book groups (entries sharing same 'book' name)
        this.bookGroups.clear();
        for (const entry of entries) {
            if (entry.book) {
                const pages = this.bookGroups.get(entry.book) ?? [];
                pages.push(entry);
                this.bookGroups.set(entry.book, pages);
            }
        }
        // Sort pages within each book
        for (const [, pages] of this.bookGroups) {
            pages.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
        }

        // Deduplicate: for entries that belong to a multi-page book, only show 1 mesh per book
        const seen = new Set<string>();
        const dedupedEntries: { entry: LibraryEntry; pageCount: number }[] = [];
        for (const entry of entries) {
            if (entry.book && this.bookGroups.has(entry.book)) {
                const pages = this.bookGroups.get(entry.book)!;
                if (pages.length > 1) {
                    if (seen.has(entry.book)) continue;
                    seen.add(entry.book);
                    // Use first page as representative entry
                    dedupedEntries.push({ entry: pages[0], pageCount: pages.length });
                    continue;
                }
            }
            dedupedEntries.push({ entry, pageCount: 1 });
        }

        // Group by category
        const grouped = new Map<LibraryCategory, { entry: LibraryEntry; pageCount: number }[]>();
        for (const cat of ALL_CATEGORIES) grouped.set(cat, []);
        for (const item of dedupedEntries) {
            const list = grouped.get(item.entry.category);
            if (list) list.push(item);
        }

        const now = Date.now();

        for (const zone of this.categoryZones) {
            const zoneItems = grouped.get(zone.category) ?? [];
            const count = zoneItems.length;

            for (let i = 0; i < count; i++) {
                const { entry, pageCount } = zoneItems[i];
                // Spiral layout within zone
                const t = count > 1 ? i / (count - 1) : 0;
                const spiralAngle = zone.angle + (t - 0.5) * 2.5;
                const spiralR = BOOK_SPREAD * (0.3 + t * 0.6);
                const x = zone.position.x + Math.cos(spiralAngle) * spiralR;
                const z = zone.position.z + Math.sin(spiralAngle) * spiralR;
                const y = 1.2 + Math.sin(i * 0.8) * 0.8;

                // Age-based glow: recently updated items glow brighter
                const age = now - new Date(entry.updatedAt).getTime();
                const hoursSinceUpdate = age / (1000 * 60 * 60);
                const recentGlow = Math.max(0, 1 - hoursSinceUpdate / 168); // Fade over 7 days

                // Notes are thin flat pages, books are thick volumes
                const isBook = pageCount > 1;
                const thickness = isBook ? 0.3 + Math.min(pageCount * 0.12, 1.2) : 0.08;
                const height = isBook ? 1.8 : 1.4;

                const bookGeo = new THREE.BoxGeometry(isBook ? 1.2 : 1.0, height, thickness);
                const bookMat = new THREE.MeshStandardMaterial({
                    color: zone.color,
                    emissive: new THREE.Color(zone.color),
                    emissiveIntensity: isBook ? 0.3 + recentGlow * 0.5 : 0.15 + recentGlow * 0.3,
                    roughness: isBook ? 0.6 : 0.8,
                    metalness: isBook ? 0.3 : 0.1,
                });
                const bookMesh = new THREE.Mesh(bookGeo, bookMat);
                bookMesh.position.set(x, y, z);
                bookMesh.rotation.y = spiralAngle + Math.PI / 2;
                bookMesh.userData = { entryKey: entry.key };
                this.scene!.add(bookMesh);

                // Glow sphere
                const glowGeo = new THREE.SphereGeometry(1.2, 16, 16);
                const glowMat = new THREE.MeshBasicMaterial({
                    color: zone.color,
                    transparent: true,
                    opacity: 0.05 + recentGlow * 0.1,
                });
                const glowMesh = new THREE.Mesh(glowGeo, glowMat);
                glowMesh.position.copy(bookMesh.position);
                this.scene!.add(glowMesh);

                // Label — show book name with page count for multi-page
                const displayName = entry.book && pageCount > 1
                    ? entry.book
                    : entry.key;
                const labelBase = displayName.length > 18 ? `${displayName.slice(0, 16)}...` : displayName;
                const labelText = pageCount > 1 ? `${labelBase} (${pageCount}p)` : labelBase;
                const label = this.createTextSprite(labelText, 0xffffff, 320, 32, 15);
                label.position.set(x, y + 1.5, z);
                label.scale.set(5, 0.5, 1);
                this.scene!.add(label);

                this.bookNodes.push({
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

    private createTextSprite(text: string, color: number, w: number, h: number, fontSize: number): THREE.Sprite {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, w, h);
        ctx.font = `bold ${fontSize}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const hex = `#${color.toString(16).padStart(6, '0')}`;
        ctx.fillStyle = hex;
        ctx.fillText(text, w / 2, h / 2);
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
        return new THREE.Sprite(mat);
    }

    /* ── Animation loop ────────────────────────────────── */

    private animate(time: number): void {
        this.animationId = requestAnimationFrame((t) => this.animate(t));
        if (!this.renderer || !this.scene || !this.camera) return;

        const t = time * 0.001;

        // Process movement
        this.processMovement();

        // Animate books (gentle float)
        if (!this.reducedMotion) {
            for (const node of this.bookNodes) {
                node.mesh.position.y = node.baseY + Math.sin(t * 0.8 + node.pulsePhase) * 0.2;
                node.glowMesh.position.y = node.mesh.position.y;
                node.label.position.y = node.mesh.position.y + 1.5;
                node.mesh.rotation.y += 0.001;
            }
        }

        // Render
        this.renderer.render(this.scene, this.camera);

        // Draw minimap
        this.drawMinimap();
    }

    private processMovement(): void {
        const speed = 0.5;
        const forward = new THREE.Vector3(
            -Math.sin(this.cameraYaw),
            0,
            -Math.cos(this.cameraYaw),
        );
        const right = new THREE.Vector3(
            Math.cos(this.cameraYaw),
            0,
            -Math.sin(this.cameraYaw),
        );

        if (this.keys.has('w') || this.keys.has('arrowup')) {
            this.cameraPosition.addScaledVector(forward, speed);
        }
        if (this.keys.has('s') || this.keys.has('arrowdown')) {
            this.cameraPosition.addScaledVector(forward, -speed);
        }
        if (this.keys.has('a') || this.keys.has('arrowleft')) {
            this.cameraPosition.addScaledVector(right, -speed);
        }
        if (this.keys.has('d') || this.keys.has('arrowright')) {
            this.cameraPosition.addScaledVector(right, speed);
        }

        // Clamp position
        this.cameraPosition.x = Math.max(-80, Math.min(80, this.cameraPosition.x));
        this.cameraPosition.z = Math.max(-80, Math.min(80, this.cameraPosition.z));

        // Update camera
        this.camera!.position.copy(this.cameraPosition);
        const lookTarget = new THREE.Vector3(
            this.cameraPosition.x - Math.sin(this.cameraYaw) * 10,
            this.cameraPosition.y + Math.sin(this.cameraPitch) * 10,
            this.cameraPosition.z - Math.cos(this.cameraYaw) * 10,
        );
        this.camera!.lookAt(lookTarget);
    }

    /* ── Minimap ──────────────────────────────────────── */

    private drawMinimap(): void {
        const canvas = this.minimapRef()?.nativeElement;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width;
        const h = canvas.height;
        const scale = w / 160; // map range: -80..80 → 0..w

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(5, 5, 10, 0.9)';
        ctx.fillRect(0, 0, w, h);

        // Zone markers
        for (const zone of this.categoryZones) {
            const mx = (zone.position.x + 80) * scale;
            const my = (zone.position.z + 80) * scale;
            const hex = `#${zone.color.toString(16).padStart(6, '0')}`;
            ctx.beginPath();
            ctx.arc(mx, my, 4, 0, Math.PI * 2);
            ctx.fillStyle = hex;
            ctx.globalAlpha = 0.4;
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Book dots
        for (const node of this.bookNodes) {
            const mx = (node.position.x + 80) * scale;
            const my = (node.position.z + 80) * scale;
            const cat = node.entry.category;
            const hex = `#${CATEGORY_COLORS[cat].toString(16).padStart(6, '0')}`;
            ctx.beginPath();
            ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = hex;
            ctx.fill();
        }

        // Camera position + heading
        const cx = (this.cameraPosition.x + 80) * scale;
        const cy = (this.cameraPosition.z + 80) * scale;

        // Heading indicator
        const headLen = 8;
        const headX = cx - Math.sin(this.cameraYaw) * headLen;
        const headY = cy - Math.cos(this.cameraYaw) * headLen;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(headX, headY);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Camera dot
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#00e5ff';
        ctx.fill();
    }

    /* ── Teleport ─────────────────────────────────────── */

    teleportToZone(zone: CategoryZone): void {
        const offset = 20;
        this.cameraPosition.set(
            zone.position.x + Math.cos(zone.angle + Math.PI) * offset,
            5,
            zone.position.z + Math.sin(zone.angle + Math.PI) * offset,
        );
        this.cameraYaw = zone.angle;
        this.cameraPitch = -0.05;
    }

    /* ── Event handlers ────────────────────────────────── */

    private addEventListeners(container: HTMLDivElement): void {
        container.addEventListener('mousedown', this.onMouseDown);
        container.addEventListener('mousemove', this.onMouseMove);
        container.addEventListener('mouseup', this.onMouseUp);
        container.addEventListener('mouseleave', this.onMouseUp);
        container.addEventListener('wheel', this.onWheel, { passive: false });
        container.addEventListener('click', this.onClick);
        container.addEventListener('touchstart', this.onTouchStart, { passive: false });
        container.addEventListener('touchmove', this.onTouchMove, { passive: false });
        container.addEventListener('touchend', this.onTouchEnd);
        document.addEventListener('pointerlockchange', this.onPointerLockChange);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
    }

    private removeEventListeners(): void {
        const container = this.containerRef()?.nativeElement;
        if (container) {
            container.removeEventListener('mousedown', this.onMouseDown);
            container.removeEventListener('mousemove', this.onMouseMove);
            container.removeEventListener('mouseup', this.onMouseUp);
            container.removeEventListener('mouseleave', this.onMouseUp);
            container.removeEventListener('wheel', this.onWheel);
            container.removeEventListener('click', this.onClick);
            container.removeEventListener('touchstart', this.onTouchStart);
            container.removeEventListener('touchmove', this.onTouchMove);
            container.removeEventListener('touchend', this.onTouchEnd);
        }
        document.removeEventListener('pointerlockchange', this.onPointerLockChange);
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
    }

    private handleKeyDown(e: KeyboardEvent): void {
        this.keys.add(e.key.toLowerCase());
    }

    private handleKeyUp(e: KeyboardEvent): void {
        this.keys.delete(e.key.toLowerCase());
    }

    private handlePointerLockChange(): void {
        const container = this.containerRef()?.nativeElement;
        const locked = document.pointerLockElement === container;
        this.pointerLocked.set(locked);
        if (!locked) {
            this.isDragging = false;
        }
    }

    private handleMouseDown(e: MouseEvent): void {
        if (e.button === 0) {
            const container = this.containerRef()?.nativeElement;
            if (container && !this.pointerLocked()) {
                // Request pointer lock on click
                container.requestPointerLock();
                return;
            }
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        }
    }

    private handleMouseMove(e: MouseEvent): void {
        if (this.pointerLocked()) {
            // Use movementX/Y for FPS-style look (fix direction: -= for natural feel)
            const dx = e.movementX ?? 0;
            const dy = e.movementY ?? 0;
            this.cameraYaw -= dx * 0.002;
            this.cameraPitch = Math.max(-1, Math.min(0.8, this.cameraPitch - dy * 0.002));
        } else if (this.isDragging) {
            const dx = e.clientX - this.lastMouseX;
            const dy = e.clientY - this.lastMouseY;
            this.cameraYaw -= dx * 0.003;
            this.cameraPitch = Math.max(-1, Math.min(0.8, this.cameraPitch - dy * 0.003));
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        }

        // Raycast for hover (only when not pointer locked, otherwise use center)
        if (!this.pointerLocked()) {
            this.updateMousePosition(e);
            this.performHoverRaycast();
        }
    }

    private handleMouseUp(): void {
        this.isDragging = false;
    }

    private handleWheel(e: WheelEvent): void {
        e.preventDefault();
        this.cameraPosition.y = Math.max(2, Math.min(20, this.cameraPosition.y + e.deltaY * 0.03));
    }

    private handleClick(e: MouseEvent): void {
        if (!this.camera || !this.scene) return;

        // When pointer locked, raycast from screen center; otherwise from mouse position
        if (this.pointerLocked()) {
            this.mouse.set(0, 0);
        } else {
            this.updateMousePosition(e);
        }
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const meshes = this.bookNodes.map((n) => n.mesh);
        const intersects = this.raycaster.intersectObjects(meshes);
        if (intersects.length > 0) {
            const key = intersects[0].object.userData['entryKey'];
            const node = this.bookNodes.find((n) => n.entry.key === key);
            if (node) {
                // Check if this book has multiple pages
                const bookName = node.entry.book;
                if (bookName && this.bookGroups.has(bookName)) {
                    const pages = this.bookGroups.get(bookName)!;
                    if (pages.length > 1) {
                        this.bookPageSelect.emit({ entry: node.entry, pages });
                        return;
                    }
                }
                this.entrySelect.emit(node.entry);
            }
        }
    }

    private handleTouchStart(e: TouchEvent): void {
        if (e.touches.length === 1) {
            this.isDragging = true;
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
            this.lastMouseX = this.touchStartX;
            this.lastMouseY = this.touchStartY;
        }
    }

    private handleTouchMove(e: TouchEvent): void {
        if (e.touches.length === 1 && this.isDragging) {
            e.preventDefault();
            const dx = e.touches[0].clientX - this.lastMouseX;
            const dy = e.touches[0].clientY - this.lastMouseY;
            this.cameraYaw -= dx * 0.003;
            this.cameraPitch = Math.max(-1, Math.min(0.8, this.cameraPitch - dy * 0.003));
            this.lastMouseX = e.touches[0].clientX;
            this.lastMouseY = e.touches[0].clientY;
        }
    }

    private handleTouchEnd(): void {
        this.isDragging = false;
    }

    private updateMousePosition(e: MouseEvent): void {
        const container = this.containerRef()?.nativeElement;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.tooltipX.set(e.clientX - rect.left + 12);
        this.tooltipY.set(e.clientY - rect.top - 24);
    }

    private performHoverRaycast(): void {
        if (!this.camera) return;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const meshes = this.bookNodes.map((n) => n.mesh);
        const intersects = this.raycaster.intersectObjects(meshes);
        if (intersects.length > 0) {
            const key = intersects[0].object.userData['entryKey'];
            const node = this.bookNodes.find((n) => n.entry.key === key);
            this.hoveredEntry.set(node?.entry ?? null);
        } else {
            this.hoveredEntry.set(null);
        }
    }

    /* ── Resize ───────────────────────────────────────── */

    private handleResize(): void {
        const container = this.containerRef()?.nativeElement;
        if (!container || !this.renderer || !this.camera) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    /* ── Cleanup ──────────────────────────────────────── */

    private cleanup(): void {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        if (document.pointerLockElement) document.exitPointerLock();
        this.removeEventListeners();
        this.resizeObserver?.disconnect();

        // Dispose book nodes
        for (const node of this.bookNodes) {
            node.mesh.geometry.dispose();
            (node.mesh.material as THREE.Material).dispose();
            node.glowMesh.geometry.dispose();
            (node.glowMesh.material as THREE.Material).dispose();
            if (node.label.material instanceof THREE.SpriteMaterial && node.label.material.map) {
                node.label.material.map.dispose();
            }
            node.label.material.dispose();
        }

        // Dispose starfield
        if (this.stars) {
            this.stars.geometry.dispose();
            (this.stars.material as THREE.Material).dispose();
        }

        // Dispose zone rings and labels
        for (const ring of this.zoneRings) {
            ring.geometry.dispose();
            (ring.material as THREE.Material).dispose();
        }
        for (const label of this.zoneLabels) {
            if (label.material instanceof THREE.SpriteMaterial && label.material.map) {
                label.material.map.dispose();
            }
            label.material.dispose();
        }
        for (const group of this.shelfGroups) {
            group.traverse((obj) => {
                if (obj instanceof THREE.Mesh) {
                    obj.geometry.dispose();
                    (obj.material as THREE.Material).dispose();
                }
            });
        }

        // Dispose scene children
        if (this.scene) {
            this.scene.traverse((obj) => {
                if (obj instanceof THREE.Mesh) {
                    obj.geometry?.dispose();
                    if (obj.material instanceof THREE.Material) obj.material.dispose();
                }
                if (obj instanceof THREE.Sprite) {
                    if (obj.material.map) obj.material.map.dispose();
                    obj.material.dispose();
                }
            });
        }

        this.renderer?.dispose();
        this.renderer = null;
        this.scene = null;
        this.camera = null;
    }
}
