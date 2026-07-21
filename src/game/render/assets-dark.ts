/**
 * Modo oscuro (rama `estilo-oscuro`, extraído de `assets.ts` en la pasada
 * pre-release): TODO lo que solo existe para `dark>=1` — snapshots de color
 * "original" de los materiales clásicos, `applyDarkMaterials` (punto de
 * entrada único de la penumbra), materiales/geometrías de silueta (ojos,
 * cirios, antorchas, cera de la vela) y los halos de brillo real.
 *
 * Dirección de dependencia ÚNICA (evita el ciclo): este módulo IMPORTA los
 * materiales base clásicos de `./assets` (los mismos objetos compartidos que
 * usa el resto del juego) para mutarlos in-place; `assets.ts` nunca importa
 * de aquí — los consumidores que necesitan símbolos de este fichero
 * (silueta/halos/cirios) los importan directamente de
 * `@/game/render/assets-dark`.
 */

import * as THREE from 'three';
import {
  barrelHoopMaterial,
  barrelMaterial,
  bossBodyMaterial,
  boostMaterial,
  chaserMaterial,
  coinMaterial,
  coinRimMaterial,
  doorKeyMaterial,
  doorMaterial,
  dummyMaterial,
  glowHaloTexture,
  guardianBodyMaterial,
  guardianHornMaterial,
  heroMaterial,
  keyMaterial,
  mudMaterial,
  potionMaterial,
  puddleMaterial,
  queenBodyMaterial,
  queenCrownMaterial,
  shooterMaterial,
  spikeConeMaterial,
  spikeMaterial,
  spikesMaterial,
  spikesNeedleMaterial,
  stormBodyMaterial,
  trailMaterial,
  WEAPON_COLOR,
} from './assets';
import { useDarkStore } from './dark-store';

// ── Penumbra experimental (rama `estilo-oscuro`): brillo propio tenue ─────
//
// En dark 1-2 (?dark=, debug-params.ts, editable en runtime desde el menú de
// pausa vía `useDarkStore`, ver dark-store.ts) los elementos de jugabilidad
// deben "intuirse" fuera del alcance de la vela del héroe. Los materiales
// Lambert de arriba reaccionan a la luz de escena (que en penumbra es casi
// nula), así que se les da un `emissive` tenue según `?glow=`/el store (lista
// de grupos, o TODOS por defecto). Los materiales Basic (pit/charco/barro/
// acelerador) YA ignoran la iluminación de escena — son autoemisivos de
// facto — así que en vez de `emissive` se les baja directamente el COLOR
// (`applyToneDark`); barro/acelerador (grupo `hazards`) tienen además dos
// tonos según `?glow=hazards` esté activo o no (ver comentario junto a
// `HAZARD_TONE_ON`/`HAZARD_TONE_OFF` más abajo) — antes ignoraban el grupo
// por completo (playtest: "las plataformas de velocidad siguen emitiendo
// luz... no tienen categoría ni check en glow").
//
// Todo lo de aquí abajo pasa por `applyDarkMaterials(dark, glow)`: función
// IDEMPOTENTE (se puede llamar cualquier número de veces con cualquier
// combinación de argumentos sin degradar nada) que SIEMPRE parte de los
// valores ORIGINALES capturados justo debajo de cada material — nunca del
// último estado aplicado — así que alternar 1→0→2→1 repetidas veces nunca
// acumula error ni dependencia de historial. `dark=0` deja TODO este bloque
// en su valor original: paridad EXACTA con `main`.
const GLOW_EMISSIVE_INTENSITY = 0.35;

/** Snapshot de color plano, capturado antes de cualquier mutación. */
function snapshotColor(material: { color: THREE.Color }): THREE.Color {
  return material.color.clone();
}

