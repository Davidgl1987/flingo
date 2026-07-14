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
/** Cilindro unitario (diámetro 1, alto 1): barriles y otros cuerpos redondos. */
export const unitCylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
/** Cono direccional para el hocico/telegrafiado de enemigos (Dummy/Chaser/Shooter). */
export const unitCone = new THREE.ConeGeometry(0.5, 1, 12);
/** Púa del Spike: pirámide alargada apuntando en +Z local. */
export const unitSpike = new THREE.ConeGeometry(0.35, 0.9, 6);
/**
 * Aguja fina del hazard de pinchos del suelo (punto 1 de playtest: "los
 * pinchos no lo parecen"): mucho más estrecha/afilada que `unitSpike` (que es
 * la púa gruesa del enemigo Spike) para poder instanciar un campo denso de
 * conos apuntando hacia arriba sin que se toquen entre sí.
 */
export const unitSpikeNeedle = new THREE.ConeGeometry(0.09, 0.32, 6);

// ── Geometrías de proyectiles con forma (puntos 2/3/11 de playtest) ───────

/** Asta corta de la flecha, detrás del cono dominante (eje +Y local; se rota para alinear con +Z al orientarla). */
export const arrowShaftGeometry = new THREE.CylinderGeometry(0.035, 0.035, 1, 8);
/** Segmento del zigzag eléctrico del hechizo: caja alargada instanciada (grosor visible, punto 11). */
export const spellBoltSegmentGeometry = new THREE.BoxGeometry(0.045, 0.045, 1);
/** Chispa de la estela del hechizo: tetraedro minúsculo (barato, distinto de las partículas esféricas normales). */
export const spellSparkGeometry = new THREE.TetrahedronGeometry(1, 0);

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

/**
 * Color del héroe por modo de arma activo (punto 1 de playtest ronda 3): el
 * cuerpo del héroe, su estela y el indicador de puntería cambian al mismo
 * color que su arma seleccionada — mismo lenguaje visual ya usado por
 * WeaponBar (`weapon-btn-<mode>`) y por los proyectiles (arrowMaterial /
 * spellMaterial más abajo). Único punto de verdad para no divergir del CSS.
 */
export const WEAPON_COLOR: Record<'body' | 'arrow' | 'spell', THREE.Color> = {
  body: new THREE.Color('#54c7ff'),
  arrow: new THREE.Color('#fef08a'),
  spell: new THREE.Color('#d8b4fe'),
};

/**
 * Material del héroe: MUTABLE (color interpolado cada frame por HeroView
 * según el arma activa, vía `heroMaterial.color.lerp(...)`), a diferencia del
 * resto de materiales de este fichero que son inmutables una vez creados. Es
 * un único objeto compartido (no se recrea nunca), así que sigue cumpliendo
 * "materiales compartidos, creados una vez": solo cambia su propiedad color.
 */
export const heroMaterial = new THREE.MeshLambertMaterial({ color: WEAPON_COLOR.body.clone() });
/**
 * Suelo de sala: ligeramente más claro que el fondo/foso para que los fosos
 * (casi negros) sean inconfundibles a primera vista (GDD §14: legibilidad).
 * Aclarado un punto más (feedback de playtest, punto 4: "prefiero contraste
 * entre el color del suelo y de los fosos") respecto al `#2d3352` original.
 */
export const floorMaterial = new THREE.MeshLambertMaterial({ color: '#464b67' });
export const wallMaterial = new THREE.MeshLambertMaterial({ color: '#3b4266' });
export const rockMaterial = new THREE.MeshLambertMaterial({ color: '#767d99' });
/** Portón de puerta cerrada (se abre al limpiar la sala). */
export const doorMaterial = new THREE.MeshLambertMaterial({ color: '#5a6db3' });
/** Portón de la puerta del jefe (requiere llave): dorado, inconfundible. */
export const doorKeyMaterial = new THREE.MeshLambertMaterial({ color: '#d9a531' });

export const blobShadowMaterial = new THREE.MeshBasicMaterial({
  map: createRadialTexture(),
  transparent: true,
  depthWrite: false,
});

/**
 * Indicador de puntería: MUTABLE igual que `heroMaterial` (punto 1 de
 * playtest ronda 3) — AimIndicatorView interpola su color hacia
 * `WEAPON_COLOR[weaponMode]` cada frame.
 */
