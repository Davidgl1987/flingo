/**
 * Assets compartidos: geometrías y materiales creados UNA vez a nivel de
 * módulo. Prohibido crear materiales/geometrías dentro de componentes.
 * Paleta plana, materiales lambert/basic (sin PBR, sin sombras dinámicas).
 */

import * as THREE from 'three';
import { useDarkStore } from './dark-store';

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

/**
 * Textura radial BLANCA (centro opaco → borde transparente), generada UNA vez
 * y reutilizada por TODOS los halos de brillo falso (rama `estilo-oscuro`,
 * punto 2 de playtest: "las monedas se ven de otra habitación sin iluminar
 * nada"). A diferencia de `createRadialTexture` (negra, para blob shadows),
 * esta es blanca porque cada halo la tiñe multiplicando por `material.color`
 * con blending ADITIVO (ver más abajo) — así un único mapa sirve para
 * cualquier color de brillo sin generar una textura por objeto.
 */
function createGlowHaloTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.35)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Mapa radial blanco→transparente compartido por todos los halos de brillo (ver `createGlowHaloTexture`). */
export const glowHaloTexture = createGlowHaloTexture();

// ── Materiales ────────────────────────────────────────────────────────────

/**
 * Color del héroe por modo de arma activo (punto 1 de playtest ronda 3): el
 * cuerpo del héroe, su estela y el indicador de puntería cambian al mismo
 * color que su arma seleccionada — mismo lenguaje visual ya usado por
 * WeaponBar (`weapon-btn-<mode>`) y por los proyectiles (arrowMaterial /
 * spellMaterial más abajo). Único punto de verdad para no divergir del CSS.
 */
/**
 * Intercambio de colores cuerpo↔flecha (feedback de playtest, rama
 * `estilo-oscuro`): cuerpo pasa a amarillo, flecha pasa al azul que antes
 * tenía el cuerpo; hechizo no cambia. Afecta a TODOS los modos (dark 0/1/2),
 * a diferencia del resto de este bloque de cambios — ver también
 * `weapon-bar.css` (.weapon-btn-body/.weapon-btn-arrow) y
 * `UpgradeIcon.tsx` (CATEGORY_COLOR), que copian estos mismos valores.
 */