// -- Tono oscuro de materiales Basic, solo de dark>=1 --
const TONE_DARK_ORIGINAL = {
  puddle: snapshotColor(puddleMaterial),
  boost: snapshotColor(boostMaterial),
  mud: snapshotColor(mudMaterial),
};
/**
 * Charco de la Lacrimera (punto 4 de playtest: "el trail debe dejar el
 * rastro del mismo color que su modelo"): en dark>=1 el cuerpo de la
 * Lacrimera pasa a violeta pálido (`applySilhouettes`, `trailMaterial`
 * '#cfc4e8'/emissive '#b18cff'), así que su charco deja el verde musgo
 * clásico y pasa a violeta oscuro a juego — sin depender de `?glow=`
 * (mismo criterio que siempre tuvo: solo depende de `dark`, no es un
 * "peligro" con categoría propia).
 */
const TONE_DARK_COLOR = {
  puddle: new THREE.Color('#3d3355'),
};
/**
 * Plataformas de velocidad / barro (punto 3 de playtest: "las plataformas
 * de velocidad siguen emitiendo luz, creo que porque no tienen categoría ni
 * check en glow"): `boostMaterial`/`mudMaterial` son MeshBasic autoemisivos
 * de facto (ignoran la luz de escena) — antes se atenuaban SIEMPRE en
 * dark>=1 sin mirar ningún grupo de `?glow=`, así que "apagar hazards"
 * desde el menú de pausa no los afectaba. Ahora, igual que el resto de
 * peligros (`HAZARDS_GLOW_TARGETS`), dependen del grupo `hazards`: con
 * hazards ON, el tono atenuado pero VISIBLE de siempre; con hazards OFF (o
 * dark>=1 sin ese grupo activo), un tono MUY apagado, casi color de suelo.
 */
const HAZARD_TONE_ON = {
  boost: new THREE.Color('#1f7fa8'),
  mud: new THREE.Color('#3a2818'),
};
const HAZARD_TONE_OFF = {
  boost: new THREE.Color('#101b26'),
  mud: new THREE.Color('#1a140f'),
};

function applyToneDark(active: boolean, hazardsOn: boolean): void {
  if (active) {
    puddleMaterial.color.copy(TONE_DARK_COLOR.puddle);
    boostMaterial.color.copy(hazardsOn ? HAZARD_TONE_ON.boost : HAZARD_TONE_OFF.boost);
    mudMaterial.color.copy(hazardsOn ? HAZARD_TONE_ON.mud : HAZARD_TONE_OFF.mud);
  } else {
    puddleMaterial.color.copy(TONE_DARK_ORIGINAL.puddle);
    boostMaterial.color.copy(TONE_DARK_ORIGINAL.boost);
    mudMaterial.color.copy(TONE_DARK_ORIGINAL.mud);
  }
}

// -- Emissive tenue por grupo de `?glow=` (hazards/items/puertas) ─────────
interface EmissiveGlowTarget {
  material: THREE.MeshLambertMaterial;
  color: string;
  intensity: number;
  originalEmissive: THREE.Color;
  originalIntensity: number;
}

function emissiveTarget(material: THREE.MeshLambertMaterial, color: string, intensity: number): EmissiveGlowTarget {
  return {
    material,
    color,
    intensity,
    originalEmissive: material.emissive.clone(),
    originalIntensity: material.emissiveIntensity,
  };
}

