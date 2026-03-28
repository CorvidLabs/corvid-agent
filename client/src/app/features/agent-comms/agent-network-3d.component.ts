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
}

@Component({
    selector: 'app-agent-network-3d',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="network-3d" #container>
            <canvas #canvas></canvas>
            @if (selectedAgent()) {
                <div class="network-3d__selected">
                    <span class="network-3d__selected-dot" [style.background]="selectedAgent()!.color"></span>
                    {{ selectedAgent()!.name }}
                    <button class="network-3d__clear" (click)="clearSelection()">x</button>
                </div>
            }
            <div class="network-3d__hint">Drag to orbit &middot; Scroll to zoom</div>
        </div>
    `,
    styles: `
        .network-3d {
            position: relative;
            width: 100%;
            height: 100%;
            min-height: 400px;
            background: #05050a;
            border-radius: var(--radius, 6px);
            border: 1px solid var(--border, #1a1a2e);
            overflow: hidden;
            cursor: grab;
        }
        .network-3d:active { cursor: grabbing; }
        canvas {
            display: block;
            width: 100%;
            height: 100%;
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
            border: 1px solid var(--border-bright, #2a2a3e);
            border-radius: 16px;
            font-size: 0.7rem;
            color: var(--text-primary, #e0e0e0);
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
            color: var(--text-tertiary, #666);
            cursor: pointer;
            font-size: 0.7rem;
            font-family: inherit;
            padding: 0 2px;
            line-height: 1;
        }
        .network-3d__clear:hover { color: var(--text-primary, #e0e0e0); }
        .network-3d__hint {
            position: absolute;
            bottom: 10px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 0.6rem;
            color: var(--text-tertiary, #555);
            letter-spacing: 0.05em;
            opacity: 0.6;
            pointer-events: none;
            z-index: 10;
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

    /* ── Three.js core ──────────────────────────────────── */
    private renderer: THREE.WebGLRenderer | null = null;
    private scene: THREE.Scene | null = null;
    private camera: THREE.PerspectiveCamera | null = null;
    private animId = 0;
    private resizeObserver: ResizeObserver | null = null;

    /* ── Scene objects ──────────────────────────────────── */
    private agentNodes: AgentNode3D[] = [];
    private nodeMap = new Map<string, AgentNode3D>();
    private edges: Edge3D[] = [];
    private edgeMap = new Map<string, Edge3D>();
    private particles: Particle3D[] = [];
    private starField: THREE.Points | null = null;

    /* ── Orbit control state ────────────────────────────── */
    private isDragging = false;
    private lastMouseX = 0;
    private lastMouseY = 0;
    private orbitTheta = 0;
    private orbitPhi = Math.PI / 4;
    private orbitRadius = 30;
    private targetTheta = 0;
    private targetPhi = Math.PI / 4;
    private targetRadius = 30;

    /* ── Raycasting ─────────────────────────────────────── */
    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private hoveredNodeId: string | null = null;
    private selectedNodeId: string | null = null;
    private lastProcessedMsgCount = 0;

    /* ── Reusable materials ─────────────────────────────── */
    private static readonly GLOW_MATERIAL = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
        side: THREE.FrontSide,
    });

    private static readonly EDGE_MATERIAL = new THREE.LineBasicMaterial({
        color: 0x1a2a3e,
        transparent: true,
        opacity: 0.4,
    });

    private static readonly PARTICLE_GEOMETRY = new THREE.SphereGeometry(0.12, 6, 6);

    /* ── Event handlers bound once ──────────────────────── */
    private onMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
    private onMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
    private onMouseUp = () => this.handleMouseUp();
    private onWheel = (e: WheelEvent) => this.handleWheel(e);
    private onClick = (e: MouseEvent) => this.handleClick(e);
    private onMouseLeave = () => { this.isDragging = false; };

    constructor() {
        afterNextRender(() => {
            this.initScene();
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
        const canvas = this.canvasRef()?.nativeElement;
        if (canvas) {
            canvas.removeEventListener('mousedown', this.onMouseDown);
            canvas.removeEventListener('mousemove', this.onMouseMove);
            canvas.removeEventListener('mouseup', this.onMouseUp);
            canvas.removeEventListener('wheel', this.onWheel);
            canvas.removeEventListener('click', this.onClick);
            canvas.removeEventListener('mouseleave', this.onMouseLeave);
        }
        // Dispose Three.js resources
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
        this.starField?.geometry.dispose();
        (this.starField?.material as THREE.Material)?.dispose();
        this.renderer?.dispose();
    }

    protected clearSelection(): void {
        this.selectedNodeId = null;
        this.selectedAgent.set(null);
        this.agentSelected.emit('');
    }

    /* ── Scene initialization ───────────────────────────── */

    private initScene(): void {
        const canvas = this.canvasRef().nativeElement;
        const container = this.containerRef().nativeElement;
        const rect = container.getBoundingClientRect();

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
        this.updateCameraPosition();

        // Lights
        const ambientLight = new THREE.AmbientLight(0x1a1a2e, 0.8);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0x00e5ff, 1.5, 80);
        pointLight.position.set(0, 15, 0);
        this.scene.add(pointLight);

        const fillLight = new THREE.PointLight(0xa78bfa, 0.6, 60);
        fillLight.position.set(-10, -5, 10);
        this.scene.add(fillLight);

        // Starfield
        this.createStarfield();

        // Events
        canvas.addEventListener('mousedown', this.onMouseDown);
        canvas.addEventListener('mousemove', this.onMouseMove);
        canvas.addEventListener('mouseup', this.onMouseUp);
        canvas.addEventListener('wheel', this.onWheel, { passive: false });
        canvas.addEventListener('click', this.onClick);
        canvas.addEventListener('mouseleave', this.onMouseLeave);

        // Touch events for mobile
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this.isDragging = true;
                this.lastMouseX = e.touches[0].clientX;
                this.lastMouseY = e.touches[0].clientY;
            }
        }, { passive: true });
        canvas.addEventListener('touchmove', (e) => {
            if (this.isDragging && e.touches.length === 1) {
                const dx = e.touches[0].clientX - this.lastMouseX;
                const dy = e.touches[0].clientY - this.lastMouseY;
                this.targetTheta -= dx * 0.005;
                this.targetPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.targetPhi - dy * 0.005));
                this.lastMouseX = e.touches[0].clientX;
                this.lastMouseY = e.touches[0].clientY;
            }
        }, { passive: true });
        canvas.addEventListener('touchend', () => { this.isDragging = false; }, { passive: true });

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
        const starCount = 600;
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount; i++) {
            const i3 = i * 3;
            // Distribute in a large sphere
            const r = 50 + Math.random() * 50;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            positions[i3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i3 + 2] = r * Math.cos(phi);

            // Slight color variation
            const brightness = 0.3 + Math.random() * 0.7;
            colors[i3] = brightness * (0.7 + Math.random() * 0.3);
            colors[i3 + 1] = brightness * (0.7 + Math.random() * 0.3);
            colors[i3 + 2] = brightness;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.15,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            sizeAttenuation: true,
            depthWrite: false,
        });

        this.starField = new THREE.Points(geometry, material);
        this.scene!.add(this.starField);
    }

    /* ── Graph building ─────────────────────────────────── */

    private rebuildGraph(agents: VisAgent[], messages: VisMessage[]): void {
        if (!this.scene) return;

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
            const glowMaterial = AgentNetwork3DComponent.GLOW_MATERIAL.clone();
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
                const lineMaterial = AgentNetwork3DComponent.EDGE_MATERIAL.clone();
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
        }
    }

    private updateEdgeGeometry(geometry: THREE.BufferGeometry, from: THREE.Vector3, to: THREE.Vector3): void {
        // Create a curved line between two points (via midpoint lifted up)
        const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
        mid.y += from.distanceTo(to) * 0.15; // Arc upward

        const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
        const points = curve.getPoints(20);
        geometry.setFromPoints(points);
    }

    private spawnParticle(from: AgentNode3D, to: AgentNode3D): void {
        const material = new THREE.MeshBasicMaterial({
            color: from.color,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(AgentNetwork3DComponent.PARTICLE_GEOMETRY, material);
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
        });
    }

    private createLabelSprite(text: string, color: string): THREE.Sprite {
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
        const clock = new THREE.Clock();

        const animate = () => {
            this.animId = requestAnimationFrame(animate);
            const dt = clock.getDelta();
            const time = clock.getElapsedTime();

            // Smooth orbit interpolation
            this.orbitTheta += (this.targetTheta - this.orbitTheta) * 0.08;
            this.orbitPhi += (this.targetPhi - this.orbitPhi) * 0.08;
            this.orbitRadius += (this.targetRadius - this.orbitRadius) * 0.08;

            // Slow auto-rotation when not dragging
            if (!this.isDragging) {
                this.targetTheta += 0.0008;
            }

            this.updateCameraPosition();

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
                    // Remove completed particle
                    this.scene!.remove(p.mesh);
                    (p.mesh.material as THREE.Material).dispose();
                    this.particles.splice(i, 1);
                    continue;
                }

                // Move along curve between from and to nodes
                const from = this.nodeMap.get(p.fromId);
                const to = this.nodeMap.get(p.toId);
                if (from && to) {
                    const mid = new THREE.Vector3().addVectors(from.position, to.position).multiplyScalar(0.5);
                    mid.y += from.position.distanceTo(to.position) * 0.15;

                    const curve = new THREE.QuadraticBezierCurve3(from.position, mid, to.position);
                    const point = curve.getPoint(p.progress);
                    p.mesh.position.copy(point);
                }

                // Fade out near end
                const pMat = p.mesh.material as THREE.MeshBasicMaterial;
                pMat.opacity = p.progress > 0.7 ? (1 - p.progress) / 0.3 * 0.9 : 0.9;
            }

            // Rotate starfield slowly
            if (this.starField) {
                this.starField.rotation.y = time * 0.02;
            }

            // Render
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
        };

        animate();
    }

    private updateCameraPosition(): void {
        if (!this.camera) return;
        const x = this.orbitRadius * Math.sin(this.orbitPhi) * Math.cos(this.orbitTheta);
        const y = this.orbitRadius * Math.cos(this.orbitPhi);
        const z = this.orbitRadius * Math.sin(this.orbitPhi) * Math.sin(this.orbitTheta);
        this.camera.position.set(x, y, z);
        this.camera.lookAt(0, 0, 0);
    }

    /* ── Event handlers ─────────────────────────────────── */

    private handleMouseDown(e: MouseEvent): void {
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }

    private handleMouseMove(e: MouseEvent): void {
        if (this.isDragging) {
            const dx = e.clientX - this.lastMouseX;
            const dy = e.clientY - this.lastMouseY;
            this.targetTheta -= dx * 0.005;
            this.targetPhi = Math.max(0.1, Math.min(Math.PI - 0.1, this.targetPhi - dy * 0.005));
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        }

        // Raycasting for hover
        const canvas = this.canvasRef().nativeElement;
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera!);
        const meshes = this.agentNodes.map((n) => n.mesh);
        const intersects = this.raycaster.intersectObjects(meshes);

        if (intersects.length > 0) {
            this.hoveredNodeId = intersects[0].object.userData['agentId'] as string;
            canvas.style.cursor = 'pointer';
        } else {
            this.hoveredNodeId = null;
            canvas.style.cursor = this.isDragging ? 'grabbing' : 'grab';
        }
    }

    private handleMouseUp(): void {
        this.isDragging = false;
    }

    private handleWheel(e: WheelEvent): void {
        e.preventDefault();
        this.targetRadius = Math.max(10, Math.min(80, this.targetRadius + e.deltaY * 0.03));
    }

    private handleClick(e: MouseEvent): void {
        if (!this.camera) return;

        const canvas = this.canvasRef().nativeElement;
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const meshes = this.agentNodes.map((n) => n.mesh);
        const intersects = this.raycaster.intersectObjects(meshes);

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
