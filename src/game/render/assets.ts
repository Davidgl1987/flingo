/**
 * Assets compartidos: geometrías y materiales creados UNA vez a nivel de
 * módulo. Prohibido crear materiales/geometrías dentro de componentes.
 * Paleta plana, materiales lambert/basic (sin PBR, sin sombras dinámicas).
 */

import * as THREE from 'three';

// ── Geometrías unitarias (se escalan por mesh) ────────────────────────────

export const unitSphere = new THREE.SphereGeometry(1, 24, 16);
export const unitBox = new THREE.BoxGeometry(1, 1, 1);
export const unitCircle = new THREE.CircleGeometry(1, 24);
export const unitPlane = new THREE.PlaneGeometry(1, 1);

// ── Textura radial para blob shadows (generada una vez, sin ficheros) ─────

function createRadialTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.35)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ── Materiales ────────────────────────────────────────────────────────────

export const heroMaterial = new THREE.MeshLambertMaterial({ color: '#54c7ff' });
export const floorMaterial = new THREE.MeshLambertMaterial({ color: '#20243a' });
export const wallMaterial = new THREE.MeshLambertMaterial({ color: '#3b4266' });
export const rockMaterial = new THREE.MeshLambertMaterial({ color: '#767d99' });

export const blobShadowMaterial = new THREE.MeshBasicMaterial({
  map: createRadialTexture(),
  transparent: true,
  depthWrite: false,
});

export const aimDotMaterial = new THREE.MeshBasicMaterial({
  color: '#ffe082',
  transparent: true,
  opacity: 0.95,
  depthWrite: false,
});