/** Pinchos/barril: gris frío casi imperceptible y rescoldo cálido de pólvora/madera (silueta, no cartel). */
const HAZARDS_GLOW_TARGETS: EmissiveGlowTarget[] = [
  emissiveTarget(spikesMaterial, '#7a8bb0', GLOW_EMISSIVE_INTENSITY * 0.6),
  emissiveTarget(spikesNeedleMaterial, '#cfd6e8', GLOW_EMISSIVE_INTENSITY),
  emissiveTarget(barrelMaterial, '#ff5a33', GLOW_EMISSIVE_INTENSITY * 0.5),
  emissiveTarget(barrelHoopMaterial, '#e8d9a0', GLOW_EMISSIVE_INTENSITY * 0.4),
];
/** Monedas/llave/poción: dorado suave (poción mantiene su propio tono rosa). */
const ITEMS_GLOW_TARGETS: EmissiveGlowTarget[] = [
  emissiveTarget(coinMaterial, '#ffd166', GLOW_EMISSIVE_INTENSITY),
  emissiveTarget(coinRimMaterial, '#c98f1b', GLOW_EMISSIVE_INTENSITY * 0.8),
  emissiveTarget(keyMaterial, '#ffe082', GLOW_EMISSIVE_INTENSITY),
  emissiveTarget(potionMaterial, '#ff6bcb', GLOW_EMISSIVE_INTENSITY * 0.6),
];
/** Puertas normal/de jefe. */
const PUERTAS_GLOW_TARGETS: EmissiveGlowTarget[] = [
  emissiveTarget(doorMaterial, '#5a6db3', GLOW_EMISSIVE_INTENSITY),
  emissiveTarget(doorKeyMaterial, '#d9a531', GLOW_EMISSIVE_INTENSITY),
];

function applyEmissiveGroup(targets: EmissiveGlowTarget[], active: boolean): void {
  for (const t of targets) {
    if (active) {
      t.material.emissive.set(t.color);
      t.material.emissiveIntensity = t.intensity;
    } else {
      t.material.emissive.copy(t.originalEmissive);
      t.material.emissiveIntensity = t.originalIntensity;
    }
  }
}

// ── Siluetas oscuras de personajes (rama `estilo-oscuro`, solo dark>=1) ────
//
// Sustituye los cuerpos-placeholder (esferas de colores planos) por siluetas
// casi negras de piedra/tela, inspiradas en concept art estilo Hollow Knight/
// vela: cuerpos oscuros + ojos/acentos emisivos (MeshBasicMaterial, ignoran
// la luz de escena — visibles incluso a oscuras, "es EL rasgo del concept").
// Placeholders: primitivas de Three combinadas, no modelos; importa la
// silueta + los ojos, no el detalle. SOLO dark>=1: con dark=0 estos
// materiales quedan restaurados a su color original (paridad EXACTA con
// `main`). No toca radios de colisión ni la sim: es render puro (JSX/
// materiales), igual que el resto de "personalidad de enemigos" de más
// arriba.

/** Intensidad de emissive de acentos de jefe (cuernos/corona) sobre su Lambert base: se intuyen, no brillan como neón (mismo orden que GLOW_EMISSIVE_INTENSITY de arriba). */
const ACCENT_EMISSIVE_INTENSITY = 0.3;

/**
 * Cera pálida del cuerpo del héroe-vela: fija en dark>=1 (deja de lerpear con
 * el arma; la llama de arriba es la que cambia de color). Exportada: también
 * la usa `HeroView.tsx` para pintar el RASTRO de cera del héroe en silueta
 * (playtest 2026-07-16, "haz que la vela deje un rastro de cera al
 * moverse") — mismo tono que el propio cuerpo, coherente.
 */
export const HERO_WAX_COLOR = '#e8ddc8';

/**
 * Cuerpo del héroe-vela (punto 5 de playtest, rama `estilo-oscuro`): en
 * dark>=1 `HeroView.tsx` sustituye la esfera unitaria (`unitSphere`, radio 1)
 * por este cilindro ESTRECHO Y ALTO ("vela, no torre... pero tampoco rueda")
 * en el mismo mesh compartido (`bodyRef`) — misma convención "unit-X, se
 * escala por mesh" que el resto de geometrías de `assets.ts`: `HeroView.tsx`
 * sigue aplicando exactamente el mismo `visualRadius` de squash/stretch/
 * caída-al-foso que ya usaba con la esfera, sin tocar esa lógica. Radio local
 * = 1 (igual que la esfera: la silueta visible coincide con la hitbox real,
 * ver `HERO_RADIUS`) y alto local = 2.8 (más del doble del radio) para la
 * esbeltez pedida en ronda 7 — los pinchos del Erizo de Acero reproyectan su
 * posición a esta misma proporción en `HeroView.tsx` para no quedar flotando
 * fuera de la superficie (ver comentario allí).
 */
