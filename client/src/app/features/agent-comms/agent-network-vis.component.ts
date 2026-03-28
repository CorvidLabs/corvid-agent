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

/* ── Data types ──────────────────────────────────────────── */

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

/* ── Internal types ──────────────────────────────────────── */

interface VisNode {
    id: string;
    name: string;
    color: string;
    x: number;
    y: number;
    radius: number;
    msgCount: number;
    lastActive: number;
    pulsePhase: number;
}

interface VisEdge {
    fromId: string;
    toId: string;
    count: number;
    lastActive: number;
}

interface Particle {
    fromId: string;
    toId: string;
    progress: number;
    speed: number;
    color: string;
    size: number;
    opacity: number;
}

interface Star {
    x: number;
    y: number;
    size: number;
    baseOpacity: number;
    twinkleSpeed: number;
    phase: number;
}

interface ImpactRing {
    x: number;
    y: number;
    color: string;
    radius: number;
    maxRadius: number;
    opacity: number;
}

@Component({
    selector: 'app-agent-network-vis',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="network-vis" #container>
            <canvas #canvas></canvas>
            @if (selectedAgent()) {
                <div class="network-vis__selected">
                    <span class="network-vis__selected-dot" [style.background]="selectedAgent()!.color"></span>
                    {{ selectedAgent()!.name }}
                    <button class="network-vis__clear" (click)="clearSelection()">x</button>
                </div>
            }
        </div>
    `,
    styles: `
        .network-vis {
            position: relative;
            width: 100%;
            height: 100%;
            min-height: 300px;
            background: var(--bg-deep, #0a0a0f);
            border-radius: var(--radius, 6px);
            border: 1px solid var(--border, #1a1a2e);
            overflow: hidden;
        }
        canvas {
            display: block;
            width: 100%;
            height: 100%;
        }
        .network-vis__selected {
            position: absolute;
            top: 12px;
            left: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            background: rgba(10, 10, 15, 0.85);
            border: 1px solid var(--border-bright, #2a2a3e);
            border-radius: 16px;
            font-size: 0.7rem;
            color: var(--text-primary, #e0e0e0);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            backdrop-filter: blur(4px);
        }
        .network-vis__selected-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .network-vis__clear {
            background: none;
            border: none;
            color: var(--text-tertiary, #666);
            cursor: pointer;
            font-size: 0.7rem;
            font-family: inherit;
            padding: 0 2px;
            line-height: 1;
        }
        .network-vis__clear:hover {
            color: var(--text-primary, #e0e0e0);
        }

        @media (prefers-reduced-motion: reduce) {
            canvas { display: none; }
            .network-vis::after {
                content: 'Agent network visualization (animations disabled)';
                position: absolute; inset: 0;
                display: flex; align-items: center; justify-content: center;
                color: var(--text-tertiary);
                font-size: 0.8rem;
            }
        }
    `,
})
export class AgentNetworkVisComponent implements OnDestroy {
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

    private ctx: CanvasRenderingContext2D | null = null;
    private animId = 0;
    private resizeObserver: ResizeObserver | null = null;
    private width = 0;
    private height = 0;
    private dpr = 1;

    private nodes: VisNode[] = [];
    private nodeMap = new Map<string, VisNode>();
    private edges: VisEdge[] = [];
    private edgeMap = new Map<string, VisEdge>();
    private particles: Particle[] = [];
    private stars: Star[] = [];
    private impacts: ImpactRing[] = [];
    private hoveredNodeId: string | null = null;
    private selectedNodeId: string | null = null;
    private lastProcessedMsgCount = 0;
    private mouseX = -1;
    private mouseY = -1;

    private onMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
    private onClick = (e: MouseEvent) => this.handleClick(e);

    constructor() {
        afterNextRender(() => {
            this.setupCanvas();
            this.startAnimation();
        });

        // React to input changes
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
            canvas.removeEventListener('mousemove', this.onMouseMove);
            canvas.removeEventListener('click', this.onClick);
            canvas.removeEventListener('mouseleave', this.handleMouseLeave);
        }
    }

    protected clearSelection(): void {
        this.selectedNodeId = null;
        this.selectedAgent.set(null);
        this.agentSelected.emit('');
    }

    /* ── Canvas setup ───────────────────────────────────── */

    private setupCanvas(): void {
        const canvas = this.canvasRef().nativeElement;
        const container = this.containerRef().nativeElement;
        this.ctx = canvas.getContext('2d');
        this.dpr = window.devicePixelRatio || 1;

        this.resizeCanvas(container.clientWidth, container.clientHeight);

        this.resizeObserver = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (rect) this.resizeCanvas(rect.width, rect.height);
        });
        this.resizeObserver.observe(container);

        canvas.addEventListener('mousemove', this.onMouseMove);
        canvas.addEventListener('click', this.onClick);
        canvas.addEventListener('mouseleave', this.handleMouseLeave);

        this.initStars();
    }

    private resizeCanvas(w: number, h: number): void {
        this.width = w;
        this.height = h;
        const canvas = this.canvasRef().nativeElement;
        canvas.width = w * this.dpr;
        canvas.height = h * this.dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        this.ctx?.scale(this.dpr, this.dpr);
        this.layoutNodes();
        this.initStars();
    }

    /* ── Star field ─────────────────────────────────────── */

    private initStars(): void {
        const count = Math.min(Math.floor((this.width * this.height) / 3000), 200);
        this.stars = [];
        for (let i = 0; i < count; i++) {
            this.stars.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                size: Math.random() * 1.5 + 0.3,
                baseOpacity: Math.random() * 0.4 + 0.1,
                twinkleSpeed: Math.random() * 0.002 + 0.001,
                phase: Math.random() * Math.PI * 2,
            });
        }
    }

    /* ── Graph building ─────────────────────────────────── */

    private rebuildGraph(agents: VisAgent[], msgs: VisMessage[]): void {
        // Build nodes
        this.nodeMap.clear();
        for (const agent of agents) {
            const existing = this.nodes.find((n) => n.id === agent.id);
            const node: VisNode = {
                id: agent.id,
                name: agent.name,
                color: agent.color || '#00e5ff',
                x: existing?.x ?? 0,
                y: existing?.y ?? 0,
                radius: 18,
                msgCount: 0,
                lastActive: 0,
                pulsePhase: existing?.pulsePhase ?? Math.random() * Math.PI * 2,
            };
            this.nodeMap.set(agent.id, node);
        }

        // Build edges from messages
        this.edgeMap.clear();
        for (const msg of msgs) {
            const key = [msg.fromAgentId, msg.toAgentId].sort().join('::');
            const edge = this.edgeMap.get(key) ?? {
                fromId: msg.fromAgentId,
                toId: msg.toAgentId,
                count: 0,
                lastActive: 0,
            };
            edge.count++;
            edge.lastActive = Math.max(edge.lastActive, msg.timestamp);
            this.edgeMap.set(key, edge);

            // Update node message counts
            const fromNode = this.nodeMap.get(msg.fromAgentId);
            const toNode = this.nodeMap.get(msg.toAgentId);
            if (fromNode) {
                fromNode.msgCount++;
                fromNode.lastActive = Math.max(fromNode.lastActive, msg.timestamp);
            }
            if (toNode) {
                toNode.msgCount++;
                toNode.lastActive = Math.max(toNode.lastActive, msg.timestamp);
            }
        }

        this.nodes = Array.from(this.nodeMap.values());
        this.edges = Array.from(this.edgeMap.values());
        this.layoutNodes();

        // Spawn particles for new messages
        if (msgs.length > this.lastProcessedMsgCount) {
            const newMsgs = msgs.slice(this.lastProcessedMsgCount);
            for (const msg of newMsgs) {
                this.spawnParticle(msg);
            }
            this.lastProcessedMsgCount = msgs.length;
        }
    }

    private layoutNodes(): void {
        if (this.nodes.length === 0 || this.width === 0) return;

        const cx = this.width / 2;
        const cy = this.height / 2;
        const padding = 60;
        const radius = Math.min(cx, cy) - padding;

        if (this.nodes.length === 1) {
            this.nodes[0].x = cx;
            this.nodes[0].y = cy;
            return;
        }

        const angleStep = (Math.PI * 2) / this.nodes.length;
        const startAngle = -Math.PI / 2; // Start from top

        for (let i = 0; i < this.nodes.length; i++) {
            const angle = startAngle + i * angleStep;
            this.nodes[i].x = cx + Math.cos(angle) * radius;
            this.nodes[i].y = cy + Math.sin(angle) * radius;
        }

        // Scale node radius based on message count
        const maxMsgs = Math.max(1, ...this.nodes.map((n) => n.msgCount));
        for (const node of this.nodes) {
            node.radius = 14 + (node.msgCount / maxMsgs) * 14;
        }
    }

    /* ── Particles ──────────────────────────────────────── */

    private spawnParticle(msg: VisMessage): void {
        if (this.particles.length > 50) return; // cap particles

        const fromNode = this.nodeMap.get(msg.fromAgentId);
        if (!fromNode) return;

        const color =
            msg.status === 'failed' ? '#ff4444' :
            msg.status === 'processing' ? '#ffa040' :
            fromNode.color;

        this.particles.push({
            fromId: msg.fromAgentId,
            toId: msg.toAgentId,
            progress: 0,
            speed: msg.status === 'processing' ? 0.005 : 0.012 + Math.random() * 0.008,
            color,
            size: 3 + Math.random() * 2,
            opacity: 1,
        });
    }

    /* ── Animation loop ─────────────────────────────────── */

    private startAnimation(): void {
        const animate = (time: number) => {
            this.animId = requestAnimationFrame(animate);
            this.render(time);
        };
        this.animId = requestAnimationFrame(animate);
    }

    private render(time: number): void {
        const ctx = this.ctx;
        if (!ctx) return;

        ctx.save();
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        // Clear
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, this.width, this.height);

        // Stars
        this.renderStars(ctx, time);

        // Edges
        this.renderEdges(ctx, time);

        // Particles
        this.updateAndRenderParticles(ctx);

        // Impact rings
        this.updateAndRenderImpacts(ctx);

        // Nodes
        this.renderNodes(ctx, time);

        ctx.restore();
    }

    private renderStars(ctx: CanvasRenderingContext2D, time: number): void {
        for (const star of this.stars) {
            const twinkle = Math.sin(time * star.twinkleSpeed + star.phase);
            const opacity = star.baseOpacity + twinkle * 0.15;
            ctx.fillStyle = `rgba(180, 200, 255, ${Math.max(0, opacity)})`;
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    private renderEdges(ctx: CanvasRenderingContext2D, time: number): void {
        const maxCount = Math.max(1, ...this.edges.map((e) => e.count));

        for (const edge of this.edges) {
            const fromNode = this.nodeMap.get(edge.fromId);
            const toNode = this.nodeMap.get(edge.toId);
            if (!fromNode || !toNode) continue;

            const isSelected =
                this.selectedNodeId === edge.fromId ||
                this.selectedNodeId === edge.toId;
            const isHovered =
                this.hoveredNodeId === edge.fromId ||
                this.hoveredNodeId === edge.toId;

            const baseOpacity = 0.06 + (edge.count / maxCount) * 0.14;
            const opacity = isSelected ? 0.4 : isHovered ? 0.25 : baseOpacity;

            // Subtle curve for bidirectional feel
            const mx = (fromNode.x + toNode.x) / 2;
            const my = (fromNode.y + toNode.y) / 2;
            const dx = toNode.x - fromNode.x;
            const dy = toNode.y - fromNode.y;
            const offsetX = -dy * 0.05;
            const offsetY = dx * 0.05;

            ctx.strokeStyle = `rgba(100, 140, 200, ${opacity})`;
            ctx.lineWidth = 1 + (edge.count / maxCount) * 1.5;
            ctx.beginPath();
            ctx.moveTo(fromNode.x, fromNode.y);
            ctx.quadraticCurveTo(mx + offsetX, my + offsetY, toNode.x, toNode.y);
            ctx.stroke();

            // Flowing dash effect for active edges
            const recency = Date.now() - edge.lastActive;
            if (recency < 30000) {
                const flowOpacity = Math.max(0, 0.3 - recency / 100000);
                ctx.strokeStyle = `rgba(0, 229, 255, ${flowOpacity})`;
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 8]);
                ctx.lineDashOffset = -(time * 0.03) % 12;
                ctx.beginPath();
                ctx.moveTo(fromNode.x, fromNode.y);
                ctx.quadraticCurveTo(mx + offsetX, my + offsetY, toNode.x, toNode.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }

    private updateAndRenderParticles(ctx: CanvasRenderingContext2D): void {
        const alive: Particle[] = [];

        for (const p of this.particles) {
            p.progress += p.speed;

            if (p.progress >= 1) {
                // Spawn impact ring at destination
                const toNode = this.nodeMap.get(p.toId);
                if (toNode) {
                    this.impacts.push({
                        x: toNode.x,
                        y: toNode.y,
                        color: p.color,
                        radius: toNode.radius,
                        maxRadius: toNode.radius + 20,
                        opacity: 0.6,
                    });
                }
                continue; // particle dies
            }

            alive.push(p);

            const fromNode = this.nodeMap.get(p.fromId);
            const toNode = this.nodeMap.get(p.toId);
            if (!fromNode || !toNode) continue;

            // Quadratic bezier position
            const mx = (fromNode.x + toNode.x) / 2;
            const my = (fromNode.y + toNode.y) / 2;
            const dx = toNode.x - fromNode.x;
            const dy = toNode.y - fromNode.y;
            const cpx = mx - dy * 0.05;
            const cpy = my + dx * 0.05;

            const t = p.progress;
            const x = (1 - t) * (1 - t) * fromNode.x + 2 * (1 - t) * t * cpx + t * t * toNode.x;
            const y = (1 - t) * (1 - t) * fromNode.y + 2 * (1 - t) * t * cpy + t * t * toNode.y;

            // Glow
            const grd = ctx.createRadialGradient(x, y, 0, x, y, p.size * 3);
            grd.addColorStop(0, p.color + hexAlpha(p.opacity * 0.6));
            grd.addColorStop(1, p.color + '00');
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(x, y, p.size * 3, 0, Math.PI * 2);
            ctx.fill();

            // Core
            ctx.fillStyle = p.color + hexAlpha(p.opacity);
            ctx.beginPath();
            ctx.arc(x, y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }

        this.particles = alive;
    }

    private updateAndRenderImpacts(ctx: CanvasRenderingContext2D): void {
        const alive: ImpactRing[] = [];

        for (const impact of this.impacts) {
            impact.radius += 1.5;
            impact.opacity -= 0.02;

            if (impact.opacity <= 0) continue;
            alive.push(impact);

            ctx.strokeStyle = impact.color + hexAlpha(impact.opacity);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(impact.x, impact.y, impact.radius, 0, Math.PI * 2);
            ctx.stroke();
        }

        this.impacts = alive;
    }

    private renderNodes(ctx: CanvasRenderingContext2D, time: number): void {
        const now = Date.now();

        for (const node of this.nodes) {
            const isHovered = this.hoveredNodeId === node.id;
            const isSelected = this.selectedNodeId === node.id;
            const isActive = now - node.lastActive < 10000;
            const displayRadius = isHovered ? node.radius * 1.15 : node.radius;

            // Outer glow
            const glowRadius = displayRadius * 2.5;
            const glowOpacity = isSelected ? 0.25 : isHovered ? 0.18 : isActive ? 0.1 : 0.04;
            const glow = ctx.createRadialGradient(node.x, node.y, displayRadius * 0.5, node.x, node.y, glowRadius);
            glow.addColorStop(0, node.color + hexAlpha(glowOpacity));
            glow.addColorStop(1, node.color + '00');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
            ctx.fill();

            // Pulse ring for active nodes
            if (isActive) {
                const pulseProgress = ((time * 0.001 + node.pulsePhase) % 2) / 2;
                const pulseRadius = displayRadius + pulseProgress * 20;
                const pulseOpacity = Math.max(0, 0.3 * (1 - pulseProgress));
                ctx.strokeStyle = node.color + hexAlpha(pulseOpacity);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(node.x, node.y, pulseRadius, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Node body
            const bodyGrd = ctx.createRadialGradient(
                node.x - displayRadius * 0.3,
                node.y - displayRadius * 0.3,
                0,
                node.x,
                node.y,
                displayRadius,
            );
            bodyGrd.addColorStop(0, lightenColor(node.color, 30));
            bodyGrd.addColorStop(0.7, node.color);
            bodyGrd.addColorStop(1, darkenColor(node.color, 30));
            ctx.fillStyle = bodyGrd;
            ctx.beginPath();
            ctx.arc(node.x, node.y, displayRadius, 0, Math.PI * 2);
            ctx.fill();

            // Border ring
            ctx.strokeStyle = isSelected
                ? '#ffffff' + hexAlpha(0.7)
                : node.color + hexAlpha(isHovered ? 0.6 : 0.3);
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.beginPath();
            ctx.arc(node.x, node.y, displayRadius, 0, Math.PI * 2);
            ctx.stroke();

            // Name label
            ctx.fillStyle = isSelected || isHovered ? '#ffffff' : 'rgba(200, 210, 230, 0.8)';
            ctx.font = '600 10px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(node.name, node.x, node.y + displayRadius + 6);

            // Message count badge
            if (node.msgCount > 0) {
                const badge = `${node.msgCount}`;
                ctx.font = '600 8px system-ui, sans-serif';
                const badgeWidth = ctx.measureText(badge).width + 6;
                const bx = node.x + displayRadius * 0.6;
                const by = node.y - displayRadius * 0.8;

                ctx.fillStyle = 'rgba(10, 10, 15, 0.8)';
                roundRect(ctx, bx - badgeWidth / 2, by - 6, badgeWidth, 12, 6);
                ctx.fill();

                ctx.fillStyle = node.color;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(badge, bx, by);
            }
        }
    }

    /* ── Mouse interaction ──────────────────────────────── */

    private handleMouseMove(e: MouseEvent): void {
        const rect = this.canvasRef().nativeElement.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;

        const hitNode = this.hitTest(this.mouseX, this.mouseY);
        this.hoveredNodeId = hitNode?.id ?? null;
        this.canvasRef().nativeElement.style.cursor = hitNode ? 'pointer' : 'default';
    }

    private handleMouseLeave = (): void => {
        this.hoveredNodeId = null;
        this.mouseX = -1;
        this.mouseY = -1;
        this.canvasRef().nativeElement.style.cursor = 'default';
    };

    private handleClick(e: MouseEvent): void {
        const rect = this.canvasRef().nativeElement.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const hitNode = this.hitTest(x, y);
        if (hitNode) {
            if (this.selectedNodeId === hitNode.id) {
                this.clearSelection();
            } else {
                this.selectedNodeId = hitNode.id;
                this.selectedAgent.set({
                    id: hitNode.id,
                    name: hitNode.name,
                    color: hitNode.color,
                });
                this.agentSelected.emit(hitNode.id);
            }
        } else {
            this.clearSelection();
        }
    }

    private hitTest(x: number, y: number): VisNode | null {
        // Check in reverse order (top-most first)
        for (let i = this.nodes.length - 1; i >= 0; i--) {
            const node = this.nodes[i];
            const dx = x - node.x;
            const dy = y - node.y;
            const hitRadius = node.radius + 8; // generous hit area
            if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                return node;
            }
        }
        return null;
    }
}

/* ── Helper functions ──────────────────────────────────── */

function hexAlpha(opacity: number): string {
    const clamped = Math.max(0, Math.min(1, opacity));
    return Math.round(clamped * 255)
        .toString(16)
        .padStart(2, '0');
}

function lightenColor(hex: string, amount: number): string {
    const rgb = hexToRgb(hex);
    return `rgb(${Math.min(255, rgb.r + amount)}, ${Math.min(255, rgb.g + amount)}, ${Math.min(255, rgb.b + amount)})`;
}

function darkenColor(hex: string, amount: number): string {
    const rgb = hexToRgb(hex);
    return `rgb(${Math.max(0, rgb.r - amount)}, ${Math.max(0, rgb.g - amount)}, ${Math.max(0, rgb.b - amount)})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace('#', '');
    return {
        r: Number.parseInt(h.slice(0, 2), 16),
        g: Number.parseInt(h.slice(2, 4), 16),
        b: Number.parseInt(h.slice(4, 6), 16),
    };
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}