export const aimDotMaterial = new THREE.MeshBasicMaterial({
  color: WEAPON_COLOR.body.clone(),
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
/** Flash blanco al recibir daño: material único intercambiado temporalmente por features/enemies/EnemyViews. */
export const enemyHitFlashMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
/** Telegrafiado de carga del Shooter: disco pulsante bajo sus pies. */
export const shooterTelegraphMaterial = new THREE.MeshBasicMaterial({
  color: '#ff3b3b',
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});

// ── Jefes (GDD §15): cuerpo genérico + anillo de telegraph/vulnerabilidad ──
// compartidos por CUALQUIER jefe (B1-B4 los reutilizan); el jefe de pruebas
// de la Fase B0 los usa directamente sin composición propia.

/** Cuerpo por defecto de un jefe (B1-B4 pueden sustituirlo por su propia composición, ver EnemyViews). */
export const bossBodyMaterial = new THREE.MeshLambertMaterial({ color: '#7a3fd6' });
/** Anillo de telegraph genérico (GDD §15.1 punto 2: aviso visible antes de cualquier ataque). */
export const bossTelegraphMaterial = new THREE.MeshBasicMaterial({
  color: '#ffe083',
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
});
/** Anillo de ventana de vulnerabilidad (GDD §15.1 punto 4): verde, inconfundible frente al ámbar del telegraph. */
export const bossVulnerableMaterial = new THREE.MeshBasicMaterial({
  color: '#4dd68a',
  transparent: true,
  opacity: 0.7,
  depthWrite: false,
});
/** Flash de cambio de fase (GDD §15.1 punto 3): breve destello blanco-cálido en todo el cuerpo. */
export const bossPhaseFlashMaterial = new THREE.MeshBasicMaterial({ color: '#fff2c9' });

// ── Guardián de Canto (GDD §15.2, Fase B1): cuerpo pétreo propio ───────────

/** Cuerpo del Guardián: piedra gris-azulada, distinta de cualquier enemigo normal y del violeta genérico de jefe. */
export const guardianBodyMaterial = new THREE.MeshLambertMaterial({ color: '#5b6270' });
/** Hombros/cuernos: tono más oscuro, silueta "pesada" reconocible. */
export const guardianHornMaterial = new THREE.MeshLambertMaterial({ color: '#3c4048' });
/** Vetas del cuerpo pétreo: tono cálido tenue (ámbar apagado), sugiere el "canto" que le da nombre. */
export const guardianVeinMaterial = new THREE.MeshBasicMaterial({ color: '#d9a531' });
/** Brillo/vibración del telegraph (GDD §15.2 "brilla y vibra"): sustituye al cuerpo entero mientras avisa. */
export const guardianTelegraphGlowMaterial = new THREE.MeshBasicMaterial({ color: '#ffb84d' });
/** Estrellitas del aturdimiento (estado INCONFUNDIBLE, entregable 3): doradas, orbitan sobre la cabeza. */
export const guardianStunStarMaterial = new THREE.MeshBasicMaterial({ color: '#fff2c9' });
/** Partícula de polvo de la carga: se emite como evento (burstTable.ts); geometría reutilizada de unitSphere. */
export const guardianDustMaterial = new THREE.MeshBasicMaterial({
  color: '#8d8367',
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
});
/** Cuerno/hombro del Guardián: cono corto y ancho (más "roca tallada" que púa afilada). */
export const guardianHornGeometry = new THREE.ConeGeometry(0.32, 0.55, 6);
/** Estrellita del aturdimiento: tetraedro minúsculo, barato, orbitando. */
export const guardianStunStarGeometry = new THREE.TetrahedronGeometry(1, 0);

// ── Reina del Enjambre (GDD §15.3, Fase B2): cuerpo propio + corona ────────

/** Cuerpo de la Reina: violeta-verdoso oscuro, grande y distinto del Guardián (piedra) y del genérico de jefe. */
export const queenBodyMaterial = new THREE.MeshLambertMaterial({ color: '#5c2a6e' });
/** Púas de la corona: dorado-verdoso, evoca "enjambre"/insecto sin copiar el ámbar del Guardián. */
export const queenCrownMaterial = new THREE.MeshLambertMaterial({ color: '#9fd65c' });
/** Pulso de invocación (GDD §15.3): breve anillo verdoso que se expande al soltar una oleada de larvas. */
export const queenSummonPulseMaterial = new THREE.MeshBasicMaterial({
  color: '#4dd68a',
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});
/** Púa de la corona: cono fino y alargado (silueta de insecto/enjambre), distinto del cuerno romo del Guardián. */
export const queenCrownSpikeGeometry = new THREE.ConeGeometry(0.14, 0.5, 6);

// ── Columnas de la Reina (T2 render, rediseño 2026-07-10, GDD §15.3): la
// intacta reutiliza `rockMaterial` (misma silueta que cualquier roca hasta
// que se agrieta); agrietada/escombros son variantes propias. Ver
// QueenColumnsView.tsx.

/**
 * Columna dañada, 3 niveles de hp (QUEEN_COLUMN_HP=3, playtest 2026-07-10:
 * "debe leerse de un vistazo cuántos golpes le quedan"): cuanto más baja el
 * hp, más oscuro el tono — degradado desde `rockMaterial` (intacta, hp=3).
 */
/** hp=2 (leve, tras el 1.er golpe): tono intermedio entre la roca intacta y la agrietada grave — "le quedan 2 golpes". */
export const queenColumnCrackedLightMaterial = new THREE.MeshLambertMaterial({ color: '#63667f' });
/** hp=1 (grave, tras el 2.º golpe): mismo tono base que la roca pero bastante más oscuro — "le queda un golpe". */
export const queenColumnCrackedMaterial = new THREE.MeshLambertMaterial({ color: '#4a4a56' });
/** Grieta visible sobre la cara de una columna agrietada: franja casi negra, fina, cruzando en diagonal (se reutiliza para hp=2 y hp=1, con escala más corta/fina en hp=2). */
export const queenColumnCrackStripeMaterial = new THREE.MeshBasicMaterial({ color: '#111116' });
/** Restos/escombros tras romperse del todo: mancha baja y muy oscura en el suelo, marca que ahí hubo una columna. */
export const queenColumnDebrisMaterial = new THREE.MeshLambertMaterial({ color: '#2e2e38' });

/**
 * Cuerda/cordón que une a la Reina con cada columna aún en pie: cilindro
 * fino orgánico, PRE-ROTADO en la propia geometría (una vez, a nivel de
 * módulo) para que su eje largo sea +Z local en vez de +Y — mismo patrón que
 * `spellBoltSegmentGeometry` (ProjectileView): el componente solo necesita
 * `rotation.y = atan2(dx, dy)` + `scale.z = longitud` cada frame, sin tocar
 * la geometría base.
 */
export const queenTetherGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1, 6).rotateX(Math.PI / 2);
/** Color orgánico rosa-enjambre (mismo tono que el burst de `boss-columns-cleared`): semitransparente, fino, inconfundible con las rocas/muros. */
export const queenTetherMaterial = new THREE.MeshBasicMaterial({
  color: '#ff6bcb',
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});

/**
 * Guardianas de la Reina (larvas embistiendo, GDD §15.3, rediseño 2026-07-10,
 * `enemy.bossStage`: 0=orbita, 1=telegrafía, 2=carga): aviso visual de que
 * van a embestir, mismo lenguaje ámbar=aviso ya usado por el resto de jefes
 * (`bossTelegraphMaterial`), sobre el cuerpo (que en reposo es el rojo
 * genérico de larva/Dummy) en vez de un anillo aparte, para que sea
 * inconfundible incluso entre el resto de larvas atacantes.
 */
/** Telegraph (bossStage=1): parpadea alternando con el rojo base — intercambiado por EnemyViews, nunca mutado. */
export const queenGuardianTelegraphMaterial = new THREE.MeshBasicMaterial({ color: '#ffe083' });
/** Carga (bossStage=2, opcional): tono rojo más intenso y saturado que el reposo — "ya viene, esquiva". */
export const queenGuardianChargeMaterial = new THREE.MeshBasicMaterial({ color: '#ff2d2d' });

// ── Personalidad de enemigos (punto 11 de playtest): geometrías/materiales
// compartidos para micro-detalles por arquetipo, sin tocar la sim ni la
// silueta/color de contrato del GDD. ──────────────────────────────────────

/** Ojo simple (esclerótica): esfera pequeña blanca, compartida por Dummy/Chaser. */
export const eyeWhiteMaterial = new THREE.MeshBasicMaterial({ color: '#f5f7ff' });
/** Pupila/iris oscuro sobre el ojo. */
export const eyePupilMaterial = new THREE.MeshBasicMaterial({ color: '#12131c' });
/** Ceja agresiva del Chaser: cuña oscura sobre el ojo. */
export const chaserBrowMaterial = new THREE.MeshBasicMaterial({ color: '#7a3a12' });
/** Cañón/ojo del Shooter en reposo: gris metálico apagado. */
export const shooterEyeMaterial = new THREE.MeshBasicMaterial({ color: '#4a5170' });
/** Cañón/ojo del Shooter mientras carga: rojo brillante (coherente con su telegraph). */
export const shooterEyeChargeMaterial = new THREE.MeshBasicMaterial({ color: '#ff5a5a' });
/** Gota de baba del Trail: mismo verde que su cuerpo, algo más oscuro. */
export const trailDripMaterial = new THREE.MeshBasicMaterial({
  color: '#2f9464',
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
});

/** Esfera pequeña para ojos/pupilas/gotas (radio unitario, se escala en el componente). */
export const smallDotGeometry = new THREE.SphereGeometry(1, 10, 8);
/** Cuña de ceja/cañón: caja fina reutilizable. */
export const smallWedgeGeometry = new THREE.BoxGeometry(1, 1, 1);

// ── Proyectiles ────────────────────────────────────────────────────────────

// Colores alineados con los botones de arma del HUD (mapeo instantáneo
// botón↔proyectil, feedback de playtest): flecha amarilla, hechizo violeta.
export const arrowMaterial = new THREE.MeshLambertMaterial({ color: '#fef08a' });
/** Asta de la flecha (detrás del cono dominante): tono más oscuro, silueta de flecha reconocible. */
export const arrowTipMaterial = new THREE.MeshLambertMaterial({ color: '#d4a017' });
export const spellMaterial = new THREE.MeshLambertMaterial({ color: '#d8b4fe' });
/** Zigzag eléctrico del hechizo (ronda 3, punto 11: sin núcleo, solo rayo): violeta más saturado/luminoso que el cuerpo. */
export const spellBoltMaterial = new THREE.MeshBasicMaterial({
  color: '#c084fc',
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
});
/** Chispas violetas de la estela del hechizo. */
export const spellSparkMaterial = new THREE.MeshBasicMaterial({
  color: '#e9d5ff',
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
});
export const enemyProjectileMaterial = new THREE.MeshLambertMaterial({ color: '#ff3b3b' });

// ── Hazards ────────────────────────────────────────────────────────────────

/**
 * Foso: negro casi absoluto (agujero), inconfundible contra el suelo claro
 * por sí solo (ronda 3, punto 6: sin reborde — ver HazardView.tsx `PitQuad`).
 */
export const pitMaterial = new THREE.MeshBasicMaterial({ color: '#010102' });
export const spikesMaterial = new THREE.MeshLambertMaterial({ color: '#8d94ad' });
/** Agujas del campo de pinchos: metálico/hueso claro, contraste fuerte con el suelo (punto 1 de playtest). */
export const spikesNeedleMaterial = new THREE.MeshLambertMaterial({ color: '#e7e4d8' });
export const barrelMaterial = new THREE.MeshLambertMaterial({ color: '#c0442b' });
/** Aros metálicos del barril (silueta de barril reconocible). */
export const barrelHoopMaterial = new THREE.MeshLambertMaterial({ color: '#e8d9a0' });
/** Mancha chamuscada que queda tras explotar un barril. */
export const scorchMaterial = new THREE.MeshBasicMaterial({
  color: '#0a0a0f',
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});
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

// ── Objetos (puntos 9 y 10 de playtest: moneda-moneda, poción-frasco) ─────

export const coinMaterial = new THREE.MeshLambertMaterial({ color: '#ffd166' });
/** Canto de la moneda: tono algo más oscuro, para que se note el volumen al girar. */
export const coinRimMaterial = new THREE.MeshLambertMaterial({ color: '#c98f1b' });
export const potionMaterial = new THREE.MeshLambertMaterial({ color: '#ff6bcb' });
/** Cuello/tapón del frasco de poción: vidrio/corcho más oscuro que el cuerpo. */
export const potionCapMaterial = new THREE.MeshLambertMaterial({ color: '#7a1f4d' });
export const keyMaterial = new THREE.MeshLambertMaterial({ color: '#ffe082' });

/**
 * Tendero placeholder de la sala de tienda (docs/plans/ECONOMY_PLAN.md F4):
 * visual mínimo (túnica cónica + cabeza) a propósito — el feedback fino de
 * personajes llega en F5, esto solo necesita ser legible como NPC.
 */
export const shopkeeperRobeMaterial = new THREE.MeshLambertMaterial({ color: '#7bd88f' });
export const shopkeeperHeadMaterial = new THREE.MeshLambertMaterial({ color: '#e8c39e' });

/** Moneda: cilindro plano (diámetro 1, canto 0.16) — se escala por el radio deseado en el componente. */
export const coinGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.16, 20);
/** Cuerpo bulboso del frasco de poción: esfera achatada verticalmente. */
export const potionBodyGeometry = new THREE.SphereGeometry(1, 16, 12);
/** Cuello fino del frasco. */
export const potionNeckGeometry = new THREE.CylinderGeometry(0.3, 0.38, 1, 12);
/** Tapón/corcho en la boca del frasco. */
export const potionCapGeometry = new THREE.CylinderGeometry(0.4, 0.36, 1, 12);