/*
 * Historial: radio 0.42 (fina) → 0.85 en playtest ronda 6 ("la hitbox
 * habría que ajustarla", el cilindro fino dejaba el cuerpo visible a ~42%
 * del diámetro de colisión y los golpes parecían injustos) → de vuelta a
 * fina en ronda 7 (2026-07-20, David: "la vela no me gusta así rechoncha...
 * has cambiado el modelo y no la hitbox, te pedí lo contrario"). Esta vez la
 * finura NO deja la hitbox de fuera: `HERO_RADIUS` (`hero/constants.ts`) baja
 * un ~37% junto con este cambio, así que radio local 1.0 (= la hitbox real,
 * como la esfera clásica de radio local 1) ES la silueta visible, sin
 * generosidad ni penalización — y el alto local sube a 2.8 (más del doble
 * del alto anterior) para conseguir la esbeltez pedida sin tocar el radio.
 * Todos los offsets dependientes (ojos, pinchos, llama, pivote de
 * inclinación) se recalculan en `HeroView.tsx` a partir de estos dos
 * números — ver comentario allí.
 */
export const heroCandleGeometry = new THREE.CylinderGeometry(1.0, 1.0, 2.8, 20);

/**
 * Cirios de sala de jefe (punto 2b de playtest, `BossCandlesView.tsx`, solo
 * dark>=1): atrezzo puro (sin colisión, la sim no los conoce), mismo par
 * cera/llama que el héroe-vela pero geometría/material propios (no
 * comparten mesh con el héroe: viven en varias instancias fijas a la vez por
 * sala). Cera un pelín más oscura que `HERO_WAX_COLOR` (recibe luz de
 * escena vía Lambert, a diferencia de la llama) para no competir visualmente
 * con el héroe como fuente de luz principal.
 */
export const bossCandleWaxMaterial = new THREE.MeshLambertMaterial({ color: '#d8cdb4' });
/** Llama del cirio de jefe: autoiluminada (Basic), mismo cálido que `CandleLightView`/`candleFlameMaterial`. */
export const bossCandleFlameMaterial = new THREE.MeshBasicMaterial({ color: '#ffb469' });

/**
 * Antorcha de muro (`TorchView.tsx`, playtest rama `estilo-oscuro`: "los
 * cirios de los jefes parece que puedes chocar con ellos... más pequeños y
 * pegados a la pared, como antorchas"): geometría propia, más pequeña y
 * afilada que `bossCandleWaxGeometry`, pensada para leerse pegada al muro en
 * vez de como una columna suelta en mitad de la sala. Reutiliza los MISMOS
 * materiales cera/llama que el cirio de jefe (mismo cálido, atrezzo
 * coherente en toda la mazmorra).
 */
export const wallTorchWaxGeometry = new THREE.CylinderGeometry(0.1, 0.12, 0.7, 10);

/**
 * Llama de la vela del héroe: MUTABLE, mismo criterio que `heroMaterial` en
 * dark=0 — HeroView.tsx interpola su color hacia `WEAPON_COLOR[weaponMode]`
 * cada frame con la misma rigidez (`WEAPON_COLOR_LERP_STIFFNESS`). Autoiluminada
 * (Basic): una llama no depende de la luz de escena.
 */
export const candleFlameMaterial = new THREE.MeshBasicMaterial({ color: WEAPON_COLOR.body.clone() });
/** Ojos de la vela (carita simple del concept): óvalos negros, reutiliza smallDotGeometry escalada. */
export const candleEyeMaterial = new THREE.MeshBasicMaterial({ color: '#14121a' });

/** Vigía de hollín (dummy): campana/farolillo — ojos cálidos ovalados. */
export const dummyEyeGlowMaterial = new THREE.MeshBasicMaterial({ color: '#ffc169' });
/** Falda cónica oscura de la campana del Vigía. */
export const dummySkirtMaterial = new THREE.MeshLambertMaterial({ color: '#1c1a20' });

