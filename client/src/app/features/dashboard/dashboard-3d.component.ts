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

export interface DashboardAgentNode {
    agent: { id: string; name: string; model?: string; provider?: string };
    balance: number;
    runningSessions: number;
    lastActive: string | null;
    reputationScore: number | null;
    capabilities: string[];
    recentTasksCompleted: number;
    recentTasksFailed: number;
}

interface AgentMesh {
    id: string;
    name: string;
    health: 'green' | 'amber' | 'red' | 'grey';
    color: THREE.Color;
    position: THREE.Vector3;
    sphere: THREE.Mesh;
    glow: THREE.Mesh;
    label: THREE.Sprite;
    ring: THREE.Mesh | null;
    pulsePhase: number;
    runningSessions: number;
}

interface TooltipState {
    visible: boolean;
    x: number;
    y: number;
    name: string;
    color: string;
    running: number;
    rep: number | null;
}

const HEALTH_COLORS: Record<string, number> = {
    green: 0x00e5a0,
    amber: 0xf59e0b,
    red:   0xef4444,
    grey:  0x6b7280,
};

@Component({
    selector: 'app-dashboard-3d',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="dash3d" #container>
            <canvas #canvas></canvas>
            @if (tooltip().visible) {
                <div class="dash3d__tooltip"
                     [style.left.px]="tooltip().x + 14"
                     [style.top.px]="tooltip().y - 10">
                    <span class="dash3d__tip-dot" [style.background]="tooltip().color"></span>
                    <span class="dash3d__tip-name">{{ tooltip().name }}</span>
                    @if (tooltip().running > 0) {
                        <span class="dash3d__tip-badge">{{ tooltip().running }} running</span>
                    }
                    @if (tooltip().rep !== null) {
                        <span class="dash3d__tip-rep">Rep {{ tooltip().rep }}</span>
                    }
                </div>
            }
            <div class="dash3d__legend">
                <span class="dash3d__legend-item" data-h="green">Active</span>
                <span class="dash3d__legend-item" data-h="amber">Idle</span>
                <span class="dash3d__legend-item" data-h="red">Offline</span>
                <span class="dash3d__legend-item" data-h="grey">No data</span>
            </div>
            <div class="dash3d__hint">Drag to orbit &middot; Scroll to zoom &middot; Click to open agent</div>
        </div>
    `,
    styles: `
        .dash3d {
            position: relative;
            width: 100%;
            height: 600px;
            background: #04040c;
            border-radius: var(--radius);
            border: 1px solid var(--border);
            overflow: hidden;
            cursor: crosshair;
        }
        canvas { display: block; width: 100%; height: 100%; }

        .dash3d__tooltip {
            position: absolute;
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 4px 9px;
            background: rgba(4,4,12,0.92);
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
        .dash3d__tip-dot {
            width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
        }
        .dash3d__tip-name { font-weight: 600; }
        .dash3d__tip-badge, .dash3d__tip-rep {
            color: var(--text-tertiary); font-size: 0.6rem;
        }

        .dash3d__legend {
            position: absolute;
            top: 12px;
            right: 12px;
            display: flex;
            flex-direction: column;
            gap: 4px;
            background: rgba(4,4,12,0.75);
            border: 1px solid var(--border-bright);
            border-radius: 8px;
            padding: 8px 12px;
            backdrop-filter: blur(4px);
            z-index: 10;
        }
        .dash3d__legend-item {
            font-size: 0.6rem;
            color: var(--text-secondary);
            display: flex;
            align-items: center;
            gap: 5px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }
        .dash3d__legend-item::before {
            content: '';
            display: inline-block;
            width: 7px; height: 7px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .dash3d__legend-item[data-h="green"]::before  { background: #00e5a0; }
        .dash3d__legend-item[data-h="amber"]::before  { background: #f59e0b; }
        .dash3d__legend-item[data-h="red"]::before    { background: #ef4444; }
        .dash3d__legend-item[data-h="grey"]::before   { background: #6b7280; }

        .dash3d__hint {
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
    `,
})
export class Dashboard3dComponent implements OnDestroy {
    readonly agentSummaries = input<DashboardAgentNode[]>([]);
    readonly agentClick = output<string>();

    private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
    private readonly containerRef = viewChild.required<ElementRef<HTMLElement>>('container');

    protected readonly tooltip = signal<TooltipState>({
        visible: false, x: 0, y: 0, name: '', color: '', running: 0, rep: null,
    });

    private three!: typeof import('three');
    private renderer: THREE.WebGLRenderer | null = null;
    private scene: THREE.Scene | null = null;
    private camera: THREE.PerspectiveCamera | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private orbitControls: any = null;
    private animId = 0;
    private resizeObserver: ResizeObserver | null = null;
    private agentMeshes: AgentMesh[] = [];
    private meshMap = new Map<string, AgentMesh>();
    private raycaster!: THREE.Raycaster;
    private mouse!: THREE.Vector2;
    private clock!: THREE.Clock;
    private stars: THREE.Points | null = null;
    private isDragging = false;
    private dragStartX = 0;
    private dragStartY = 0;

    private readonly onPointerDown = (e: PointerEvent) => {
        this.isDragging = false;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
    };
    private readonly onPointerMove = (e: PointerEvent) => {
        if (Math.abs(e.clientX - this.dragStartX) > 4 || Math.abs(e.clientY - this.dragStartY) > 4) {
            this.isDragging = true;
        }
        this.updateTooltip(e);
    };
    private readonly onPointerUp = (e: PointerEvent) => {
        if (!this.isDragging) this.handleClick(e);
    };

    constructor() {
        afterNextRender(async () => {
            const [THREE, { OrbitControls }] = await Promise.all([
                import('three'),
                import('three/addons/controls/OrbitControls.js'),
            ]);
            this.three = THREE;
            this.raycaster = new THREE.Raycaster();
            this.mouse = new THREE.Vector2();
            this.clock = new THREE.Clock();
            this.initScene(OrbitControls);
            this.rebuildAgents(this.agentSummaries());
            this.startAnimation();
        });

        effect(() => {
            const summaries = this.agentSummaries();
            if (this.scene) this.rebuildAgents(summaries);
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
        }
        this.renderer?.dispose();
        this.renderer = null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private initScene(OrbitControls: any): void {
        const THREE = this.three;
        const canvas = this.canvasRef().nativeElement;
        const container = this.containerRef().nativeElement;

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x04040c, 1);

        const w = container.clientWidth;
        const h = container.clientHeight;
        this.renderer.setSize(w, h);

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x04040c, 0.015);

        this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 500);
        this.camera.position.set(0, 18, 36);
        this.camera.lookAt(0, 0, 0);

        this.orbitControls = new OrbitControls(this.camera, canvas);
        this.orbitControls.enableDamping = true;
        this.orbitControls.dampingFactor = 0.08;
        this.orbitControls.minDistance = 8;
        this.orbitControls.maxDistance = 90;
        this.orbitControls.maxPolarAngle = Math.PI * 0.75;

        // Lights
        const ambient = new THREE.AmbientLight(0x1a1a2e, 3);
        this.scene.add(ambient);
        const point1 = new THREE.PointLight(0x00e5a0, 2, 80);
        point1.position.set(0, 20, 0);
        this.scene.add(point1);
        const point2 = new THREE.PointLight(0x7c3aed, 1.5, 60);
        point2.position.set(-20, 5, -15);
        this.scene.add(point2);

        // Grid floor
        const grid = new THREE.GridHelper(60, 30, 0x1a1a2e, 0x0f0f1a);
        grid.position.y = -4;
        this.scene.add(grid);

        // Stars
        this.buildStars();

        // Events
        canvas.addEventListener('pointerdown', this.onPointerDown);
        canvas.addEventListener('pointermove', this.onPointerMove);
        canvas.addEventListener('pointerup', this.onPointerUp);

        // Resize
        this.resizeObserver = new ResizeObserver(() => {
            const w2 = container.clientWidth;
            const h2 = container.clientHeight;
            this.renderer?.setSize(w2, h2);
            if (this.camera) {
                this.camera.aspect = w2 / h2;
                this.camera.updateProjectionMatrix();
            }
        });
        this.resizeObserver.observe(container);
    }

    private buildStars(): void {
        const THREE = this.three;
        const count = 800;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count * 3; i++) {
            pos[i] = (Math.random() - 0.5) * 200;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.2, sizeAttenuation: true, transparent: true, opacity: 0.5 });
        this.stars = new THREE.Points(geo, mat);
        this.scene!.add(this.stars);
    }

    private makeLabel(name: string, color: THREE.Color): THREE.Sprite {
        const THREE = this.three;
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, 256, 64);
        ctx.font = 'bold 20px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `#${color.getHexString()}`;
        ctx.globalAlpha = 0.9;
        ctx.fillText(name.length > 12 ? name.slice(0, 11) + '…' : name, 128, 32);
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(4, 1, 1);
        return sprite;
    }

    private agentHealth(s: DashboardAgentNode): 'green' | 'amber' | 'red' | 'grey' {
        const total = s.recentTasksCompleted + s.recentTasksFailed;
        if (total >= 3 && s.recentTasksFailed / total > 0.5) return 'red';
        if (s.runningSessions > 0) return 'green';
        if (!s.lastActive) return 'grey';
        const hoursAgo = (Date.now() - new Date(s.lastActive).getTime()) / 3600000;
        if (hoursAgo < 1) return 'green';
        if (hoursAgo < 24) return 'amber';
        return 'red';
    }

    private rebuildAgents(summaries: DashboardAgentNode[]): void {
        if (!this.scene) return;
        const THREE = this.three;

        // Remove old meshes
        for (const am of this.agentMeshes) {
            this.scene.remove(am.sphere, am.glow, am.label);
            if (am.ring) this.scene.remove(am.ring);
            (am.sphere.geometry as THREE.BufferGeometry).dispose();
            (am.glow.geometry as THREE.BufferGeometry).dispose();
        }
        this.agentMeshes = [];
        this.meshMap.clear();

        if (summaries.length === 0) return;

        const radius = Math.max(8, summaries.length * 1.4);
        const angleStep = (Math.PI * 2) / summaries.length;

        summaries.forEach((s, i) => {
            const health = this.agentHealth(s);
            const hexColor = HEALTH_COLORS[health];
            const color = new THREE.Color(hexColor);

            const angle = i * angleStep;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const pos = new THREE.Vector3(x, 0, z);

            // Sphere size: slightly larger for agents with rep score
            const sphereR = 0.7 + Math.min((s.reputationScore ?? 0) / 200, 0.5);
            const geo = new THREE.SphereGeometry(sphereR, 24, 24);
            const mat = new THREE.MeshStandardMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.4,
                roughness: 0.3,
                metalness: 0.6,
            });
            const sphere = new THREE.Mesh(geo, mat);
            sphere.position.copy(pos);
            sphere.userData['agentId'] = s.agent.id;
            this.scene!.add(sphere);

            // Glow halo
            const glowGeo = new THREE.SphereGeometry(sphereR * 1.6, 16, 16);
            const glowMat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.12,
                depthWrite: false,
                side: THREE.BackSide,
            });
            const glow = new THREE.Mesh(glowGeo, glowMat);
            glow.position.copy(pos);
            this.scene!.add(glow);

            // Label
            const label = this.makeLabel(s.agent.name, color);
            label.position.set(x, sphereR + 1.4, z);
            this.scene!.add(label);

            // Orbit ring for active agents
            let ring: THREE.Mesh | null = null;
            if (s.runningSessions > 0) {
                const ringGeo = new THREE.TorusGeometry(sphereR * 1.9, 0.05, 8, 48);
                const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 });
                ring = new THREE.Mesh(ringGeo, ringMat);
                ring.position.copy(pos);
                ring.rotation.x = Math.PI / 2;
                this.scene!.add(ring);
            }

            const am: AgentMesh = {
                id: s.agent.id,
                name: s.agent.name,
                health,
                color,
                position: pos,
                sphere,
                glow,
                label,
                ring,
                pulsePhase: Math.random() * Math.PI * 2,
                runningSessions: s.runningSessions,
            };
            this.agentMeshes.push(am);
            this.meshMap.set(s.agent.id, am);
        });

        // Draw connecting lines between all agents (ambient network feel)
        if (summaries.length > 1) {
            const lineMat = new THREE.LineBasicMaterial({ color: 0x1a1a3a, transparent: true, opacity: 0.3 });
            for (let i = 0; i < this.agentMeshes.length; i++) {
                const next = this.agentMeshes[(i + 1) % this.agentMeshes.length];
                const cur = this.agentMeshes[i];
                const pts = [cur.position.clone(), next.position.clone()];
                const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
                const line = new THREE.Line(lineGeo, lineMat);
                this.scene!.add(line);
            }
        }
    }

    private startAnimation(): void {
        const animate = () => {
            this.animId = requestAnimationFrame(animate);
            this.orbitControls?.update();
            this.animateAgents();
            if (this.stars) this.stars.rotation.y += 0.0001;
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
        };
        animate();
    }

    private animateAgents(): void {
        const t = this.clock?.getElapsedTime() ?? 0;
        for (const am of this.agentMeshes) {
            const pulse = 0.5 + 0.5 * Math.sin(t * 1.8 + am.pulsePhase);
            const mat = am.sphere.material as THREE.MeshStandardMaterial;
            if (am.health === 'green') {
                mat.emissiveIntensity = 0.3 + 0.4 * pulse;
            }
            const glowMat = am.glow.material as THREE.MeshBasicMaterial;
            glowMat.opacity = am.health === 'green' ? 0.08 + 0.12 * pulse : 0.06;

            if (am.ring) {
                am.ring.rotation.z = t * 0.8 + am.pulsePhase;
            }
        }
    }

    private getNdcFromEvent(e: PointerEvent): THREE.Vector2 {
        const rect = this.canvasRef().nativeElement.getBoundingClientRect();
        return new this.three.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
    }

    private raycastMeshes(ndc: THREE.Vector2): AgentMesh | null {
        if (!this.camera) return null;
        this.raycaster.setFromCamera(ndc, this.camera);
        const spheres = this.agentMeshes.map((am) => am.sphere);
        const hits = this.raycaster.intersectObjects(spheres);
        if (hits.length === 0) return null;
        const id = hits[0].object.userData['agentId'] as string;
        return this.meshMap.get(id) ?? null;
    }

    private updateTooltip(e: PointerEvent): void {
        const ndc = this.getNdcFromEvent(e);
        const hit = this.raycastMeshes(ndc);
        if (hit) {
            const s = this.agentSummaries().find((a) => a.agent.id === hit.id);
            this.tooltip.set({
                visible: true,
                x: e.offsetX,
                y: e.offsetY,
                name: hit.name,
                color: `#${hit.color.getHexString()}`,
                running: s?.runningSessions ?? 0,
                rep: s?.reputationScore ?? null,
            });
        } else {
            this.tooltip.set({ visible: false, x: 0, y: 0, name: '', color: '', running: 0, rep: null });
        }
    }

    private handleClick(e: PointerEvent): void {
        const ndc = this.getNdcFromEvent(e);
        const hit = this.raycastMeshes(ndc);
        if (hit) this.agentClick.emit(hit.id);
    }
}
