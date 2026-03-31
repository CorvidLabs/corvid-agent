import * as THREE from 'three';

/**
 * Creates a Three.js Sprite with text drawn onto a canvas texture.
 */
export function createTextSprite(text: string, color: number, w: number, h: number, fontSize: number): THREE.Sprite {
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