/** Acechador del Umbral (chaser): ojos rasgados violeta. */
export const chaserEyeGlowMaterial = new THREE.MeshBasicMaterial({ color: '#b18cff' });
/** Penitente de Púas (spike): un único ojo cálido grande frontal. */
export const spikeEyeGlowMaterial = new THREE.MeshBasicMaterial({ color: '#ffb36b' });
/** Aguaboca (shooter): interior del tubo/cañón en reposo (piedra oscura apagada) y al cargar (azul brillante). */
export const shooterTubeRestMaterial = new THREE.MeshBasicMaterial({ color: '#2a2730' });
export const shooterTubeGlowMaterial = new THREE.MeshBasicMaterial({ color: '#7cc7ff' });

/** Snapshot de todo lo que `applySilhouettes` puede mutar, capturado antes de la primera mutación. */
const SILHOUETTE_ORIGINAL = {
  hero: snapshotColor(heroMaterial),
  dummy: snapshotColor(dummyMaterial),
  chaser: snapshotColor(chaserMaterial),
  spike: snapshotColor(spikeMaterial),
  spikeCone: snapshotColor(spikeConeMaterial),
  trail: {
    color: snapshotColor(trailMaterial),
    transparent: trailMaterial.transparent,
    opacity: trailMaterial.opacity,
    emissive: trailMaterial.emissive.clone(),
    emissiveIntensity: trailMaterial.emissiveIntensity,
  },
  shooter: snapshotColor(shooterMaterial),
  bossBody: snapshotColor(bossBodyMaterial),
  guardianBody: snapshotColor(guardianBodyMaterial),
  guardianHorn: {
    color: snapshotColor(guardianHornMaterial),
    emissive: guardianHornMaterial.emissive.clone(),
    emissiveIntensity: guardianHornMaterial.emissiveIntensity,
  },
  queenBody: snapshotColor(queenBodyMaterial),
  queenCrown: {
    emissive: queenCrownMaterial.emissive.clone(),
    emissiveIntensity: queenCrownMaterial.emissiveIntensity,
  },
  stormBody: snapshotColor(stormBodyMaterial),
};