export const WEAPON_COLOR: Record<'body' | 'arrow' | 'spell', THREE.Color> = {
  body: new THREE.Color('#fef08a'),
  arrow: new THREE.Color('#54c7ff'),
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

// ── Feedback visual de mejoras sobre el héroe (docs/plans/ECONOMY_PLAN.md F5) ──

/**
 * Pincho del Erizo de Acero (cuerpo-dano): proporciones pensadas para vivir
 * como HIJO del mesh del héroe (esfera unitaria), así hereda gratis su
 * squash/stretch y el escalado extra de Canto Rodado sin cálculo aparte
 * (ver HeroView). Centrado en la superficie de la esfera unitaria: mitad
 * incrustado, mitad asomando.
 */
export const heroSpikeGeometry = new THREE.ConeGeometry(0.13, 0.4, 6);
/** Acento "acero" de los pinchos: gris-azulado metálico, legible sobre cualquier color de arma del cuerpo. */
export const heroSpikeMaterial = new THREE.MeshLambertMaterial({ color: '#c9d3e6' });

/**
 * Burbuja de Cuarzo (escudo): esfera semitransparente que envuelve la bola
 * mientras `hero.modifiers.shieldCharges > 0`. MUTABLE (opacidad ajustada
 * por HeroView según nº de cargas), igual que `heroMaterial`/`aimDotMaterial`
 * — un único héroe activo a la vez, así que es seguro mutar el material
 * compartido en vez de recrearlo cada frame.
 */
export const heroShieldMaterial = new THREE.MeshBasicMaterial({
  color: '#8fe3ff',
  transparent: true,
  opacity: 0.3,
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

// ── El Prisma (GDD §15.4, Fase B3): núcleo con el color del arma activa ────

/**
 * Núcleo del Prisma: MUTABLE (color actualizado cada frame según el arma
 * activa/telegraph de cambio, ver EnemyViews.tsx), mismo criterio que
 * `heroMaterial` — un único Prisma vivo a la vez, así que es seguro mutar el
 * material compartido en vez de recrearlo. Arranca en el color de "cuerpo"
 * (mismo mapeo que `WEAPON_COLOR` del héroe: instantáneo arma↔color).
 */
export const prismaCoreMaterial = new THREE.MeshLambertMaterial({ color: WEAPON_COLOR.body.clone() });
/** Gemas orbitantes del Prisma (silueta propia, GDD §15.4): tono neutro cristalino, no compite con el color del núcleo. */
export const prismaGemMaterial = new THREE.MeshLambertMaterial({ color: '#cbd5f5' });
/**
 * Gema pequeña: octaedro (silueta distinta de los cuernos del Guardián / la
 * corona de la Reina). El chispazo "inmune" (evento 'boss-immune-hit') no
 * necesita material propio: reutiliza el sistema de partículas genérico vía
 * `burstTable.ts` (blanco, barato), sin tocar EnemyViews.
 */
export const prismaGemGeometry = new THREE.OctahedronGeometry(0.22);

// ── La Tormenta (GDD §15.5, Fase B4): cuerpo tormentoso + halo de patrón ───

/** Cuerpo de La Tormenta: gris-azulado tormentoso, distinto de la piedra del Guardián, el violeta-verdoso de la Reina y el núcleo mutable del Prisma. */
export const stormBodyMaterial = new THREE.MeshLambertMaterial({ color: '#3a4a63' });
/**
 * Pose de recarga (GDD §15.5: "aviso visual claro" de la ventana de
 * vulnerabilidad): sustituye al cuerpo entero por un tono pálido/apagado
 * mientras `bossStage===STORM_STAGE_RELOAD` — inconfundible frente al
 * gris-azulado tormentoso normal, mismo criterio de intercambio de material
 * que `guardianTelegraphGlowMaterial`.
 */
export const stormReloadCoreMaterial = new THREE.MeshBasicMaterial({ color: '#dce8f2' });
/**
 * Halo "anillo de Saturno segmentado" que envuelve el cuerpo (silueta de "ojo
 * de la tormenta", distinta de cuernos/corona/gemas del resto de jefes).
 * Rediseño post-playtest 2026-07-15 (David: "haría que el anillo fuera
 * siempre como el anillo de Saturno, en horizontal, y que se iluminara por
 * partes... de la forma en la que van a salir las bolas"): el toro-arco
 * giratorio anterior se leía INCLINADO/verticalizado en playtest (causa
 * raíz: combinar una `rotation-x` estática con una `rotation.y` mutada cada
 * frame en el MISMO mesh compone en espacio de Euler local, y NO equivale a
 * "girar un anillo plano sobre su propio eje" — ver comentario largo en
 * `EnemyViews.tsx::applyStormHaloMotion`, ahora eliminado). El nuevo diseño
 * NUNCA rota el mesh tras montarlo: `STORM_HALO_SEGMENTS` copias
 * INSTANCIADAS de un pequeño arco, cada una en un ángulo FIJO de un grid
 * (`i · 2π/N`), con la geometría pre-rotada UNA vez (`rotateZ`+`rotateX`, ver
 * abajo) para quedar SIEMPRE plana en el plano horizontal (XZ) — "cuál
 * sección se ilumina" se decide en `EnemyViews.tsx` mutando SOLO el color por
 * instancia cada frame (mismo patrón `setColorAt`/`instanceColor` que
 * `TrailView.tsx`/`ParticleView.tsx`), nunca la rotación: cero riesgo de
 * cabeceo, sea cual sea el patrón telegrafiado.
 */
export const STORM_HALO_SEGMENTS = 32;
/**
 * Fracción del paso angular del grid (2π/32) que ocupa el arco visible de cada
 * sección. Playtest 2026-07-15 (David: "haz que los segmentos del anillo
 * estén unidos, que no se vea separación entre ellos"): antes 0.7 dejaba un
 * hueco real entre secciones contiguas (se leían como "cuentas" separadas);
 * ahora 1.02 cubre el paso completo con un pelín de solape (2%) que mata el
 * aliasing de la costura entre dos secciones adyacentes sin acumularse en un
 * salto visible — cada sección se centra en su propio ángulo de grid fijo
 * (`i · 2π/32`, ver `rotateZ` de abajo), así que el solape es siempre local a
 * cada costura, nunca una deriva que crezca vuelta tras vuelta. El anillo
 * ahora se lee como una cinta continua; lo que cambia por tramos es el color/
 * brillo (`setColorAt` en EnemyViews.tsx), no la geometría.
 */
const STORM_HALO_SEGMENT_FILL = 1.02;
/** Ángulo (rad) del arco visible de una sola sección instanciada. */
const STORM_HALO_SEGMENT_ARC = ((Math.PI * 2) / STORM_HALO_SEGMENTS) * STORM_HALO_SEGMENT_FILL;
/**
 * Geometría de UNA sección del anillo, pre-rotada dos veces al crearla (coste
 * único, cero por frame):
 * 1. `rotateZ(-arc/2)` centra el arco en el ángulo local 0 (por defecto
 *    `TorusGeometry` empieza su arco en 0 y crece hasta `arc`).
 * 2. `rotateX(π/2)` tumba el anillo (por defecto en el plano XY, "de pie"
 *    mirando a cámara) al plano XZ horizontal (estilo anillo de Saturno).
 * Con esto, el CENTRO visual del arco queda en el ángulo de mundo 0 cuando la
 * instancia no lleva ninguna rotación extra — cada instancia solo necesita UN
 * `rotation.y` para colocarse en su sección del grid (ver EnemyViews.tsx).
 */
export const stormHaloSegmentGeometry = new THREE.TorusGeometry(1, 0.09, 6, 4, STORM_HALO_SEGMENT_ARC);
stormHaloSegmentGeometry.rotateZ(-STORM_HALO_SEGMENT_ARC / 2);
stormHaloSegmentGeometry.rotateX(Math.PI / 2);
/**
 * Material compartido del `InstancedMesh` del halo: MUTABLE (opacidad global
 * actualizada cada frame según la fase del ciclo, ver EnemyViews.tsx), mismo
 * criterio que `prismaCoreMaterial` — un único jefe La Tormenta vivo a la
 * vez. `color` en blanco A PROPÓSITO: el tono real de cada sección lo aporta
 * `instanceColor` (mutado por instancia en EnemyViews.tsx); un material.color
 * no-blanco lo multiplicaría y ensuciaría el color de todas las secciones por
 * igual.
 */
export const stormHaloMaterial = new THREE.MeshBasicMaterial({
  color: '#ffffff',
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
});
/**
 * Tinte verdoso de "ventana de recarga abierta" (mismo verde que
 * `bossVulnerableMaterial`, GDD §15.5): en la 1ª mitad de la recarga TODAS
 * las secciones lo llevan uniforme (anillo verde sólido); en la 2ª mitad las
 * secciones se van fundiendo desde este verde hacia el color resuelto
 * (iluminada/apagada) del próximo patrón — mientras la ventana siga abierta
 * el halo nunca pierde del todo este tinte (EnemyViews.tsx).
 */
export const stormHaloReloadColor = new THREE.Color('#4dd68a');
/**
 * Tinte de SECCIÓN ILUMINADA (por ahí van a salir balas), índice =
 * STORM_PATTERN_* (machine-constants.ts): espiral/anillos comparten el azul
 * base del halo (su lectura ahora es puramente espacial — qué secciones se
 * iluminan —, no hace falta un cuarto color que distinguir); la ráfaga usa un
 * ámbar propio, de alerta, porque es el patrón más súbito (sin fase EXECUTE
 * propia: telegrafía y dispara).
 */
export const STORM_HALO_PATTERN_COLOR: readonly [THREE.Color, THREE.Color, THREE.Color] = [
  new THREE.Color('#8fd8ff'),
  new THREE.Color('#8fd8ff'),
  new THREE.Color('#ffb37a'),
];
/** Tinte de SECCIÓN APAGADA (zona segura, sin balas): gris-azulado oscuro y neutro, para que las secciones iluminadas destaquen con claridad. */
export const STORM_HALO_DIM_COLOR = new THREE.Color('#1b2530');

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
export const arrowMaterial = new THREE.MeshLambertMaterial({ color: '#54c7ff' });
/** Asta de la flecha (detrás del cono dominante): tono más oscuro, silueta de flecha reconocible. */
export const arrowTipMaterial = new THREE.MeshLambertMaterial({ color: '#1f6fa1' });
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

/** Cera pálida del cuerpo del héroe-vela: fija en dark>=1 (deja de lerpear con el arma; la llama de arriba es la que cambia de color). */
const HERO_WAX_COLOR = '#e8ddc8';

/**
 * Cuerpo del héroe-vela (punto 5 de playtest, rama `estilo-oscuro`): en
 * dark>=1 `HeroView.tsx` sustituye la esfera unitaria (`unitSphere`, radio 1)
 * por este cilindro CHATO ("vela, no torre") en el mismo mesh compartido
 * (`bodyRef`) — misma convención "unit-X, se escala por mesh" que el resto de
 * geometrías de este fichero: `HeroView.tsx` sigue aplicando exactamente el
 * mismo `visualRadius` de squash/stretch/caída-al-foso que ya usaba con la
 * esfera, sin tocar esa lógica. Radio/alto elegidos DIRECTAMENTE en las
 * unidades que pide el playtest (no relativos a otro "1" abstracto): al
 * escalar por `visualRadius` (igual que la esfera) da un cuerpo visiblemente
 * más bajo/ancho que la bola clásica — los pinchos del Erizo de Acero
 * reproyectan su posición a esta misma proporción en `HeroView.tsx` para no
 * quedar flotando fuera de la superficie (ver comentario allí).
 */
export const heroCandleGeometry = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 20);

/**
 * Cirios de sala de jefe (punto 2b de playtest, `BossCandlesView.tsx`, solo
 * dark>=1): atrezzo puro (sin colisión, la sim no los conoce), mismo par
 * cera/llama que el héroe-vela pero geometría/material propios (no
 * comparten mesh con el héroe: viven en varias instancias fijas a la vez por
 * sala). Cera un pelín más oscura que `HERO_WAX_COLOR` (recibe luz de
 * escena vía Lambert, a diferencia de la llama) para no competir visualmente
 * con el héroe como fuente de luz principal.
 */
export const bossCandleWaxGeometry = new THREE.CylinderGeometry(0.25, 0.28, 1.4, 12);
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
// `glowHaloTexture` (blanca→transparente, generada una vez arriba); el color
// de cada halo es el `color` propio del material — no hace falta textura por
// objeto. Gateado en runtime por grupo de `?glow=`/el store (mismo criterio
// que el aro del foso de arriba) y SOLO dark>=1: los componentes leen esto
// con un selector de `useDarkStore` (dark-store.ts), nunca de una constante
// fija de carga de módulo — ver ItemView.tsx/RoomView.tsx.

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
