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
import {
    type CategoryZone,
    type BookNode3D,
    CATEGORY_COLORS,
    CATEGORY_LABELS,
    ALL_CATEGORIES,
    ZONE_RADIUS,
    BOOK_SPREAD,
} from './library-3d.types';
import { createTextSprite } from './library-3d.utils';

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

            <!-- Mode indicator -->
            <div class="lib3d__mode-badge">{{ fpsMode() ? 'WALK MODE' : 'BROWSE MODE' }}</div>
            <div class="lib3d__hint">
                @if (fpsMode()) {
                    WASD move · Mouse look · Click book to read · TAB browse mode
                } @else {
                    Right-drag look · Click item to read · WASD move · TAB walk mode
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
            border-radius: var(--radius);
            border: 1px solid var(--border);
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
            border-radius: var(--radius-md);
            border: 1px solid var(--border-bright);
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
            border: 1px solid var(--border-bright);
            border-radius: 12px;
            font-size: var(--text-xxs);
            font-weight: 600;
            font-family: inherit;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--text-primary);
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
            border: 1px solid var(--border-bright);
            border-radius: var(--radius);
            font-size: 0.7rem;
            color: var(--text-primary);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            gap: 8px;
            white-space: nowrap;
        }
        .lib3d__tooltip-cat {
            font-size: var(--text-xxs);
            text-transform: uppercase;
            color: var(--text-secondary);
        }
        .lib3d__mode-badge {
            position: absolute;
            top: 12px;
            right: 12px;
            padding: 4px 12px;
            background: rgba(5, 5, 10, 0.85);
            border: 1px solid var(--accent-cyan);
            border-radius: 12px;
            font-size: var(--text-xxs);
            font-weight: 700;
            font-family: inherit;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--accent-cyan);
            pointer-events: none;
            backdrop-filter: blur(4px);
            z-index: 15;
        }
        .lib3d__hint {
            position: absolute;
            bottom: 12px;
            left: 12px;
            font-size: var(--text-xxs);
            color: var(--text-secondary);
            pointer-events: none;
        }

        @media (max-width: 600px) {
            .lib3d { height: 450px; }
            .lib3d__minimap { width: 100px; height: 100px; }
            .lib3d__legend { gap: 2px; }
            .lib3d__legend-btn { font-size: var(--text-micro); padding: 2px 6px; }
        }
    `,
})
export class Library3DComponent implements OnDestroy {
    readonly entries = input.required<LibraryEntry[]>();
    readonly paused = input(false);
    readonly entrySelect = output<LibraryEntry>();
    readonly orbSearch = output<void>();

    protected readonly hoveredEntry = signal<LibraryEntry | null>(null);
    protected readonly tooltipX = signal(0);
    protected readonly tooltipY = signal(0);
    protected readonly fpsMode = signal(false);

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
    private starTwinklePhases: Float32Array | null = null;
    private dustParticles: THREE.Points | null = null;
    private centerOrb: THREE.Mesh | null = null;
    private centerRing: THREE.Mesh | null = null;
    private centerOrbHitbox: THREE.Mesh | null = null;
    private orbHovered = false;
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

    // Guards against rapid re-selection after closing book
    private unpausedAt = 0;
    // Track right-click drag state
    private rightDragging = false;

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

    // (bookGroups removed — grouped API returns totalPages directly)

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
    private onContextMenu = (e: MouseEvent) => e.preventDefault();
    private onPointerLockChange = () => {
        if (!document.pointerLockElement && this.fpsMode()) {
            this.fpsMode.set(false);
        }
    };

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

        // Exit FPS mode and clear keys when paused (reading a book)
        effect(() => {
            if (this.paused()) {
                this.fpsMode.set(false);
                if (document.pointerLockElement) document.exitPointerLock();
                this.keys.clear();
            } else {
                // Track when we unpaused to prevent immediate re-selection
                this.unpausedAt = Date.now();
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
        this.scene.fog = new THREE.Fog(0x05050a, 40, 110);

        // Camera
        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 200);
        this.camera.position.copy(this.cameraPosition);
        this.camera.lookAt(this.cameraTarget);

        // Lighting — warm ambient + cool accents for a mystical library feel
        const ambient = new THREE.AmbientLight(0x1a1525, 1.0);
        this.scene.add(ambient);

        // Central chandelier light (warm)
        const centralLight = new THREE.PointLight(0xffe4b5, 1.4, 120);
        centralLight.position.set(0, 25, 0);
        this.scene.add(centralLight);

        // Cool accent from above (cyan tint)
        const skyLight = new THREE.PointLight(0x00e5ff, 0.4, 150);
        skyLight.position.set(0, 40, 0);
        this.scene.add(skyLight);

        // Fill lights at opposing corners for depth
        const fillLight1 = new THREE.PointLight(0xa78bfa, 0.35, 80);
        fillLight1.position.set(-30, 12, 30);
        this.scene.add(fillLight1);

        const fillLight2 = new THREE.PointLight(0xf59e0b, 0.25, 80);
        fillLight2.position.set(30, 12, -30);
        this.scene.add(fillLight2);

        // Ground — dark wood floor with subtle grid overlay
        const floorGeo = new THREE.CircleGeometry(70, 64);
        floorGeo.rotateX(-Math.PI / 2);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x0d0a12,
            roughness: 0.85,
            metalness: 0.05,
            emissive: new THREE.Color(0x1a1525),
            emissiveIntensity: 0.15,
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.position.y = -0.01;
        this.scene.add(floor);

        // Subtle concentric floor rings for depth cue (no grid)
        for (const r of [15, 35, 55]) {
            const ringGeo = new THREE.RingGeometry(r - 0.1, r + 0.1, 64);
            ringGeo.rotateX(-Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0x1a1530,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.y = 0.02;
            this.scene.add(ring);
        }

        // Center piece — glowing corvid emblem pedestal
        this.createCenterPiece();

        // Starfield ceiling + floating dust particles
        this.createStarfield();
        this.createDustParticles();

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
        const count = 1000;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        this.starTwinklePhases = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 70 + Math.random() * 40;
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 15;
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

            // Warm library starfield: mix of warm amber, soft white, and faint cyan
            const colorType = Math.random();
            const i3 = i * 3;
            if (colorType < 0.4) {
                // Warm amber/gold (like candlelight)
                colors[i3] = 0.9 + Math.random() * 0.1;
                colors[i3 + 1] = 0.7 + Math.random() * 0.2;
                colors[i3 + 2] = 0.3 + Math.random() * 0.15;
            } else if (colorType < 0.6) {
                // Faint cyan accent
                colors[i3] = 0.5 + Math.random() * 0.2;
                colors[i3 + 1] = 0.8 + Math.random() * 0.2;
                colors[i3 + 2] = 0.9 + Math.random() * 0.1;
            } else {
                // Soft white
                const b = 0.7 + Math.random() * 0.3;
                colors[i3] = b;
                colors[i3 + 1] = b * 0.95;
                colors[i3 + 2] = b;
            }

            this.starTwinklePhases[i] = Math.random() * Math.PI * 2;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const mat = new THREE.PointsMaterial({
            size: 0.3,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            sizeAttenuation: true,
            depthWrite: false,
        });
        this.stars = new THREE.Points(geo, mat);
        this.scene!.add(this.stars);
    }

    private createCenterPiece(): void {
        const group = new THREE.Group();

        // Circular pedestal base
        const baseGeo = new THREE.CylinderGeometry(4, 4.5, 0.6, 32);
        const baseMat = new THREE.MeshStandardMaterial({
            color: 0x1a1530,
            emissive: new THREE.Color(0x00e5ff),
            emissiveIntensity: 0.08,
            roughness: 0.4,
            metalness: 0.6,
        });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 0.3;
        group.add(base);

        // Glowing ring on pedestal
        const ringGeo = new THREE.TorusGeometry(3.5, 0.08, 8, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x00e5ff,
            transparent: true,
            opacity: 0.6,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.65;
        group.add(ring);

        // Floating orb above pedestal
        const orbGeo = new THREE.IcosahedronGeometry(1.2, 2);
        const orbMat = new THREE.MeshStandardMaterial({
            color: 0x00e5ff,
            emissive: new THREE.Color(0x00e5ff),
            emissiveIntensity: 0.8,
            roughness: 0.1,
            metalness: 0.9,
            transparent: true,
            opacity: 0.7,
        });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.y = 4;
        group.add(orb);
        this.centerOrb = orb;

        // Orb glow
        const orbGlowGeo = new THREE.SphereGeometry(2.5, 16, 16);
        const orbGlowMat = new THREE.MeshBasicMaterial({
            color: 0x00e5ff,
            transparent: true,
            opacity: 0.06,
        });
        const orbGlow = new THREE.Mesh(orbGlowGeo, orbGlowMat);
        orbGlow.position.y = 4;
        group.add(orbGlow);

        // Inner ring (rotates)
        const innerRingGeo = new THREE.TorusGeometry(1.8, 0.03, 8, 48);
        const innerRingMat = new THREE.MeshBasicMaterial({
            color: 0xa78bfa,
            transparent: true,
            opacity: 0.5,
        });
        const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
        innerRing.position.y = 4;
        group.add(innerRing);
        this.centerRing = innerRing;

        // Invisible hitbox sphere for click detection (larger than orb)
        const hitboxGeo = new THREE.SphereGeometry(3, 16, 16);
        const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
        hitbox.position.y = 4;
        hitbox.userData = { isOrbHitbox: true };
        group.add(hitbox);
        this.centerOrbHitbox = hitbox;

        // "CORVID LIBRARY" text label floating above
        const titleLabel = createTextSprite('CORVID LIBRARY', 0x00e5ff, 512, 64, 28);
        titleLabel.position.set(0, 7.5, 0);
        titleLabel.scale.set(12, 1.5, 1);
        group.add(titleLabel);

        // Subtitle
        const subLabel = createTextSprite('Team Alpha Knowledge Commons', 0x8888aa, 512, 48, 18);
        subLabel.position.set(0, 6.5, 0);
        subLabel.scale.set(12, 1.2, 1);
        group.add(subLabel);

        // "Click to Search" hint below orb
        const searchLabel = createTextSprite('Click Orb to Search', 0x66aacc, 384, 36, 14);
        searchLabel.position.set(0, 1.5, 0);
        searchLabel.scale.set(7, 0.7, 1);
        group.add(searchLabel);

        this.scene!.add(group);
    }

    private createDustParticles(): void {
        const count = 200;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 120;
            positions[i * 3 + 1] = Math.random() * 20 + 1;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 120;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            color: 0xffe4b5,
            size: 0.12,
            transparent: true,
            opacity: 0.3,
        });
        this.dustParticles = new THREE.Points(geo, mat);
        this.scene!.add(this.dustParticles);
    }

    private createZoneMarkers(): void {
        for (const zone of this.categoryZones) {
            // Ground ring marker
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

            // Zone label (floating above shelves)
            const labelSprite = createTextSprite(zone.label, zone.color, 256, 48, 24);
            labelSprite.position.copy(zone.position);
            labelSprite.position.y = 7;
            labelSprite.scale.set(10, 2, 1);
            this.scene!.add(labelSprite);
            this.zoneLabels.push(labelSprite);

            // Build actual bookshelf structures — 2 shelves per zone
            const shelfGroup = new THREE.Group();
            const shelfMat = new THREE.MeshStandardMaterial({
                color: 0x1a1520,
                emissive: new THREE.Color(zone.color),
                emissiveIntensity: 0.05,
                roughness: 0.9,
                metalness: 0.1,
            });
            const postMat = new THREE.MeshStandardMaterial({
                color: 0x1a1520,
                emissive: new THREE.Color(zone.color),
                emissiveIntensity: 0.08,
                roughness: 0.8,
                metalness: 0.2,
            });

            for (let s = 0; s < 2; s++) {
                const shelfAngle = zone.angle + ((s - 0.5) * 0.6);
                const sx = zone.position.x + Math.cos(shelfAngle) * (BOOK_SPREAD * 0.5);
                const sz = zone.position.z + Math.sin(shelfAngle) * (BOOK_SPREAD * 0.5);

                // Vertical posts (left + right) — thicker, taller
                for (const side of [-1, 1]) {
                    const postGeo = new THREE.BoxGeometry(0.2, 7, 0.2);
                    const post = new THREE.Mesh(postGeo, postMat);
                    const offsetX = Math.cos(shelfAngle + Math.PI / 2) * 3.2 * side;
                    const offsetZ = Math.sin(shelfAngle + Math.PI / 2) * 3.2 * side;
                    post.position.set(sx + offsetX, 3.5, sz + offsetZ);
                    shelfGroup.add(post);
                }

                // Back panel (gives shelves depth/substance)
                const backGeo = new THREE.BoxGeometry(6.6, 7, 0.08);
                const backMat = new THREE.MeshStandardMaterial({
                    color: 0x120e1a,
                    emissive: new THREE.Color(zone.color),
                    emissiveIntensity: 0.02,
                    roughness: 0.95,
                    metalness: 0.0,
                });
                const back = new THREE.Mesh(backGeo, backMat);
                // Position behind the shelf
                const backOffset = 0.65;
                back.position.set(
                    sx + Math.cos(shelfAngle) * backOffset,
                    3.5,
                    sz + Math.sin(shelfAngle) * backOffset,
                );
                back.rotation.y = shelfAngle;
                shelfGroup.add(back);

                // Top cap
                const capGeo = new THREE.BoxGeometry(6.6, 0.15, 1.3);
                const cap = new THREE.Mesh(capGeo, postMat);
                cap.position.set(sx, 7, sz);
                cap.rotation.y = shelfAngle;
                shelfGroup.add(cap);

                // Horizontal shelf planks at 3 heights — wider
                for (const shelfY of [1, 3, 5]) {
                    const plankGeo = new THREE.BoxGeometry(6.4, 0.14, 1.3);
                    const plank = new THREE.Mesh(plankGeo, shelfMat);
                    plank.position.set(sx, shelfY, sz);
                    plank.rotation.y = shelfAngle;
                    shelfGroup.add(plank);
                }
            }

            // Zone-specific ground glow (soft circular light)
            const glowGeo = new THREE.CircleGeometry(BOOK_SPREAD + 1, 32);
            glowGeo.rotateX(-Math.PI / 2);
            const glowMat = new THREE.MeshBasicMaterial({
                color: zone.color,
                transparent: true,
                opacity: 0.04,
                side: THREE.DoubleSide,
            });
            const glow = new THREE.Mesh(glowGeo, glowMat);
            glow.position.copy(zone.position);
            glow.position.y = 0.02;
            this.scene!.add(glow);
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

        // Use totalPages from the grouped API — no need to re-group locally.
        // The API already returns one entry per book (page 1) with totalPages set.
        const dedupedEntries: { entry: LibraryEntry; pageCount: number }[] = entries.map((entry) => ({
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

        const now = Date.now();
        // Shelf heights (matching createZoneMarkers planks at y=1,3,5)
        const shelfHeights = [1, 3, 5];

        for (const zone of this.categoryZones) {
            const zoneItems = grouped.get(zone.category) ?? [];

            // Sort: multi-page books first (prominent), then notes
            const books = zoneItems.filter((item) => item.pageCount > 1);
            const notes = zoneItems.filter((item) => item.pageCount <= 1);

            // Place books on lower shelves (1, 3), notes on upper shelf (5)
            // Each shelf spans 2 sub-shelves (left/right) from createZoneMarkers
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
                        const { entry, pageCount } = allItems[itemIdx];
                        itemIdx++;

                        const isBook = pageCount > 1;

                        // Position along shelf — spread items evenly
                        const slotOffset = slotsOnShelf > 1
                            ? (slot / (slotsOnShelf - 1) - 0.5) * 5
                            : 0;
                        const perpX = Math.cos(shelfAngle + Math.PI / 2) * slotOffset;
                        const perpZ = Math.sin(shelfAngle + Math.PI / 2) * slotOffset;
                        const x = sx + perpX;
                        const z = sz + perpZ;

                        // Age-based glow
                        const age = now - new Date(entry.updatedAt).getTime();
                        const hoursSinceUpdate = age / (1000 * 60 * 60);
                        const recentGlow = Math.max(0, 1 - hoursSinceUpdate / 168);

                        let bookMesh: THREE.Mesh;
                        let height: number;

                        if (isBook) {
                            // BOOKS: thick, tall, bright colored spine — unmistakable
                            const thickness = 0.4 + Math.min(pageCount * 0.12, 1.0);
                            height = 1.8;
                            // Main body (cover)
                            const bodyGeo = new THREE.BoxGeometry(1.2, height, thickness);
                            const bodyMat = new THREE.MeshStandardMaterial({
                                color: zone.color,
                                emissive: new THREE.Color(zone.color),
                                emissiveIntensity: 0.4 + recentGlow * 0.5,
                                roughness: 0.4,
                                metalness: 0.3,
                            });
                            bookMesh = new THREE.Mesh(bodyGeo, bodyMat);

                            // Spine stripe (white/gold accent on the side)
                            const spineGeo = new THREE.BoxGeometry(1.22, height * 0.6, thickness + 0.02);
                            const spineMat = new THREE.MeshStandardMaterial({
                                color: 0xffd700,
                                emissive: new THREE.Color(0xffd700),
                                emissiveIntensity: 0.3,
                                roughness: 0.3,
                                metalness: 0.5,
                            });
                            const spineMesh = new THREE.Mesh(spineGeo, spineMat);
                            spineMesh.position.y = -height * 0.15;
                            bookMesh.add(spineMesh);
                        } else {
                            // NOTES: thin flat sheet, parchment-colored, clearly different
                            height = 1.0;
                            const noteGeo = new THREE.BoxGeometry(0.8, height, 0.04);
                            const noteMat = new THREE.MeshStandardMaterial({
                                color: 0xf5f0e0, // parchment
                                emissive: new THREE.Color(zone.color),
                                emissiveIntensity: 0.1 + recentGlow * 0.15,
                                roughness: 0.9,
                                metalness: 0.0,
                            });
                            bookMesh = new THREE.Mesh(noteGeo, noteMat);

                            // Corner fold indicator
                            const foldGeo = new THREE.BoxGeometry(0.15, 0.15, 0.05);
                            const foldMat = new THREE.MeshStandardMaterial({
                                color: zone.color,
                                emissive: new THREE.Color(zone.color),
                                emissiveIntensity: 0.3,
                            });
                            const fold = new THREE.Mesh(foldGeo, foldMat);
                            fold.position.set(0.33, height * 0.42, 0);
                            bookMesh.add(fold);
                        }

                        const y = shelfY + height / 2 + 0.12;
                        bookMesh.position.set(x, y, z);
                        bookMesh.rotation.y = shelfAngle;
                        bookMesh.userData = { entryKey: entry.key };
                        this.scene!.add(bookMesh);

                        // Glow sphere (bigger for books)
                        const glowGeo = new THREE.SphereGeometry(isBook ? 1.2 : 0.5, 12, 12);
                        const glowMat = new THREE.MeshBasicMaterial({
                            color: isBook ? zone.color : 0xf5f0e0,
                            transparent: true,
                            opacity: isBook ? 0.06 + recentGlow * 0.1 : 0.02 + recentGlow * 0.04,
                        });
                        const glowMesh = new THREE.Mesh(glowGeo, glowMat);
                        glowMesh.position.copy(bookMesh.position);
                        this.scene!.add(glowMesh);

                        // Label — prefer title, then book name, then humanized key
                        const rawName = entry.title ?? (entry.book && pageCount > 1 ? entry.book : entry.key);
                        const displayName = entry.title
                            ? entry.title
                            : rawName
                                .replace(/^(ref|guide|std|dec|rb|runbook|decision|standard|reference)-/i, '')
                                .replace(/[-_]/g, ' ')
                                .replace(/\b\w/g, (c: string) => c.toUpperCase());
                        const labelBase = displayName.length > 28 ? `${displayName.slice(0, 26)}..` : displayName;
                        const labelText = isBook
                            ? `${labelBase}  (${pageCount}p)`
                            : labelBase;
                        const labelColor = isBook ? 0xffd700 : 0xcccccc;
                        const label = createTextSprite(labelText, labelColor, 512, 36, 14);
                        label.position.set(x, y + height / 2 + 0.5, z);
                        label.scale.set(5.5, 0.55, 1);
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
        }
    }

    /* ── Animation loop ────────────────────────────────── */

    private animate(time: number): void {
        this.animationId = requestAnimationFrame((t) => this.animate(t));
        if (!this.renderer || !this.scene || !this.camera) return;

        const t = time * 0.001;

        // Process movement
        this.processMovement();

        // Animate books (subtle glow pulse, no floating — they're on shelves)
        if (!this.reducedMotion) {
            for (const node of this.bookNodes) {
                const pulse = Math.sin(t * 1.2 + node.pulsePhase) * 0.5 + 0.5;
                const glowMat = node.glowMesh.material as THREE.MeshBasicMaterial;
                glowMat.opacity = 0.03 + pulse * 0.06;
            }

            // Center orb: gentle float + rotation
            if (this.centerOrb) {
                this.centerOrb.position.y = 4 + Math.sin(t * 0.8) * 0.3;
                this.centerOrb.rotation.y = t * 0.3;
                this.centerOrb.rotation.x = Math.sin(t * 0.5) * 0.15;
            }
            if (this.centerRing) {
                this.centerRing.position.y = 4 + Math.sin(t * 0.8) * 0.3;
                this.centerRing.rotation.x = Math.PI / 2 + Math.sin(t * 0.6) * 0.4;
                this.centerRing.rotation.z = t * 0.5;
            }

            // Star twinkling
            if (this.stars && this.starTwinklePhases) {
                const starColors = this.stars.geometry.attributes['color'] as THREE.BufferAttribute;
                const starCount = this.starTwinklePhases.length;
                // Only update every 3rd frame for performance
                if (Math.floor(t * 60) % 3 === 0) {
                    for (let i = 0; i < starCount; i++) {
                        const phase = this.starTwinklePhases[i];
                        const twinkle = 0.5 + 0.5 * Math.sin(t * (0.5 + phase * 0.3) + phase * 8);
                        const i3 = i * 3;
                        const r = starColors.array[i3] as number;
                        const g = starColors.array[i3 + 1] as number;
                        const b = starColors.array[i3 + 2] as number;
                        const maxC = Math.max(r, g, b, 0.01);
                        (starColors.array as Float32Array)[i3] = (r / maxC) * twinkle;
                        (starColors.array as Float32Array)[i3 + 1] = (g / maxC) * twinkle;
                        (starColors.array as Float32Array)[i3 + 2] = (b / maxC) * twinkle;
                    }
                    starColors.needsUpdate = true;
                }
                // Slow rotation
                this.stars.rotation.y = t * 0.008;
            }

            // Dust particles: slow drift
            if (this.dustParticles) {
                const pos = this.dustParticles.geometry.attributes['position'] as THREE.BufferAttribute;
                for (let i = 0; i < pos.count; i++) {
                    let y = pos.getY(i);
                    y += 0.003;
                    if (y > 22) y = 1;
                    pos.setY(i, y);
                    pos.setX(i, pos.getX(i) + Math.sin(t + i) * 0.001);
                }
                pos.needsUpdate = true;
            }
        }

        // Render
        this.renderer.render(this.scene, this.camera);

        // Draw minimap
        this.drawMinimap();
    }

    private processMovement(): void {
        if (this.paused()) return;
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
        container.addEventListener('contextmenu', this.onContextMenu);
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
            container.removeEventListener('contextmenu', this.onContextMenu);
            container.removeEventListener('touchstart', this.onTouchStart);
            container.removeEventListener('touchmove', this.onTouchMove);
            container.removeEventListener('touchend', this.onTouchEnd);
        }
        document.removeEventListener('pointerlockchange', this.onPointerLockChange);
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
    }

    private handleKeyDown(e: KeyboardEvent): void {
        if (this.paused()) return;
        const key = e.key.toLowerCase();
        if (key === 'tab') {
            e.preventDefault();
            const entering = !this.fpsMode();
            this.fpsMode.set(entering);
            const container = this.containerRef()?.nativeElement;
            if (entering && container) {
                container.requestPointerLock();
            } else if (!entering && document.pointerLockElement) {
                document.exitPointerLock();
            }
            return;
        }
        if (key === 'escape' && this.fpsMode()) {
            this.fpsMode.set(false);
            if (document.pointerLockElement) document.exitPointerLock();
            return;
        }
        this.keys.add(key);
    }

    private handleKeyUp(e: KeyboardEvent): void {
        this.keys.delete(e.key.toLowerCase());
    }

    private handleMouseDown(e: MouseEvent): void {
        if (this.paused()) return;
        if (e.button === 2) {
            // Right-click: start looking around (in browse mode)
            this.rightDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            e.preventDefault();
            return;
        }
        if (e.button === 0 && !this.fpsMode()) {
            // Left-click drag in browse mode (for orbit)
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        }
    }

    private handleMouseMove(e: MouseEvent): void {
        if (this.paused()) return;

        if (this.fpsMode() && document.pointerLockElement) {
            // FPS mode with pointer lock: mouse controls look
            const dx = e.movementX ?? 0;
            const dy = e.movementY ?? 0;
            this.cameraYaw -= dx * 0.002;
            this.cameraPitch = Math.max(-1, Math.min(0.8, this.cameraPitch - dy * 0.002));
        } else if (this.rightDragging || this.isDragging) {
            // Browse mode: right-drag or left-drag to look
            const dx = e.clientX - this.lastMouseX;
            const dy = e.clientY - this.lastMouseY;
            this.cameraYaw -= dx * 0.003;
            this.cameraPitch = Math.max(-1, Math.min(0.8, this.cameraPitch - dy * 0.003));
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        }

        // Raycast for hover in browse mode
        if (!this.fpsMode() && !this.rightDragging) {
            this.updateMousePosition(e);
            this.performHoverRaycast();
        }
    }

    private handleMouseUp(): void {
        this.isDragging = false;
        this.rightDragging = false;
    }

    private handleWheel(e: WheelEvent): void {
        e.preventDefault();
        this.cameraPosition.y = Math.max(2, Math.min(20, this.cameraPosition.y + e.deltaY * 0.03));
    }

    private handleClick(e: MouseEvent): void {
        if (!this.camera || !this.scene) return;
        if (this.paused()) return;

        // Guard: don't select if we just unpaused (closed a book overlay)
        if (Date.now() - this.unpausedAt < 500) return;

        // In FPS mode, enter browse mode on click instead of selecting
        if (this.fpsMode()) {
            // Raycast from screen center
            this.mouse.set(0, 0);
        } else {
            // Browse mode: raycast from mouse position
            this.updateMousePosition(e);
        }

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check orb hitbox first — opens search
        if (this.centerOrbHitbox) {
            const orbHits = this.raycaster.intersectObject(this.centerOrbHitbox);
            if (orbHits.length > 0) {
                this.orbSearch.emit();
                return;
            }
        }

        const meshes = this.bookNodes.map((n) => n.mesh);
        const intersects = this.raycaster.intersectObjects(meshes);
        if (intersects.length > 0) {
            const key = intersects[0].object.userData['entryKey'];
            const node = this.bookNodes.find((n) => n.entry.key === key);
            if (node) {
                // Always use entrySelect — the parent's openEntry handler
                // fetches full book pages from the API when entry.book is set.
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

        // Check orb hover
        const container = this.containerRef()?.nativeElement;
        if (this.centerOrbHitbox) {
            const orbHits = this.raycaster.intersectObject(this.centerOrbHitbox);
            const wasHovered = this.orbHovered;
            this.orbHovered = orbHits.length > 0;
            if (this.orbHovered !== wasHovered && container) {
                container.style.cursor = this.orbHovered ? 'pointer' : '';
            }
            if (this.orbHovered) {
                // Pulse orb brighter on hover
                if (this.centerOrb) {
                    const mat = this.centerOrb.material as THREE.MeshStandardMaterial;
                    mat.emissiveIntensity = 1.2;
                }
                this.hoveredEntry.set(null);
                return;
            }
            if (this.centerOrb) {
                const mat = this.centerOrb.material as THREE.MeshStandardMaterial;
                mat.emissiveIntensity = 0.8;
            }
        }

        const meshes = this.bookNodes.map((n) => n.mesh);
        const intersects = this.raycaster.intersectObjects(meshes);
        if (intersects.length > 0) {
            const key = intersects[0].object.userData['entryKey'];
            const node = this.bookNodes.find((n) => n.entry.key === key);
            this.hoveredEntry.set(node?.entry ?? null);
            if (container) container.style.cursor = 'pointer';
        } else {
            this.hoveredEntry.set(null);
            if (container) container.style.cursor = '';
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