/** Aplica (`active=true`) o restaura (`active=false`) las siluetas oscuras de personajes. Idempotente. */
function applySilhouettes(active: boolean): void {
  if (active) {
    // Héroe = vela: cuerpo de cera pálida fijo (HeroView.tsx deja de lerpear
    // heroMaterial.color en dark>=1; el color de arma vive solo en la llama).
    heroMaterial.color.set(HERO_WAX_COLOR);
    // Emissive tenue de cera: con la luz a la altura del cuerpo (0.75, bajo
    // los muros) los laterales del cilindro reciben luz rasante y quedaban
    // negros — la vela debe leerse pálida en la oscuridad (concept art).
    heroMaterial.emissive.set('#8a7a58');
    heroMaterial.emissiveIntensity = 0.5;

    // Vigía de hollín (dummy): campana oscura.
    dummyMaterial.color.set('#242129');
    // Acechador del Umbral (chaser): figura alta y fina, casi negra.
    chaserMaterial.color.set('#0d0c12');
    // Penitente de Púas (spike): bola y conos de piedra oscura.
    spikeMaterial.color.set('#211f26');
    spikeConeMaterial.color.set('#17151b');
    // Lacrimera (trail): gota pálida translúcida con brillo interior violeta.
    trailMaterial.color.set('#cfc4e8');
    trailMaterial.transparent = true;
    trailMaterial.opacity = 0.85;
    trailMaterial.emissive.set('#b18cff');
    trailMaterial.emissiveIntensity = 0.25;
    // Aguaboca (shooter): pedrusco oscuro.
    shooterMaterial.color.set('#232028');

    // Jefes (GDD §15): NO se remodela su composición, solo se oscurece el
    // cuerpo y se da un pelín de emissive a acentos ya existentes para que se
    // lean en la oscuridad (prismaCoreMaterial sigue el arma, ya es legible).
    bossBodyMaterial.color.set('#26232c');
    guardianBodyMaterial.color.set('#242229');
    guardianHornMaterial.color.set('#18161c');
    guardianHornMaterial.emissive.set('#d9a531');
    guardianHornMaterial.emissiveIntensity = ACCENT_EMISSIVE_INTENSITY;
    queenBodyMaterial.color.set('#221f2a');
    queenCrownMaterial.emissive.set('#9fd65c');
    queenCrownMaterial.emissiveIntensity = ACCENT_EMISSIVE_INTENSITY;
    stormBodyMaterial.color.set('#20242e');
  } else {
    heroMaterial.color.copy(SILHOUETTE_ORIGINAL.hero);
    // Emissive de cera fuera: el Lambert clásico nace con emissive negro.
    heroMaterial.emissive.set('#000000');
    heroMaterial.emissiveIntensity = 1;
    dummyMaterial.color.copy(SILHOUETTE_ORIGINAL.dummy);
    chaserMaterial.color.copy(SILHOUETTE_ORIGINAL.chaser);
    spikeMaterial.color.copy(SILHOUETTE_ORIGINAL.spike);
    spikeConeMaterial.color.copy(SILHOUETTE_ORIGINAL.spikeCone);
    trailMaterial.color.copy(SILHOUETTE_ORIGINAL.trail.color);
    trailMaterial.transparent = SILHOUETTE_ORIGINAL.trail.transparent;
    trailMaterial.opacity = SILHOUETTE_ORIGINAL.trail.opacity;
    trailMaterial.emissive.copy(SILHOUETTE_ORIGINAL.trail.emissive);
    trailMaterial.emissiveIntensity = SILHOUETTE_ORIGINAL.trail.emissiveIntensity;
    shooterMaterial.color.copy(SILHOUETTE_ORIGINAL.shooter);
    bossBodyMaterial.color.copy(SILHOUETTE_ORIGINAL.bossBody);
    guardianBodyMaterial.color.copy(SILHOUETTE_ORIGINAL.guardianBody);
    guardianHornMaterial.color.copy(SILHOUETTE_ORIGINAL.guardianHorn.color);
    guardianHornMaterial.emissive.copy(SILHOUETTE_ORIGINAL.guardianHorn.emissive);
    guardianHornMaterial.emissiveIntensity = SILHOUETTE_ORIGINAL.guardianHorn.emissiveIntensity;
    queenBodyMaterial.color.copy(SILHOUETTE_ORIGINAL.queenBody);
    queenCrownMaterial.emissive.copy(SILHOUETTE_ORIGINAL.queenCrown.emissive);
    queenCrownMaterial.emissiveIntensity = SILHOUETTE_ORIGINAL.queenCrown.emissiveIntensity;
    stormBodyMaterial.color.copy(SILHOUETTE_ORIGINAL.stormBody);
  }
  // El toggle de `transparent` de arriba (trailMaterial) cambia el programa
  // de blending del material: fuerza recompilación de shader (GameRoot ya
  // hace un scene.traverse equivalente al cambiar `dark`, esto es insurance
  // barata e idempotente si algo llega a mutar el material fuera de ese flujo).
  trailMaterial.needsUpdate = true;
}

/**
 * Punto de entrada ÚNICO de la penumbra experimental: aplica (o restaura)
 * TODAS las mutaciones de materiales de este bloque según `dark`/`glow`
 * actuales. IDEMPOTENTE — puede llamarse con cualquier combinación de
 * argumentos, cualquier número de veces, sin degradar nada (siempre parte de
 * los originales capturados arriba). `dark=0` deja TODO restaurado: paridad
 * EXACTA con `main`.
 */
