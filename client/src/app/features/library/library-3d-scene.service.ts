import { Injectable } from '@angular/core';
import * as THREE from 'three';
import type { BookNode3D, CategoryZone } from './library-3d.types';
import { BOOK_SPREAD } from './library-3d.types';
import { createTextSprite } from './library-3d.utils';

/**
 * Manages the Three.js scene for the Library 3D component:
 * renderer, camera, lights, static geometry, particle systems,
 * zone markers, and the per-frame animation/render tick.
 *
 * Provide at component level: `providers: [Library3dSceneService]`
 */
@Injectable()
export class Library3dSceneService {
    private renderer: THREE.WebGLRenderer | null = null;
    private _scene: THREE.Scene | null = null;
    private _camera: THREE.PerspectiveCamera | null = null;

    private stars: THREE.Points | null = null;
    private starTwinklePhases: Float32Array | null = null;
    private dustParticles: THREE.Points | null = null;
    private _centerOrb: THREE.Mesh | null = null;
    private centerRing: THREE.Mesh | null = null;
    private _centerOrbHitbox: THREE.Mesh | null = null;
    private zoneRings: THREE.Mesh[] = [];
    private zoneLabels: THREE.Sprite[] = [];
    private shelfGroups: THREE.Group[] = [];

    get scene(): THREE.Scene | null { return this._scene; }
    get camera(): THREE.PerspectiveCamera | null { return this._camera; }
    get centerOrb(): THREE.Mesh | null { return this._centerOrb; }
    get centerOrbHitbox(): THREE.Mesh | null { return this._centerOrbHitbox; }

