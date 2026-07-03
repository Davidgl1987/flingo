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
/** Cono direccional para el hocico/telegrafiado de enemigos (Dummy/Chaser/Shooter). */
export const unitCone = new THREE.ConeGeometry(0.5, 1, 12);
/** Púa del Spike: pirámide alargada apuntando en +Z local. */
export const unitSpike = new THREE.ConeGeometry(0.35, 0.9, 6);

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

// ── Enemigos (GDD §7): silueta/color inconfundibles por arquetipo ─────────

export const dummyMaterial = new THREE.MeshLambertMaterial({ color: '#ff5964' });
export const chaserMaterial = new THREE.MeshLambertMaterial({ color: '#ff9f45' });
export const spikeMaterial = new THREE.MeshLambertMaterial({ color: '#9aa1bd' });
export const spikeConeMaterial = new THREE.MeshLambertMaterial({ color: '#e2e6f2' });
export const trailMaterial = new THREE.MeshLambertMaterial({ color: '#4dd68a' });
export const shooterMaterial = new THREE.MeshLambertMaterial({ color: '#2b2f42' });
/** Flash blanco al recibir daño: material único intercambiado temporalmente por render/EnemyView. */
export const enemyHitFlashMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
/** Telegrafiado de carga del Shooter: disco pulsante bajo sus pies. */
export const shooterTelegraphMaterial = new THREE.MeshBasicMaterial({
  color: '#ff3b3b',
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});

// ── Proyectiles ────────────────────────────────────────────────────────────

export const arrowMaterial = new THREE.MeshLambertMaterial({ color: '#ffe082' });
export const spellMaterial = new THREE.MeshLambertMaterial({ color: '#8a6bff' });
export const enemyProjectileMaterial = new THREE.MeshLambertMaterial({ color: '#ff3b3b' });

// ── Hazards ────────────────────────────────────────────────────────────────

export const pitMaterial = new THREE.MeshBasicMaterial({ color: '#05060a' });
export const spikesMaterial = new THREE.MeshLambertMaterial({ color: '#8d94ad' });
export const barrelMaterial = new THREE.MeshLambertMaterial({ color: '#c0442b' });
export const mudMaterial = new THREE.MeshBasicMaterial({
  color: '#6b4a2f',
  transparent: true,
  opacity: 0.85,
});
export const boostMaterial = new THREE.MeshBasicMaterial({
  color: '#3fd0ff',
  transparent: true,
  opacity: 0.6,
});
export const puddleMaterial = new THREE.MeshBasicMaterial({
  color: '#4dd68a',
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});

// ── Objetos ────────────────────────────────────────────────────────────────

export const coinMaterial = new THREE.MeshLambertMaterial({ color: '#ffd166' });
export const potionMaterial = new THREE.MeshLambertMaterial({ color: '#ff6bcb' });
export const keyMaterial = new THREE.MeshLambertMaterial({ color: '#ffe082' });
