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
    inject,
} from '@angular/core';
import * as THREE from 'three';
import type { LibraryEntry } from '../../core/services/library.service';
import {
    type CategoryZone,
    type BookNode3D,
    CATEGORY_COLORS,
    CATEGORY_LABELS,
    ALL_CATEGORIES,
    ZONE_RADIUS,
} from './library-3d.types';
import { Library3dSceneService } from './library-3d-scene.service';
import { buildBookNodes, disposeBookNodes, drawMinimap } from './library-3d-mesh.utils';

@Component({
    selector: 'app-library-3d',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [Library3dSceneService],
    styleUrl: './library-3d.component.css',
    template: `
        <div class="lib3d" #container>
            <canvas #canvas></canvas>
            <canvas class="lib3d__minimap" #minimap width="140" height="140"></canvas>
            <div class="lib3d__legend">
                @for (zone of categoryZones; track zone.category) {
                    <button
                        class="lib3d__legend-btn"
                        [style.--zone-color]="'#' + zone.color.toString(16).padStart(6, '0')"
                        (click)="teleportToZone(zone)">
                        <span class="lib3d__legend-dot"></span>{{ zone.label }}
                    </button>
                }
            </div>
            @if (hoveredEntry()) {
                <div class="lib3d__tooltip" [style.left.px]="tooltipX()" [style.top.px]="tooltipY()">
                    <strong>{{ hoveredEntry()!.key }}</strong>
                    <span class="lib3d__tooltip-cat">{{ hoveredEntry()!.category }}</span>
                </div>
            }
            <div class="lib3d__mode-badge">{{ fpsMode() ? 'WALK MODE' : 'BROWSE MODE' }}</div>
            <div class="lib3d__hint">
                @if (fpsMode()) { WASD move · Mouse look · Click book to read · TAB browse mode }
                @else { Right-drag look · Click item to read · WASD move · TAB walk mode }
            </div>
        </div>
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
    private readonly sceneService = inject(Library3dSceneService);

    private bookNodes: BookNode3D[] = [];
    private animationId = 0;
    private resizeObserver: ResizeObserver | null = null;
    private abortController: AbortController | null = null;
    private orbHovered = false;
    private unpausedAt = 0;

    // Camera state
    private cameraPosition = new THREE.Vector3(0, 5, 55);
    private cameraYaw = 0;
    private cameraPitch = -0.05;

    // Input state
    private keys = new Set<string>();
    private isDragging = false;
    private rightDragging = false;
    private lastMouseX = 0;
    private lastMouseY = 0;

    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private reducedMotion = false;

    readonly categoryZones: CategoryZone[] = ALL_CATEGORIES.map((cat, i) => {
        const angle = (i / ALL_CATEGORIES.length) * Math.PI * 2 - Math.PI / 2;
        return {
            category: cat,
            label: CATEGORY_LABELS[cat],
            color: CATEGORY_COLORS[cat],
            angle,
            position: new THREE.Vector3(Math.cos(angle) * ZONE_RADIUS, 0, Math.sin(angle) * ZONE_RADIUS),
        };
    });

    constructor() {
        this.reducedMotion =
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        afterNextRender(() => this.initScene());

        effect(() => {
            const entries = this.entries();
            if (this.sceneService.scene) this.rebuildBooks(entries);
        });

        effect(() => {
            if (this.paused()) {
                this.fpsMode.set(false);
                if (document.pointerLockElement) document.exitPointerLock();
                this.keys.clear();
            } else {
                this.unpausedAt = Date.now();
            }
        });
    }

    ngOnDestroy(): void {
        this.cleanup();
    }

    private initScene(): void {
        const container = this.containerRef().nativeElement;
        const canvas = this.canvasRef().nativeElement;
        this.sceneService.init(canvas, container.clientWidth, container.clientHeight);
        this.sceneService.createSceneObjects(this.categoryZones);
        this.sceneService.setCamera(this.cameraPosition, this.cameraYaw, this.cameraPitch);
        this.rebuildBooks(this.entries());
        this.addEventListeners(container);
        this.resizeObserver = new ResizeObserver(() => {
            this.sceneService.handleResize(container.clientWidth, container.clientHeight);
        });
        this.resizeObserver.observe(container);
        this.animate(0);
    }

    private rebuildBooks(entries: LibraryEntry[]): void {
        const scene = this.sceneService.scene;
        if (!scene) return;
        disposeBookNodes(this.bookNodes, scene);
        this.bookNodes = buildBookNodes(entries, scene, this.categoryZones);
    }

    private animate(time: number): void {
        this.animationId = requestAnimationFrame((t) => this.animate(t));
        const t = time * 0.001;
        this.processMovement();
        this.sceneService.animateFrame(t, this.reducedMotion, this.bookNodes);
        const minimap = this.minimapRef()?.nativeElement;
        if (minimap) {
            drawMinimap(minimap, this.categoryZones, this.bookNodes,
                this.cameraPosition.x, this.cameraPosition.z, this.cameraYaw);
        }
    }

    private processMovement(): void {
        if (this.paused()) return;
        const speed = 0.5;
        const fwd = new THREE.Vector3(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
        const rgt = new THREE.Vector3(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));
        if (this.keys.has('w') || this.keys.has('arrowup')) this.cameraPosition.addScaledVector(fwd, speed);
        if (this.keys.has('s') || this.keys.has('arrowdown')) this.cameraPosition.addScaledVector(fwd, -speed);
        if (this.keys.has('a') || this.keys.has('arrowleft')) this.cameraPosition.addScaledVector(rgt, -speed);
        if (this.keys.has('d') || this.keys.has('arrowright')) this.cameraPosition.addScaledVector(rgt, speed);
        this.cameraPosition.x = Math.max(-80, Math.min(80, this.cameraPosition.x));
        this.cameraPosition.z = Math.max(-80, Math.min(80, this.cameraPosition.z));
        this.sceneService.setCamera(this.cameraPosition, this.cameraYaw, this.cameraPitch);
    }

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

    private addEventListeners(container: HTMLDivElement): void {
        this.abortController = new AbortController();
        const s = { signal: this.abortController.signal };
        container.addEventListener('mousedown', (e) => this.handleMouseDown(e), s);
        container.addEventListener('mousemove', (e) => this.handleMouseMove(e), s);
        container.addEventListener('mouseup', () => { this.isDragging = false; this.rightDragging = false; }, s);
        container.addEventListener('mouseleave', () => { this.isDragging = false; this.rightDragging = false; }, s);
        container.addEventListener('wheel', (e) => this.handleWheel(e), { ...s, passive: false });
        container.addEventListener('click', (e) => this.handleClick(e), s);
        container.addEventListener('contextmenu', (e) => e.preventDefault(), s);
        container.addEventListener('touchstart', (e) => this.handleTouchStart(e), { ...s, passive: false });
        container.addEventListener('touchmove', (e) => this.handleTouchMove(e), { ...s, passive: false });
        container.addEventListener('touchend', () => { this.isDragging = false; }, s);
        document.addEventListener('pointerlockchange', () => {
            if (!document.pointerLockElement && this.fpsMode()) this.fpsMode.set(false);
        }, s);
        window.addEventListener('keydown', (e) => this.handleKeyDown(e), s);
        window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()), s);
    }

    private handleKeyDown(e: KeyboardEvent): void {
        if (this.paused()) return;
        const key = e.key.toLowerCase();
        if (key === 'tab') {
            e.preventDefault();
            const entering = !this.fpsMode();
            this.fpsMode.set(entering);
            const container = this.containerRef()?.nativeElement;
            if (entering && container) container.requestPointerLock();
            else if (!entering && document.pointerLockElement) document.exitPointerLock();
            return;
        }
        if (key === 'escape' && this.fpsMode()) {
            this.fpsMode.set(false);
            if (document.pointerLockElement) document.exitPointerLock();
            return;
        }
        this.keys.add(key);
    }

    private handleMouseDown(e: MouseEvent): void {
        if (this.paused()) return;
        if (e.button === 2) {
            this.rightDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            e.preventDefault();
        } else if (e.button === 0 && !this.fpsMode()) {
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        }
    }

    private handleMouseMove(e: MouseEvent): void {
        if (this.paused()) return;
        if (this.fpsMode() && document.pointerLockElement) {
            this.cameraYaw -= (e.movementX ?? 0) * 0.002;
            this.cameraPitch = Math.max(-1, Math.min(0.8, this.cameraPitch - (e.movementY ?? 0) * 0.002));
        } else if (this.rightDragging || this.isDragging) {
            this.cameraYaw -= (e.clientX - this.lastMouseX) * 0.003;
            this.cameraPitch = Math.max(-1, Math.min(0.8, this.cameraPitch - (e.clientY - this.lastMouseY) * 0.003));
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        }
        if (!this.fpsMode() && !this.rightDragging) {
            this.updateMousePosition(e);
            this.performHoverRaycast();
        }
    }

    private handleWheel(e: WheelEvent): void {
        e.preventDefault();
        this.cameraPosition.y = Math.max(2, Math.min(20, this.cameraPosition.y + e.deltaY * 0.03));
    }

    private handleClick(e: MouseEvent): void {
        const camera = this.sceneService.camera;
        if (!camera || !this.sceneService.scene || this.paused()) return;
        if (Date.now() - this.unpausedAt < 500) return;
        if (this.fpsMode()) this.mouse.set(0, 0); else this.updateMousePosition(e);
        this.raycaster.setFromCamera(this.mouse, camera);
        const orbHitbox = this.sceneService.centerOrbHitbox;
        if (orbHitbox && this.raycaster.intersectObject(orbHitbox).length > 0) {
            this.orbSearch.emit();
            return;
        }
        const intersects = this.raycaster.intersectObjects(this.bookNodes.map((n) => n.mesh));
        if (intersects.length > 0) {
            const node = this.bookNodes.find((n) => n.entry.key === intersects[0].object.userData['entryKey']);
            if (node) this.entrySelect.emit(node.entry);
        }
    }

    private handleTouchStart(e: TouchEvent): void {
        if (e.touches.length === 1) {
            this.isDragging = true;
            this.lastMouseX = e.touches[0].clientX;
            this.lastMouseY = e.touches[0].clientY;
        }
    }

    private handleTouchMove(e: TouchEvent): void {
        if (e.touches.length === 1 && this.isDragging) {
            e.preventDefault();
            this.cameraYaw -= (e.touches[0].clientX - this.lastMouseX) * 0.003;
            this.cameraPitch = Math.max(-1, Math.min(0.8,
                this.cameraPitch - (e.touches[0].clientY - this.lastMouseY) * 0.003));
            this.lastMouseX = e.touches[0].clientX;
            this.lastMouseY = e.touches[0].clientY;
        }
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
        const camera = this.sceneService.camera;
        if (!camera) return;
        this.raycaster.setFromCamera(this.mouse, camera);
        const container = this.containerRef()?.nativeElement;
        const orbHitbox = this.sceneService.centerOrbHitbox;
        if (orbHitbox) {
            const wasHovered = this.orbHovered;
            this.orbHovered = this.raycaster.intersectObject(orbHitbox).length > 0;
            if (this.orbHovered !== wasHovered && container) {
                container.style.cursor = this.orbHovered ? 'pointer' : '';
            }
            const orb = this.sceneService.centerOrb;
            if (this.orbHovered) {
                if (orb) (orb.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2;
                this.hoveredEntry.set(null);
                return;
            }
            if (orb) (orb.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8;
        }
        const intersects = this.raycaster.intersectObjects(this.bookNodes.map((n) => n.mesh));
        if (intersects.length > 0) {
            const node = this.bookNodes.find((n) => n.entry.key === intersects[0].object.userData['entryKey']);
            this.hoveredEntry.set(node?.entry ?? null);
            if (container) container.style.cursor = 'pointer';
        } else {
            this.hoveredEntry.set(null);
            if (container) container.style.cursor = '';
        }
    }

    private cleanup(): void {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        if (document.pointerLockElement) document.exitPointerLock();
        this.abortController?.abort();
        this.resizeObserver?.disconnect();
        const scene = this.sceneService.scene;
        if (scene) disposeBookNodes(this.bookNodes, scene);
        this.sceneService.dispose();
    }
}
