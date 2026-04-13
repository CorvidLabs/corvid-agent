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
import type * as THREE from 'three';

/* ── Data types (same interface as 2D vis) ──────────────── */

interface VisAgent {
    id: string;
    name: string;
    color: string;
}

interface VisMessage {
    fromAgentId: string;
    toAgentId: string;
    status: string;
    timestamp: number;
    channel: string;
    fromAgent?: string;
    toAgent?: string;
    content?: string;
}

/* ── Internal 3D types ──────────────────────────────────── */

interface AgentNode3D {
    id: string;
    name: string;
    color: THREE.Color;
    position: THREE.Vector3;
    mesh: THREE.Mesh;
    glowMesh: THREE.Mesh;
    label: THREE.Sprite;
    msgCount: number;
    lastActive: number;
    pulsePhase: number;
    baseRadius: number;
}

interface Edge3D {
    fromId: string;
    toId: string;
    count: number;
    lastActive: number;
    line: THREE.Line;
}

interface Particle3D {
    fromId: string;
    toId: string;
    progress: number;
    speed: number;
    color: THREE.Color;
    mesh: THREE.Mesh;
    opacity: number;
    curve: THREE.CubicBezierCurve3;
}

interface Trail3D {
    mesh: THREE.Mesh;
    createdAt: number;
    maxAge: number; // seconds
}

interface LogEntry {
    fromAgent: string;
    toAgent: string;
    content: string;
    channel: string;
    timestamp: number;
    color: string;
}

interface TooltipState {
    visible: boolean;
    x: number;
    y: number;
    name: string;
    color: string;
    msgCount: number;
}