    /** Initialise renderer + scene + camera. */
    init(canvas: HTMLCanvasElement, width: number, height: number): void {
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(width, height);

        this._scene = new THREE.Scene();
        this._scene.background = new THREE.Color(0x05050a);
        this._scene.fog = new THREE.Fog(0x05050a, 40, 110);

        this._camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 200);
    }

    /** Add lights, floor, center piece, starfield, dust, and zone markers. */
    createSceneObjects(categoryZones: CategoryZone[]): void {
        this.createLightsAndFloor();
        this.createCenterPiece();
        this.createStarfield();
        this.createDustParticles();
        this.createZoneMarkers(categoryZones);
    }

    private createLightsAndFloor(): void {
        const s = this._scene!;
        s.add(new THREE.AmbientLight(0x1a1525, 1.0));

        const centralLight = new THREE.PointLight(0xffe4b5, 1.4, 120);
        centralLight.position.set(0, 25, 0);
        s.add(centralLight);

        const skyLight = new THREE.PointLight(0x00e5ff, 0.4, 150);
        skyLight.position.set(0, 40, 0);
        s.add(skyLight);

        const fillLight1 = new THREE.PointLight(0xa78bfa, 0.35, 80);
        fillLight1.position.set(-30, 12, 30);
        s.add(fillLight1);

        const fillLight2 = new THREE.PointLight(0xf59e0b, 0.25, 80);
        fillLight2.position.set(30, 12, -30);
        s.add(fillLight2);

        // Floor
        const floorGeo = new THREE.CircleGeometry(70, 64);
        floorGeo.rotateX(-Math.PI / 2);
        const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({
            color: 0x0d0a12, roughness: 0.85, metalness: 0.05,
            emissive: new THREE.Color(0x1a1525), emissiveIntensity: 0.15,
        }));
        floor.position.y = -0.01;
        s.add(floor);

        // Concentric floor rings
        for (const r of [15, 35, 55]) {
            const ringGeo = new THREE.RingGeometry(r - 0.1, r + 0.1, 64);
            ringGeo.rotateX(-Math.PI / 2);
            const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
                color: 0x1a1530, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
            }));
            ring.position.y = 0.02;
            s.add(ring);
        }
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

            const colorType = Math.random();
            const i3 = i * 3;
            if (colorType < 0.4) {
                colors[i3] = 0.9 + Math.random() * 0.1;
                colors[i3 + 1] = 0.7 + Math.random() * 0.2;
                colors[i3 + 2] = 0.3 + Math.random() * 0.15;
            } else if (colorType < 0.6) {
                colors[i3] = 0.5 + Math.random() * 0.2;
                colors[i3 + 1] = 0.8 + Math.random() * 0.2;
                colors[i3 + 2] = 0.9 + Math.random() * 0.1;
            } else {
                const b = 0.7 + Math.random() * 0.3;
                colors[i3] = b; colors[i3 + 1] = b * 0.95; colors[i3 + 2] = b;
            }
            this.starTwinklePhases[i] = Math.random() * Math.PI * 2;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
            size: 0.3, vertexColors: true, transparent: true,
            opacity: 0.6, sizeAttenuation: true, depthWrite: false,
        }));
        this._scene!.add(this.stars);
    }

    private createCenterPiece(): void {
        const s = this._scene!;
        const group = new THREE.Group();

        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(4, 4.5, 0.6, 32),
            new THREE.MeshStandardMaterial({
                color: 0x1a1530, emissive: new THREE.Color(0x00e5ff),
                emissiveIntensity: 0.08, roughness: 0.4, metalness: 0.6,
            }),
        );
        base.position.y = 0.3;
        group.add(base);

        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(3.5, 0.08, 8, 64),
            new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.6 }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.65;
        group.add(ring);

        const orb = new THREE.Mesh(
            new THREE.IcosahedronGeometry(1.2, 2),
            new THREE.MeshStandardMaterial({
                color: 0x00e5ff, emissive: new THREE.Color(0x00e5ff),
                emissiveIntensity: 0.8, roughness: 0.1, metalness: 0.9,
                transparent: true, opacity: 0.7,
            }),
        );
        orb.position.y = 4;
        group.add(orb);
        this._centerOrb = orb;

        const orbGlow = new THREE.Mesh(
            new THREE.SphereGeometry(2.5, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.06 }),
        );
        orbGlow.position.y = 4;
        group.add(orbGlow);

        const innerRing = new THREE.Mesh(
            new THREE.TorusGeometry(1.8, 0.03, 8, 48),
            new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.5 }),
        );
        innerRing.position.y = 4;
        group.add(innerRing);
        this.centerRing = innerRing;

        const hitbox = new THREE.Mesh(
            new THREE.SphereGeometry(3, 16, 16),
            new THREE.MeshBasicMaterial({ visible: false }),
        );
        hitbox.position.y = 4;
        hitbox.userData = { isOrbHitbox: true };
        group.add(hitbox);
        this._centerOrbHitbox = hitbox;

        const titleLabel = createTextSprite('CORVID LIBRARY', 0x00e5ff, 512, 64, 28);
        titleLabel.position.set(0, 7.5, 0);
        titleLabel.scale.set(12, 1.5, 1);
        group.add(titleLabel);

        const subLabel = createTextSprite('Team Alpha Knowledge Commons', 0x8888aa, 512, 48, 18);
        subLabel.position.set(0, 6.5, 0);
        subLabel.scale.set(12, 1.2, 1);
        group.add(subLabel);

        const searchLabel = createTextSprite('Click Orb to Search', 0x66aacc, 384, 36, 14);
        searchLabel.position.set(0, 1.5, 0);
        searchLabel.scale.set(7, 0.7, 1);
        group.add(searchLabel);

        s.add(group);
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
        this.dustParticles = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xffe4b5, size: 0.12, transparent: true, opacity: 0.3,
        }));
        this._scene!.add(this.dustParticles);
    }

    private createZoneMarkers(categoryZones: CategoryZone[]): void {
        for (const zone of categoryZones) {
            const ringGeo = new THREE.RingGeometry(BOOK_SPREAD + 2, BOOK_SPREAD + 2.3, 48);
            ringGeo.rotateX(-Math.PI / 2);
            const zoneRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
                color: zone.color, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
            }));
            zoneRing.position.copy(zone.position);
            zoneRing.position.y = 0.05;
            this._scene!.add(zoneRing);
            this.zoneRings.push(zoneRing);

            const labelSprite = createTextSprite(zone.label, zone.color, 256, 48, 24);
            labelSprite.position.copy(zone.position);
            labelSprite.position.y = 7;
            labelSprite.scale.set(10, 2, 1);
            this._scene!.add(labelSprite);
            this.zoneLabels.push(labelSprite);

            const shelfGroup = new THREE.Group();
            const shelfMat = new THREE.MeshStandardMaterial({
                color: 0x1a1520, emissive: new THREE.Color(zone.color),
                emissiveIntensity: 0.05, roughness: 0.9, metalness: 0.1,
            });
            const postMat = new THREE.MeshStandardMaterial({
                color: 0x1a1520, emissive: new THREE.Color(zone.color),
                emissiveIntensity: 0.08, roughness: 0.8, metalness: 0.2,
            });

            for (let s = 0; s < 2; s++) {
                const shelfAngle = zone.angle + ((s - 0.5) * 0.6);
                const sx = zone.position.x + Math.cos(shelfAngle) * (BOOK_SPREAD * 0.5);
                const sz = zone.position.z + Math.sin(shelfAngle) * (BOOK_SPREAD * 0.5);

                for (const side of [-1, 1]) {
                    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 7, 0.2), postMat);
                    const offsetX = Math.cos(shelfAngle + Math.PI / 2) * 3.2 * side;
                    const offsetZ = Math.sin(shelfAngle + Math.PI / 2) * 3.2 * side;
                    post.position.set(sx + offsetX, 3.5, sz + offsetZ);
                    shelfGroup.add(post);
                }

                const backMat = new THREE.MeshStandardMaterial({
                    color: 0x120e1a, emissive: new THREE.Color(zone.color),
                    emissiveIntensity: 0.02, roughness: 0.95, metalness: 0.0,
                });
                const back = new THREE.Mesh(new THREE.BoxGeometry(6.6, 7, 0.08), backMat);
                const backOffset = 0.65;
                back.position.set(
                    sx + Math.cos(shelfAngle) * backOffset,
                    3.5,
                    sz + Math.sin(shelfAngle) * backOffset,
                );
                back.rotation.y = shelfAngle;
                shelfGroup.add(back);

                const cap = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.15, 1.3), postMat);
                cap.position.set(sx, 7, sz);
                cap.rotation.y = shelfAngle;
                shelfGroup.add(cap);

                for (const shelfY of [1, 3, 5]) {
                    const plank = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.14, 1.3), shelfMat);
                    plank.position.set(sx, shelfY, sz);
                    plank.rotation.y = shelfAngle;
                    shelfGroup.add(plank);
                }
            }

            const glowGeo = new THREE.CircleGeometry(BOOK_SPREAD + 1, 32);
            glowGeo.rotateX(-Math.PI / 2);
            const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
                color: zone.color, transparent: true, opacity: 0.04, side: THREE.DoubleSide,
            }));
            glow.position.copy(zone.position);
            glow.position.y = 0.02;
            this._scene!.add(glow);
            this._scene!.add(shelfGroup);
            this.shelfGroups.push(shelfGroup);
        }
    }

    /** Apply camera position/orientation from component state. */
    setCamera(position: THREE.Vector3, yaw: number, pitch: number): void {
        if (!this._camera) return;
        this._camera.position.copy(position);
        this._camera.lookAt(
            position.x - Math.sin(yaw) * 10,
            position.y + Math.sin(pitch) * 10,
            position.z - Math.cos(yaw) * 10,
        );
    }

    handleResize(width: number, height: number): void {
        if (!this.renderer || !this._camera) return;
        this._camera.aspect = width / height;
        this._camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Animate scene objects and render one frame.
     * Called every requestAnimationFrame tick by the component.
     */
    animateFrame(t: number, reducedMotion: boolean, bookNodes: BookNode3D[]): void {
        if (!this.renderer || !this._scene || !this._camera) return;

        if (!reducedMotion) {
            // Book glow pulse
            for (const node of bookNodes) {
                const pulse = Math.sin(t * 1.2 + node.pulsePhase) * 0.5 + 0.5;
                (node.glowMesh.material as THREE.MeshBasicMaterial).opacity = 0.03 + pulse * 0.06;
            }

            // Center orb float + rotation
            if (this._centerOrb) {
                this._centerOrb.position.y = 4 + Math.sin(t * 0.8) * 0.3;
                this._centerOrb.rotation.y = t * 0.3;
                this._centerOrb.rotation.x = Math.sin(t * 0.5) * 0.15;
            }
            if (this.centerRing) {
                this.centerRing.position.y = 4 + Math.sin(t * 0.8) * 0.3;
                this.centerRing.rotation.x = Math.PI / 2 + Math.sin(t * 0.6) * 0.4;
                this.centerRing.rotation.z = t * 0.5;
            }

            // Star twinkling
            if (this.stars && this.starTwinklePhases) {
                const starColors = this.stars.geometry.attributes['color'] as THREE.BufferAttribute;
                if (Math.floor(t * 60) % 3 === 0) {
                    for (let i = 0; i < this.starTwinklePhases.length; i++) {
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
                this.stars.rotation.y = t * 0.008;
            }

            // Dust drift
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

        this.renderer.render(this._scene, this._camera);
    }

    dispose(): void {
        if (this.stars) {
            this.stars.geometry.dispose();
            (this.stars.material as THREE.Material).dispose();
        }
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
        if (this._scene) {
            this._scene.traverse((obj) => {
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
        this._scene = null;
        this._camera = null;
    }
}