export function applyDarkMaterials(
  dark: 0 | 1 | 2,
  glow: { fosos: boolean; hazards: boolean; items: boolean; puertas: boolean },
): void {
  const active = dark >= 1;
  applyToneDark(active, glow.hazards);
  applyEmissiveGroup(HAZARDS_GLOW_TARGETS, active && glow.hazards);
  applyEmissiveGroup(ITEMS_GLOW_TARGETS, active && glow.items);
  applyEmissiveGroup(PUERTAS_GLOW_TARGETS, active && glow.puertas);
  applySilhouettes(active);
}

// Suscripción fuera de React (menú de pausa → useDarkStore → aquí) + llamada
// inicial con el valor de arranque (mismo default de siempre: dark=1, todos
// los grupos de `?glow=` activos si no se pasó el parámetro).
useDarkStore.subscribe((state) => applyDarkMaterials(state.dark, state.glow));
applyDarkMaterials(useDarkStore.getState().dark, useDarkStore.getState().glow);

/**
 * Borde tenue del foso (grupo "fosos" de `?glow=`): quad Basic (autoemisivo)
 * ligeramente MÁS GRANDE que el quad negro del foso, pintado justo debajo —
 * el margen que asoma alrededor es el "aro" que se intuye en la penumbra. Sin
 * geometría nueva: mismo `unitPlane`, solo un tamaño distinto por hazard (ver
 * HazardView.tsx `PitQuad`).
 */
export const pitGlowMaterial = new THREE.MeshBasicMaterial({
  color: '#3fd8ff',
  transparent: true,
  opacity: 0.2,
  depthWrite: false,
});

// ── Halos de brillo real (rama `estilo-oscuro`, punto 2 de playtest: "se ven
// las monedas de otra habitación sin iluminar nada"): disco autoemisivo bajo
// cada objeto brillante, `AdditiveBlending` + `depthWrite:false` para que se
// lea como un charco de luz sobre el suelo (nunca como una pegatina opaca) y
// no compita en el z-buffer con el propio objeto. Reutiliza SIEMPRE
// `glowHaloTexture` (blanca→transparente, generada una vez en `assets.ts`);
// el color de cada halo es el `color` propio del material — no hace falta
// textura por objeto. Gateado en runtime por grupo de `?glow=`/el store
// (mismo criterio que el aro del foso de arriba) y SOLO dark>=1: los
// componentes leen esto con un selector de `useDarkStore` (dark-store.ts),
// nunca de una constante fija de carga de módulo — ver ItemView.tsx/
// RoomView.tsx.

/** Halo de moneda: dorado, mismo tono que `coinMaterial`. */
export const coinGlowHaloMaterial = new THREE.MeshBasicMaterial({
  map: glowHaloTexture,
  color: '#ffd166',
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  opacity: 0.16,
});
/** Halo de llave: dorado pálido, mismo tono que `keyMaterial`. */
export const keyGlowHaloMaterial = new THREE.MeshBasicMaterial({
  map: glowHaloTexture,
  color: '#ffe082',
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  opacity: 0.16,
});
/** Halo de poción: rosa, mismo tono que `potionMaterial` (algo más tenue: la poción es más pequeña que la moneda/llave a efectos de "charco de luz"). */
export const potionGlowHaloMaterial = new THREE.MeshBasicMaterial({
  map: glowHaloTexture,
  color: '#ff6bcb',
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  opacity: 0.12,
});
/** Halo de puerta normal: azul, mismo tono que `doorMaterial` (el más tenue de todos: un portón entero ya es grande, no debe deslumbrar). */
export const doorGlowHaloMaterial = new THREE.MeshBasicMaterial({
  map: glowHaloTexture,
  color: '#5a6db3',
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  opacity: 0.1,
});
/** Halo de puerta de jefe (requiere llave): dorado, mismo tono que `doorKeyMaterial` — algo más intenso que la puerta normal (es la puerta "importante"). */
export const doorKeyGlowHaloMaterial = new THREE.MeshBasicMaterial({
  map: glowHaloTexture,
  color: '#d9a531',
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  opacity: 0.14,
});