@Component({
    selector: 'app-agent-network-3d',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="network-3d" #container>
            <canvas #canvas></canvas>
            @if (tooltip().visible) {
                <div
                    class="network-3d__tooltip"
                    [style.left.px]="tooltip().x + 12"
                    [style.top.px]="tooltip().y - 8"
                >
                    <span class="network-3d__tooltip-dot" [style.background]="tooltip().color"></span>
                    <span class="network-3d__tooltip-name">{{ tooltip().name }}</span>
                    <span class="network-3d__tooltip-msgs">{{ tooltip().msgCount }} msgs</span>
                </div>
            }
            @if (selectedAgent()) {
                <div class="network-3d__selected">
                    <span class="network-3d__selected-dot" [style.background]="selectedAgent()!.color"></span>
                    {{ selectedAgent()!.name }}
                    <button class="network-3d__clear" (click)="clearSelection()">x</button>
                </div>
            }
            @if (logEntries().length > 0) {
                <div class="network-3d__log" #logPanel>
                    <div class="network-3d__log-header">
                        <span>Message Log</span>
                        <span class="network-3d__log-count">{{ logEntries().length }}</span>
                    </div>
                    <div class="network-3d__log-list">
                        @for (entry of logEntries(); track $index) {
                            <div class="network-3d__log-item">
                                <span class="network-3d__log-time">{{ formatTime(entry.timestamp) }}</span>
                                <span class="network-3d__log-flow">
                                    <span [style.color]="entry.color">{{ entry.fromAgent }}</span>
                                    <span class="network-3d__log-arrow">&rarr;</span>
                                    {{ entry.toAgent }}
                                </span>
                                <span class="network-3d__log-preview">{{ entry.content }}</span>
                            </div>
                        }
                    </div>
                </div>
            }
            <div class="network-3d__hint">Drag to orbit &middot; Right-drag/two-finger to pan &middot; Scroll to zoom &middot; Click to select &middot; Double-click to focus</div>
        </div>
    `,
    styles: `
        .network-3d {
            position: relative;
            width: 100%;
            height: 100%;
            min-height: 400px;
            background: #05050a;
            border-radius: var(--radius);
            border: 1px solid var(--border);
            overflow: hidden;
            cursor: crosshair;
        }
        canvas {
            display: block;
            width: 100%;
            height: 100%;
        }
        .network-3d__tooltip {
            position: absolute;
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 4px 8px;
            background: rgba(5, 5, 10, 0.92);
            border: 1px solid var(--border-bright);
            border-radius: 6px;
            font-size: 0.65rem;
            color: var(--text-primary);
            backdrop-filter: blur(4px);
            pointer-events: none;
            z-index: 20;
            white-space: nowrap;
            transform: translateY(-100%);
        }
        .network-3d__tooltip-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .network-3d__tooltip-name { font-weight: 600; }
        .network-3d__tooltip-msgs {
            color: var(--text-tertiary);
            font-size: 0.6rem;
        }
        .network-3d__selected {
            position: absolute;
            top: 12px;
            left: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            background: rgba(5, 5, 10, 0.85);
            border: 1px solid var(--border-bright);
            border-radius: 16px;
            font-size: 0.7rem;
            color: var(--text-primary);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            backdrop-filter: blur(4px);
            z-index: 10;
        }
        .network-3d__selected-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .network-3d__clear {
            background: none;
            border: none;
            color: var(--text-tertiary);
            cursor: pointer;
            font-size: 0.7rem;
            font-family: inherit;
            padding: 0 2px;
            line-height: 1;
        }
        .network-3d__clear:hover { color: var(--text-primary); }
        .network-3d__hint {
            position: absolute;
            bottom: 10px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 0.6rem;
            color: var(--text-tertiary);
            letter-spacing: 0.05em;
            opacity: 0.6;
            pointer-events: none;
            z-index: 10;
        }

        .network-3d__log {
            position: absolute;
            bottom: 32px;
            right: 12px;
            width: 280px;
            max-height: 240px;
            background: rgba(5, 5, 10, 0.88);
            border: 1px solid var(--border-bright);
            border-radius: 8px;
            backdrop-filter: blur(8px);
            z-index: 10;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            font-size: 0.65rem;
        }
        .network-3d__log-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 10px;
            border-bottom: 1px solid var(--border);
            color: var(--text-secondary);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-size: 0.6rem;
        }
        .network-3d__log-count {
            background: var(--surface-alt);
            padding: 1px 6px;
            border-radius: 8px;
            font-size: 0.55rem;
            color: var(--text-tertiary);
        }
        .network-3d__log-list {
            overflow-y: auto;
            flex: 1;
            padding: 4px 0;
        }
        .network-3d__log-item {
            padding: 3px 10px;
            display: flex;
            flex-direction: column;
            gap: 1px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }
        .network-3d__log-item:last-child { border-bottom: none; }
        .network-3d__log-time {
            color: var(--text-tertiary);
            font-size: 0.55rem;
            font-family: var(--font-mono);
        }
        .network-3d__log-flow {
            color: var(--text-secondary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .network-3d__log-arrow {
            color: var(--text-tertiary);
            margin: 0 3px;
        }
        .network-3d__log-preview {
            color: var(--text-tertiary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 0.58rem;
        }
        @media (max-width: 600px) {
            .network-3d__log {
                width: 200px;
                max-height: 160px;
                bottom: 28px;
                right: 8px;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            canvas { display: none; }
            .network-3d::after {
                content: 'Agent 3D network (animations disabled — switch to Basic view)';
                position: absolute; inset: 0;
                display: flex; align-items: center; justify-content: center;
                color: var(--text-tertiary);
                font-size: 0.8rem;
            }
        }
    `,
})
export class AgentNetwork3DComponent implements OnDestroy {
    /* ── Inputs ──────────────────────────────────────────── */
    readonly agents = input.required<VisAgent[]>();
    readonly messages = input.required<VisMessage[]>();

    /* ── Outputs ─────────────────────────────────────────── */
    readonly agentSelected = output<string>();

    /* ── View refs ───────────────────────────────────────── */
    private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
    private readonly containerRef = viewChild.required<ElementRef<HTMLElement>>('container');

    /* ── State ───────────────────────────────────────────── */
    protected readonly selectedAgent = signal<VisAgent | null>(null);
    protected readonly logEntries = signal<LogEntry[]>([]);
    protected readonly tooltip = signal<TooltipState>({
        visible: false, x: 0, y: 0, name: '', color: '', msgCount: 0,
    });

    /* ── Three.js core ──────────────────────────────────── */
    private renderer: THREE.WebGLRenderer | null = null;
    private scene: THREE.Scene | null = null;
    private camera: THREE.PerspectiveCamera | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private orbitControls: any = null;
    private animId = 0;
    private resizeObserver: ResizeObserver | null = null;

    /* ── Scene objects ──────────────────────────────────── */
    private agentNodes: AgentNode3D[] = [];
    private nodeMap = new Map<string, AgentNode3D>();
    private edges: Edge3D[] = [];
    private edgeMap = new Map<string, Edge3D>();
    private particles: Particle3D[] = [];
    private starField: THREE.Points | null = null;
    private starTwinklePhases: Float32Array | null = null;
    private starBaseOpacities: Float32Array | null = null;
    private groundGrid: THREE.Group | null = null;
    private nebulaClouds: THREE.Group | null = null;
    private trails: Trail3D[] = [];
    private static readonly MAX_LOG_ENTRIES = 50;
    private static readonly TRAIL_MAX_AGE = 45; // seconds

    /* ── Lazy-loaded Three.js module ────────────────────── */
    // THREE is loaded dynamically so it only enters the bundle when the 3D view
    // is actually activated — zero cost for users who never open this mode.
    private three!: typeof import('three');

    /* ── Raycasting ─────────────────────────────────────── */
    private raycaster!: THREE.Raycaster;
    private mouse!: THREE.Vector2;
    private hoveredNodeId: string | null = null;
    private selectedNodeId: string | null = null;
    private lastProcessedMsgCount = 0;

    /* ── Reusable materials (initialized lazily in initScene) ─ */
    private glowMaterialTemplate!: THREE.MeshBasicMaterial;
    private sharedEdgeMaterial!: THREE.LineBasicMaterial;
    private sharedParticleGeometry!: THREE.SphereGeometry;

    /* ── Drag/click tracking ──────────────────────────────── */
    private isDragging = false;
    private dragStartX = 0;
    private dragStartY = 0;
    private dragMoved = false;

    /* ── Camera focus animation ──────────────────────────── */
    private focusCamPos: THREE.Vector3 | null = null;
    private focusCamLookAt: THREE.Vector3 | null = null;
    private isFocusing = false;

    /* ── Event handlers bound once ──────────────────────── */
    private readonly onPointerDown = (e: PointerEvent) => this.handlePointerDown(e);
    private readonly onPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
    private readonly onPointerUp = (e: PointerEvent) => this.handlePointerUp(e);
    private readonly onDblClick = (e: MouseEvent) => this.handleDblClick(e);

    constructor() {
        // Load Three.js + OrbitControls lazily — separate chunks, zero cost until first render
        afterNextRender(async () => {
            const [THREE, { OrbitControls }] = await Promise.all([
                import('three'),
                import('three/addons/controls/OrbitControls.js'),
            ]);
            this.three = THREE;
            this.raycaster = new THREE.Raycaster();
            this.mouse = new THREE.Vector2();
            this.initScene(OrbitControls);
            this.rebuildGraph(this.agents(), this.messages());
            this.startAnimation();
        });

        effect(() => {
            const agents = this.agents();
            const msgs = this.messages();
            this.rebuildGraph(agents, msgs);
        });
    }

    ngOnDestroy(): void {
        cancelAnimationFrame(this.animId);
        this.resizeObserver?.disconnect();
        this.orbitControls?.dispose();
        const canvas = this.canvasRef()?.nativeElement;
        if (canvas) {
            canvas.removeEventListener('pointerdown', this.onPointerDown);
            canvas.removeEventListener('pointermove', this.onPointerMove);
            canvas.removeEventListener('pointerup', this.onPointerUp);
            canvas.removeEventListener('dblclick', this.onDblClick);
        }
        // Dispose Three.js resources (only if module was loaded)
        if (this.three) {
            const THREE = this.three;
            this.agentNodes.forEach((n) => {
                n.mesh.geometry.dispose();
                (n.mesh.material as THREE.Material).dispose();
                n.glowMesh.geometry.dispose();
                n.label.material.dispose();
            });
            this.edges.forEach((e) => {
                e.line.geometry.dispose();
            });
            this.particles.forEach((p) => {
                (p.mesh.material as THREE.Material).dispose();
            });
            this.trails.forEach((t) => {
                (t.mesh.material as THREE.Material).dispose();
            });
            this.glowMaterialTemplate?.dispose();
            this.sharedEdgeMaterial?.dispose();
            this.sharedParticleGeometry?.dispose();
            this.starField?.geometry.dispose();
            (this.starField?.material as THREE.Material)?.dispose();
            this.groundGrid?.traverse((child) => {
                if (child instanceof THREE.Line) {
                    child.geometry.dispose();
                    (child.material as THREE.Material).dispose();
                }
            });
            this.nebulaClouds?.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    (child.material as THREE.Material).dispose();
                }
            });
        }
        this.renderer?.dispose();
    }

    protected clearSelection(): void {
        this.selectedNodeId = null;
        this.selectedAgent.set(null);
        this.agentSelected.emit('');
    }

    protected formatTime(ts: number): string {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    /* ── Scene initialization ───────────────────────────── */

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private initScene(OrbitControls: any): void {
        const THREE = this.three;
        const canvas = this.canvasRef().nativeElement;
        const container = this.containerRef().nativeElement;
        const rect = container.getBoundingClientRect();

        // Initialize shared/reusable Three.js objects
        this.glowMaterialTemplate = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.15,
            depthWrite: false,
            side: THREE.FrontSide,
        });
        this.sharedEdgeMaterial = new THREE.LineBasicMaterial({
            color: 0x1a2a3e,
            transparent: true,
            opacity: 0.4,
        });
        this.sharedParticleGeometry = new THREE.SphereGeometry(0.12, 6, 6);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(rect.width, rect.height);
        this.renderer.setClearColor(0x05050a);

        // Scene
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x05050a, 0.015);

        // Camera
        this.camera = new THREE.PerspectiveCamera(60, rect.width / rect.height, 0.1, 200);
        this.camera.position.set(0, 20, 30);
        this.camera.lookAt(0, 0, 0);

        // OrbitControls — left-drag: orbit, right-drag/two-finger: pan, scroll: zoom
        this.orbitControls = new OrbitControls(this.camera, canvas);
        this.orbitControls.enableDamping = true;
        this.orbitControls.dampingFactor = 0.08;
        this.orbitControls.minDistance = 10;
        this.orbitControls.maxDistance = 80;
        this.orbitControls.autoRotate = true;
        this.orbitControls.autoRotateSpeed = 0.3;

        // Lights
        const ambientLight = new THREE.AmbientLight(0x1a1a2e, 0.8);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0x00e5ff, 1.5, 80);
        pointLight.position.set(0, 15, 0);
        this.scene.add(pointLight);

        const fillLight = new THREE.PointLight(0xa78bfa, 0.6, 60);
        fillLight.position.set(-10, -5, 10);
        this.scene.add(fillLight);

        // Starfield + visual enhancements
        this.createStarfield();
        this.createGroundGrid();
        this.createNebulaClouds();

        // Pointer events — OrbitControls handles orbit/pan/zoom; we add hover+click on top
        canvas.style.cursor = 'crosshair';
        canvas.addEventListener('pointerdown', this.onPointerDown);
        canvas.addEventListener('pointermove', this.onPointerMove);
        canvas.addEventListener('pointerup', this.onPointerUp);
        canvas.addEventListener('dblclick', this.onDblClick);

        // Resize
        this.resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            const { width, height } = entry.contentRect;
            if (width === 0 || height === 0) return;
            this.renderer!.setSize(width, height);
            this.camera!.aspect = width / height;
            this.camera!.updateProjectionMatrix();
        });
        this.resizeObserver.observe(container);
    }

    private createStarfield(): void {
        const THREE = this.three;
        const starCount = 900;
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);

        // Store twinkle data for animation
        this.starTwinklePhases = new Float32Array(starCount);
        this.starBaseOpacities = new Float32Array(starCount);

        for (let i = 0; i < starCount; i++) {
            const i3 = i * 3;
            const r = 50 + Math.random() * 50;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            positions[i3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i3 + 2] = r * Math.cos(phi);

            // Color variation: some stars blue-white, some warm, some cyan
            const colorType = Math.random();
            if (colorType < 0.3) {
                // Cyan-tinted (corvid theme)
                colors[i3] = 0.4 + Math.random() * 0.3;
                colors[i3 + 1] = 0.7 + Math.random() * 0.3;
                colors[i3 + 2] = 0.9 + Math.random() * 0.1;
            } else if (colorType < 0.5) {
                // Warm/amber
                colors[i3] = 0.9 + Math.random() * 0.1;
                colors[i3 + 1] = 0.6 + Math.random() * 0.2;
                colors[i3 + 2] = 0.3 + Math.random() * 0.2;
            } else {
                // Blue-white
                const brightness = 0.4 + Math.random() * 0.6;
                colors[i3] = brightness * (0.8 + Math.random() * 0.2);
                colors[i3 + 1] = brightness * (0.8 + Math.random() * 0.2);
                colors[i3 + 2] = brightness;
            }

            sizes[i] = 0.08 + Math.random() * 0.25;
            this.starTwinklePhases[i] = Math.random() * Math.PI * 2;
            this.starBaseOpacities[i] = 0.3 + Math.random() * 0.7;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            size: 0.18,
            vertexColors: true,
            transparent: true,
            opacity: 0.7,
            sizeAttenuation: true,
            depthWrite: false,
        });

        this.starField = new THREE.Points(geometry, material);
        this.scene!.add(this.starField);
    }

    private createGroundGrid(): void {
        const THREE = this.three;
        this.groundGrid = new THREE.Group();

        // Hexagonal grid on XZ plane
        const gridColor = new THREE.Color(0x0a0a1e);
        const accentColor = new THREE.Color(0x00e5ff);
        const hexRadius = 3;
        const gridExtent = 40;
        const hexHeight = hexRadius * Math.sqrt(3);

        for (let row = -gridExtent / hexHeight; row <= gridExtent / hexHeight; row++) {
            for (let col = -gridExtent / (hexRadius * 1.5); col <= gridExtent / (hexRadius * 1.5); col++) {
                const x = col * hexRadius * 1.5;
                const z = row * hexHeight + (col % 2 ? hexHeight / 2 : 0);
                const dist = Math.sqrt(x * x + z * z);
                if (dist > gridExtent) continue;

                // Hex outline
                const hexPoints: THREE.Vector3[] = [];
                for (let k = 0; k <= 6; k++) {
                    const angle = (Math.PI / 3) * k + Math.PI / 6;
                    hexPoints.push(new THREE.Vector3(
                        x + Math.cos(angle) * hexRadius * 0.95,
                        -8,
                        z + Math.sin(angle) * hexRadius * 0.95,
                    ));
                }

                const hexGeo = new THREE.BufferGeometry().setFromPoints(hexPoints);
                const fadeOpacity = Math.max(0, 0.12 - dist * 0.002);
                const isCenter = dist < 8;
                const hexMat = new THREE.LineBasicMaterial({
                    color: isCenter ? accentColor : gridColor,
                    transparent: true,
                    opacity: isCenter ? fadeOpacity * 2 : fadeOpacity,
                });
                this.groundGrid.add(new THREE.Line(hexGeo, hexMat));
            }
        }

        this.scene!.add(this.groundGrid);
    }

    private createNebulaClouds(): void {
        const THREE = this.three;
        this.nebulaClouds = new THREE.Group();

        // Procedural nebula using transparent spheres at varying distances
        const nebulaColors = [
            { color: 0x1a0030, opacity: 0.03 }, // deep purple
            { color: 0x001a33, opacity: 0.025 }, // deep blue
            { color: 0x003322, opacity: 0.02 }, // teal
            { color: 0x0a0020, opacity: 0.035 }, // violet
        ];

        for (let i = 0; i < 12; i++) {
            const config = nebulaColors[i % nebulaColors.length];
            const size = 15 + Math.random() * 25;
            const geo = new THREE.SphereGeometry(size, 12, 12);
            const mat = new THREE.MeshBasicMaterial({
                color: config.color,
                transparent: true,
                opacity: config.opacity,
                side: THREE.BackSide,
                depthWrite: false,
            });
            const cloud = new THREE.Mesh(geo, mat);

            const r = 40 + Math.random() * 40;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            cloud.position.set(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.sin(phi) * Math.sin(theta) * 0.5, // flatten vertically
                r * Math.cos(phi),
            );
            cloud.scale.set(1, 0.5 + Math.random() * 0.5, 1); // Flatten clouds

            this.nebulaClouds.add(cloud);
        }

        this.scene!.add(this.nebulaClouds);
    }

    /* ── Graph building ─────────────────────────────────── */

    private rebuildGraph(agents: VisAgent[], messages: VisMessage[]): void {
        if (!this.scene || !this.three) return;
        const THREE = this.three;

        // Place agents in a circle in 3D space (XZ plane, slight Y variation)
        const n = agents.length;
        const circleRadius = Math.max(6, n * 2.5);

        for (let i = 0; i < n; i++) {
            const agent = agents[i];
            const existing = this.nodeMap.get(agent.id);
            if (existing) {
                // Update color if changed
                existing.color.set(agent.color);
                (existing.mesh.material as THREE.MeshStandardMaterial).color.set(agent.color);
                (existing.mesh.material as THREE.MeshStandardMaterial).emissive.set(agent.color);
                continue;
            }

            const angle = (i / n) * Math.PI * 2;
            const x = Math.cos(angle) * circleRadius;
            const z = Math.sin(angle) * circleRadius;
            const y = (Math.random() - 0.5) * 4; // Slight Y variation for depth

            const color = new THREE.Color(agent.color);
            const baseRadius = 0.8;

            // Main sphere
            const geometry = new THREE.SphereGeometry(baseRadius, 24, 24);
            const material = new THREE.MeshStandardMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.4,
                roughness: 0.3,
                metalness: 0.7,
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            mesh.userData['agentId'] = agent.id;
            this.scene!.add(mesh);

            // Glow sphere (larger, transparent)
            const glowGeometry = new THREE.SphereGeometry(baseRadius * 2, 16, 16);
            const glowMaterial = this.glowMaterialTemplate.clone();
            glowMaterial.color = color.clone();
            const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
            glowMesh.position.copy(mesh.position);
            this.scene!.add(glowMesh);

            // Label sprite
            const label = this.createLabelSprite(agent.name, agent.color);
            label.position.set(x, y + baseRadius + 0.8, z);
            label.scale.set(3, 1.5, 1);
            this.scene!.add(label);

            const node: AgentNode3D = {
                id: agent.id,
                name: agent.name,
                color,
                position: new THREE.Vector3(x, y, z),
                mesh,
                glowMesh,
                label,
                msgCount: 0,
                lastActive: 0,
                pulsePhase: Math.random() * Math.PI * 2,
                baseRadius,
            };

            this.agentNodes.push(node);
            this.nodeMap.set(agent.id, node);
        }

        // Process new messages since last count
        const newMessages = messages.slice(this.lastProcessedMsgCount);
        this.lastProcessedMsgCount = messages.length;
        const newLogEntries: LogEntry[] = [];

        for (const msg of newMessages) {
            const from = this.nodeMap.get(msg.fromAgentId);
            const to = this.nodeMap.get(msg.toAgentId);
            if (!from || !to || from.id === to.id) continue;

            from.msgCount++;
            from.lastActive = msg.timestamp;
            to.lastActive = msg.timestamp;

            // Edge
            const edgeKey = [msg.fromAgentId, msg.toAgentId].sort().join(':');
            let edge = this.edgeMap.get(edgeKey);
            if (!edge) {
                const lineGeometry = new THREE.BufferGeometry();
                this.updateEdgeGeometry(lineGeometry, from.position, to.position);
                const lineMaterial = this.sharedEdgeMaterial.clone();
                const line = new THREE.Line(lineGeometry, lineMaterial);
                this.scene!.add(line);

                edge = {
                    fromId: msg.fromAgentId,
                    toId: msg.toAgentId,
                    count: 0,
                    lastActive: 0,
                    line,
                };
                this.edges.push(edge);
                this.edgeMap.set(edgeKey, edge);
            }
            edge.count++;
            edge.lastActive = msg.timestamp;

            // Brighten edge based on activity
            const edgeMat = edge.line.material as THREE.LineBasicMaterial;
            edgeMat.opacity = Math.min(0.8, 0.3 + edge.count * 0.02);

            // Spawn particle
            this.spawnParticle(from, to);

            // Add to message log
            const content = msg.content
                ? msg.content.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
                : '';
            const preview = content.length > 60 ? content.slice(0, 60) + '...' : content;
            const logEntry: LogEntry = {
                fromAgent: msg.fromAgent ?? from.name,
                toAgent: msg.toAgent ?? to.name,
                content: preview,
                channel: msg.channel,
                timestamp: msg.timestamp,
                color: from.color.getStyle(),
            };
            newLogEntries.push(logEntry);
        }

        if (newLogEntries.length > 0) {
            this.logEntries.update((existing) => {
                const updated = [...newLogEntries, ...existing];
                return updated.slice(0, AgentNetwork3DComponent.MAX_LOG_ENTRIES);
            });
        }
    }

    /**
     * Build a luminous cubic Bezier between two agent positions.
     * Two offset control points give an S-shaped arc distinct from a straight line.
     */
    private makeCubicBezier(from: THREE.Vector3, to: THREE.Vector3): THREE.CubicBezierCurve3 {
        const THREE = this.three;
        const dist = from.distanceTo(to);
        const arcHeight = dist * 0.25;

        // Perpendicular to the edge direction in XZ plane for the S-shape
        const dir = new THREE.Vector3().subVectors(to, from).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(dist * 0.12);

        const c1 = from.clone().lerp(to, 0.33).add(perp).add(new THREE.Vector3(0, arcHeight, 0));
        const c2 = from.clone().lerp(to, 0.67).sub(perp).add(new THREE.Vector3(0, arcHeight * 0.5, 0));

        return new THREE.CubicBezierCurve3(from, c1, c2, to);
    }

    private updateEdgeGeometry(geometry: THREE.BufferGeometry, from: THREE.Vector3, to: THREE.Vector3): void {
        geometry.setFromPoints(this.makeCubicBezier(from, to).getPoints(24));
    }

    private spawnParticle(from: AgentNode3D, to: AgentNode3D): void {
        const THREE = this.three;
        const curve = this.makeCubicBezier(from.position, to.position);
        const material = new THREE.MeshBasicMaterial({
            color: from.color,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(this.sharedParticleGeometry, material);
        mesh.position.copy(from.position);
        this.scene!.add(mesh);

        this.particles.push({
            fromId: from.id,
            toId: to.id,
            progress: 0,
            speed: 0.008 + Math.random() * 0.006,
            color: from.color.clone(),
            mesh,
            opacity: 0.9,
            curve,
        });
    }

    private createLabelSprite(text: string, color: string): THREE.Sprite {
        const THREE = this.three;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.width = 256;
        canvas.height = 64;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Shadow for readability
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 6;
        ctx.fillStyle = color;
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            sizeAttenuation: true,
        });

        return new THREE.Sprite(material);
    }

    /* ── Animation loop ─────────────────────────────────── */

    private startAnimation(): void {
        const THREE = this.three;
        const clock = new THREE.Clock();

        const animate = () => {
            this.animId = requestAnimationFrame(animate);
            const dt = clock.getDelta();
            const time = clock.getElapsedTime();

            // Camera focus animation (double-click to zoom in on an agent)
            if (this.isFocusing && this.focusCamPos && this.focusCamLookAt && this.camera && this.orbitControls) {
                const lerpSpeed = Math.min(dt * 5, 0.1);
                this.camera.position.lerp(this.focusCamPos, lerpSpeed);
                this.orbitControls.target.lerp(this.focusCamLookAt, lerpSpeed);

                // Finish when close enough
                const posErr = this.camera.position.distanceTo(this.focusCamPos);
                const tgtErr = (this.orbitControls.target as THREE.Vector3).distanceTo(this.focusCamLookAt);
                if (posErr < 0.2 && tgtErr < 0.1) {
                    this.camera.position.copy(this.focusCamPos);
                    this.orbitControls.target.copy(this.focusCamLookAt);
                    this.isFocusing = false;
                    this.focusCamPos = null;
                    this.focusCamLookAt = null;
                }
            }

            // OrbitControls handles damping + auto-rotate
            this.orbitControls?.update();
            if (this.orbitControls) {
                this.orbitControls.autoRotate = !this.isDragging && !this.isFocusing;
            }

            // Animate nodes (pulse glow)
            for (const node of this.agentNodes) {
                node.pulsePhase += dt * 1.5;
                const pulse = 0.1 + Math.sin(node.pulsePhase) * 0.06;
                const glowMat = node.glowMesh.material as THREE.MeshBasicMaterial;
                glowMat.opacity = pulse;

                // Hover effect
                const isHovered = node.id === this.hoveredNodeId;
                const isSelected = node.id === this.selectedNodeId;
                const targetScale = isHovered || isSelected ? 1.3 : 1.0;
                const currentScale = node.mesh.scale.x;
                const newScale = currentScale + (targetScale - currentScale) * 0.1;
                node.mesh.scale.setScalar(newScale);
                node.glowMesh.scale.setScalar(newScale);

                // Emissive intensity boost on hover
                const mat = node.mesh.material as THREE.MeshStandardMaterial;
                mat.emissiveIntensity = isHovered || isSelected ? 0.8 : 0.4;
            }

            // Animate particles
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.progress += p.speed;

                if (p.progress >= 1) {
                    // Convert to fading trail instead of removing
                    const trailMat = p.mesh.material as THREE.MeshBasicMaterial;
                    trailMat.opacity = 0.6;
                    p.mesh.scale.setScalar(0.8);
                    this.trails.push({
                        mesh: p.mesh,
                        createdAt: performance.now() / 1000,
                        maxAge: AgentNetwork3DComponent.TRAIL_MAX_AGE,
                    });
                    this.particles.splice(i, 1);
                    continue;
                }

                // Move along pre-computed cubic bezier curve
                p.mesh.position.copy(p.curve.getPoint(p.progress));

                // Fade out near end
                const pMat = p.mesh.material as THREE.MeshBasicMaterial;
                pMat.opacity = p.progress > 0.7 ? (1 - p.progress) / 0.3 * 0.9 : 0.9;
            }

            // Animate trails (fade over time)
            const nowSec = performance.now() / 1000;
            for (let i = this.trails.length - 1; i >= 0; i--) {
                const trail = this.trails[i];
                const age = nowSec - trail.createdAt;
                if (age >= trail.maxAge) {
                    this.scene!.remove(trail.mesh);
                    (trail.mesh.material as THREE.Material).dispose();
                    this.trails.splice(i, 1);
                    continue;
                }
                const remaining = 1 - age / trail.maxAge;
                const trailMat = trail.mesh.material as THREE.MeshBasicMaterial;
                trailMat.opacity = remaining * 0.5;
                trail.mesh.scale.setScalar(0.5 + remaining * 0.3);
            }

            // Rotate starfield slowly + twinkle
            if (this.starField) {
                this.starField.rotation.y = time * 0.02;

                // Twinkle: modulate per-star color brightness
                if (this.starTwinklePhases && this.starBaseOpacities) {
                    const colors = this.starField.geometry.attributes['color'] as THREE.BufferAttribute;
                    const starCount = this.starTwinklePhases.length;
                    for (let i = 0; i < starCount; i++) {
                        const phase = this.starTwinklePhases[i];
                        const base = this.starBaseOpacities[i];
                        // Each star twinkles at its own frequency
                        const twinkle = base * (0.6 + 0.4 * Math.sin(time * (0.8 + phase) + phase * 10));
                        const i3 = i * 3;
                        // Modulate brightness while preserving hue
                        const r = colors.array[i3] as number;
                        const g = colors.array[i3 + 1] as number;
                        const b = colors.array[i3 + 2] as number;
                        const maxC = Math.max(r, g, b, 0.01);
                        (colors.array as Float32Array)[i3] = (r / maxC) * twinkle;
                        (colors.array as Float32Array)[i3 + 1] = (g / maxC) * twinkle;
                        (colors.array as Float32Array)[i3 + 2] = (b / maxC) * twinkle;
                    }
                    colors.needsUpdate = true;
                }
            }

            // Slowly rotate nebula clouds
            if (this.nebulaClouds) {
                this.nebulaClouds.rotation.y = time * 0.005;
            }

            // Render
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
        };

        animate();
    }

    /* ── Pointer handlers (hover tooltips + click selection) */

    private handlePointerDown(e: PointerEvent): void {
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragMoved = false;
        this.isDragging = true;
    }

    private handlePointerMove(e: PointerEvent): void {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        if (this.isDragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
            this.dragMoved = true;
        }

        // Raycasting for hover tooltip
        const canvas = this.canvasRef().nativeElement;
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera!);
        const intersects = this.raycaster.intersectObjects(this.agentNodes.map((n) => n.mesh));

        if (intersects.length > 0) {
            const agentId = intersects[0].object.userData['agentId'] as string;
            this.hoveredNodeId = agentId;
            canvas.style.cursor = 'pointer';

            const node = this.nodeMap.get(agentId);
            if (node) {
                this.tooltip.set({
                    visible: true,
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    name: node.name,
                    color: node.color.getStyle(),
                    msgCount: node.msgCount,
                });
            }
        } else {
            if (this.hoveredNodeId !== null) {
                this.hoveredNodeId = null;
                this.tooltip.set({ visible: false, x: 0, y: 0, name: '', color: '', msgCount: 0 });
            }
            canvas.style.cursor = this.isDragging ? 'grabbing' : 'crosshair';
        }
    }

    private handleDblClick(e: MouseEvent): void {
        if (!this.camera || !this.three) return;
        const THREE = this.three;
        const canvas = this.canvasRef().nativeElement;
        const rect = canvas.getBoundingClientRect();

        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        this.raycaster.setFromCamera(mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.agentNodes.map((n) => n.mesh));

        if (intersects.length === 0) return;

        const agentId = intersects[0].object.userData['agentId'] as string;
        const node = this.nodeMap.get(agentId);
        if (!node) return;

        // Select the agent
        this.selectedNodeId = agentId;
        const agent = this.agents().find((a) => a.id === agentId);
        this.selectedAgent.set(agent ?? null);
        this.agentSelected.emit(agentId);

        // Compute zoom-in camera position: offset toward camera at close distance
        const nodePos = node.mesh.position.clone();
        const camDir = this.camera.position.clone().sub(nodePos).normalize();
        const zoomDist = Math.max(this.orbitControls?.minDistance ?? 10, node.baseRadius * 6 + 8);
        this.focusCamPos = nodePos.clone().add(camDir.multiplyScalar(zoomDist));
        this.focusCamLookAt = nodePos.clone();
        this.isFocusing = true;
    }

    private handlePointerUp(e: PointerEvent): void {
        this.isDragging = false;

        // Only handle left-click without drag as selection
        if (e.button !== 0 || this.dragMoved) return;

        const canvas = this.canvasRef().nativeElement;
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = ((this.dragStartX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((this.dragStartY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera!);
        const intersects = this.raycaster.intersectObjects(this.agentNodes.map((n) => n.mesh));

        if (intersects.length > 0) {
            const agentId = intersects[0].object.userData['agentId'] as string;
            if (this.selectedNodeId === agentId) {
                this.clearSelection();
            } else {
                this.selectedNodeId = agentId;
                const agent = this.agents().find((a) => a.id === agentId);
                this.selectedAgent.set(agent ?? null);
                this.agentSelected.emit(agentId);
            }
        } else {
            this.clearSelection();
        }
    }
}
