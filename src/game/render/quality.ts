/**
 * Perfil de calidad adaptativo (bug reportado por David con captura,
 * 2026-07-21): en MÓVIL (Chrome Android) el juego se veía TODO NEGRO — solo
 * se distinguían la llama de la vela, los ojos y las monedas
 * (`MeshBasicMaterial`), mientras que suelo/muros/cuerpos
 * (`MeshLambertMaterial`) no se dibujaban. Reproducible también en
 * incógnito (no era caché) y perfecto en escritorio.
 *
 * DIAGNÓSTICO: el modo oscuro (rama `estilo-oscuro`) monta demasiadas luces
 * y demasiados shadow maps para una GPU móvil. En una sala con ~5 enemigos
 * hay ~17 luces simultáneas (vela + 5×[linterna+relleno] + pool de luces de
 * proyectil) y ~6 mapas de sombra: la vela del héroe (`CandleLightView.tsx`)
 * con `castShadow` → shadow map CÚBICO (pointLight) = 6 caras + 1
 * samplerCube, más una spotLight con `castShadow` POR CADA enemigo vivo
 * (`EnemyLights.tsx`, encendida/apagada en `EnemyViews.tsx`). Eso supera
 * `MAX_FRAGMENT_UNIFORM_VECTORS` y/o `MAX_TEXTURE_IMAGE_UNITS` en móvil: el
 * programa del shader Lambert no enlaza y three.js deja de dibujar esos
 * objetos (negro), mientras que los `MeshBasicMaterial` (que no dependen de
 * luces) sí enlazan — justo lo que se veía en la captura de David.
 *
 * Este módulo decide un perfil de calidad UNA sola vez, por CAPACIDADES
 * REALES del contexto WebGL (nunca por user-agent string: el sniffing de UA
 * es frágil y no dice nada del hardware real), y expone presupuestos
 * derivados que el resto del render (GameRoot/CandleLightView/EnemyLights/
 * EnemyViews/ProjectileView/BossCandlesView) consulta para decidir cuántas
 * luces/sombras montar. En escritorio (perfil 'alto') el comportamiento es
 * IDÉNTICO al de siempre — cero regresión visual: cada presupuesto de
 * `BUDGET_ALTO` reproduce exactamente los valores que ya existían antes de
 * este cambio.
 *
 * Resolución: `resolveQualityProfile` se llama UNA vez desde `onCreated` del
 * Canvas (GameRoot.tsx, que ya recibe `state.gl` — un `THREE.WebGLRenderer`,
 * de ahí `state.gl.getContext()` para el contexto WebGL crudo). React Three
 * Fiber garantiza que `onCreated` termina de ejecutarse ANTES de montar el
 * árbol de hijos del Canvas (`CanvasImpl` en
 * `@react-three/fiber/dist/react-three-fiber.esm.js`: hace `await
 * root.current.configure({ ..., onCreated })` y solo DESPUÉS llama a
 * `root.current.render(children)`), así que cualquier componente que lea el
 * store más abajo (CandleLightView, EnemyMesh, ProjectileLightPool...) ya ve
 * el perfil resuelto en su PRIMER render — el recuento de luces montadas
 * nunca cambia después de montar (misma invariante que ya documentan
 * `lightsGroupRef` en EnemyLights.tsx y `ProjectileLightPool` en
 * ProjectileView.tsx: cambiar el Nº de luces con sombra recompila shaders).
 */

import { create } from 'zustand';
import { readQualityOverride } from './debug-params';

export type QualityProfile = 'alto' | 'bajo';

/** Presupuestos derivados del perfil, consultados por el resto del render. */
export interface QualityBudget {
  profile: QualityProfile;
  /** Vela del héroe (CandleLightView) y linterna de enemigo (EnemyLights): `castShadow`. */
  shadowsEnabled: boolean;
  /** Linterna de ojos (spotLight) por enemigo no-jefe. */
  enemyLanternEnabled: boolean;
  /**
   * Relleno point por enemigo no-jefe. Se apaga en perfil bajo por RECUENTO,
   * no por coste individual: `EnemyViews` monta un componente por enemigo de
   * TODA la mazmorra (no solo los de la sala visible), así que su luz de
   * relleno se cuenta ×11 en una mazmorra típica — medido en preview: 24
   * luces montadas a la vez incluso ya sin sombras. Los ojos emisivos
   * (`MeshBasicMaterial`, no dependen de luz) siguen delatando al enemigo en
   * la oscuridad, que es justo la estética pedida ("los enemigos emiten poca
   * luz, los ojos y poco más").
   */
  enemyFillLightEnabled: boolean;
  /** Tamaño FIJO del pool de luces de proyectil (ProjectileView.tsx) durante toda la sesión. */
  projectileLightPoolSize: number;
  /**
   * Luz de las antorchas de muro. Mismo motivo de recuento que el relleno de
   * enemigo: las antorchas de la sala de jefe y de la tienda se montan desde
   * GameRoot para toda la mazmorra, no solo al entrar en esas salas (8
   * spotLights permanentes medidas en preview). La geometría de la antorcha y
   * su llama (Basic) se conservan: se siguen viendo, solo dejan de proyectar
   * resplandor propio.
   */
  wallTorchLightEnabled: boolean;
  /** Antorchas de muro también en los puntos medios de los muros largos (además de las 4 esquinas fijas). */
  wallTorchMidpoints: boolean;
}

/** Perfil 'alto' (escritorio, hoy): exactamente el comportamiento actual, sin recortes. */
const BUDGET_ALTO: QualityBudget = {
  profile: 'alto',
  shadowsEnabled: true,
  enemyLanternEnabled: true,
  enemyFillLightEnabled: true,
  projectileLightPoolSize: 6,
  wallTorchLightEnabled: true,
  wallTorchMidpoints: true,
};

/**
 * Perfil 'bajo' (GPU limitada): apaga las DOS fuentes de shadow map (vela +
 * linternas de enemigo → 0 sombras en toda la escena) y deja el recuento
 * TOTAL de luces en un puñado. Medido en preview con `?quality=bajo` antes de
 * este recorte: quitar solo las sombras dejaba aún 24 luces montadas (11
 * rellenos de enemigo + 8 antorchas de jefe/tienda + vela + pool), porque
 * esos componentes se montan para toda la mazmorra, no solo para la sala
 * visible. 24 luces sin sombra siguen siendo mucho para una GPU de gama baja
 * (uniforms del shader Lambert + coste de fill rate por fragmento), así que
 * el perfil bajo conserva solo lo imprescindible para que la escena se LEA:
 * la vela del héroe (fuente principal), la luz propia del jefe y un pool
 * mínimo de proyectiles ⇒ ~5-6 luces en total, con margen de sobra sobre
 * cualquier límite móvil real.
 */
const BUDGET_BAJO: QualityBudget = {
  profile: 'bajo',
  shadowsEnabled: false,
  enemyLanternEnabled: false,
  enemyFillLightEnabled: false,
  projectileLightPoolSize: 2,
  wallTorchLightEnabled: false,
  wallTorchMidpoints: false,
};

function budgetForProfile(profile: QualityProfile): QualityBudget {
  return profile === 'bajo' ? BUDGET_BAJO : BUDGET_ALTO;
}

/**
 * Umbrales de detección (ver diagnóstico de cabecera). Ninguno de los dos
 * sale de una tabla oficial por dispositivo — son criterios conservadores
 * elegidos para el patrón de fallo concreto de este juego, a falta de
 * verificación en dispositivo real (David verifica con capturas después):
 *
 * - `MAX_FRAGMENT_UNIFORM_VECTORS < 512`: cada luz (sobre todo con sombra:
 *   matrices de cámara de sombra, near/far, bias...) consume varios vec4 de
 *   uniforms en el shader Lambert de three.js; con ~17 luces + 6 juegos de
 *   uniforms de sombra el presupuesto necesario ronda varios cientos de
 *   vec4. GPUs de escritorio/gama alta suelen reportar 1024 o más; muchas
 *   GPUs móviles de gama baja/media (registro de constantes de fragment
 *   shader pequeño) rondan 224-256. 512 es un corte a medio camino: cómoda-
 *   mente por debajo de lo que reporta una GPU capaz, cómodamente por encima
 *   de lo que reporta una GPU típica de gama baja — separa bien el caso que
 *   falla sin penalizar de más al hardware capaz.
 * - `MAX_TEXTURE_IMAGE_UNITS < 16`: cada luz CON sombra necesita una unidad
 *   de textura para su mapa (samplerCube la vela, sampler2D cada linterna de
 *   enemigo) — 6 sombras simultáneas ya necesitan 6 unidades solo para eso,
 *   antes de contar las texturas normales de los materiales. El mínimo
 *   garantizado por WebGL1 es 8 (gama baja real); 16 es el escalón típico de
 *   gama media — por debajo de eso, 6 sombras simultáneas son un riesgo real
 *   de agotar las unidades disponibles.
 * - `pointer: coarse` (señal SECUNDARIA, mismo peso que las dos anteriores
 *   en el OR): las capacidades reales del contexto WebGL solo se pueden leer
 *   una vez creado — si algún driver/navegador móvil reporta límites
 *   optimistas que no se sostienen en la práctica al enlazar el shader real
 *   (la causa raíz exacta del bug de David en Chrome Android no está
 *   aislada al 100%, solo el síntoma), el puntero táctil es una señal barata
 *   y razonable de "GPU probablemente limitada, mejor ser conservador" —
 *   coincide exactamente con el repro reportado (Chrome Android, táctil).
 */
const MIN_FRAGMENT_UNIFORM_VECTORS = 512;
const MIN_TEXTURE_IMAGE_UNITS = 16;

/**
 * Decide el perfil por CAPACIDADES REALES del contexto WebGL ya creado
 * (nunca por user-agent string, ver cabecera). `?quality=alto|bajo` (mismo
 * estilo que el resto de `debug-params.ts`) fuerza el resultado por encima
 * de la detección — IMPRESCINDIBLE para poder verificar el perfil bajo desde
 * un navegador de escritorio sin depender de un móvil real.
 */
export function detectQualityProfile(gl: WebGLRenderingContext | WebGL2RenderingContext): QualityProfile {
  const maxFragmentUniforms = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) as number;
  const maxTextureImageUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number;
  const coarsePointer =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;

  const detected: QualityProfile =
    maxFragmentUniforms < MIN_FRAGMENT_UNIFORM_VECTORS ||
    maxTextureImageUnits < MIN_TEXTURE_IMAGE_UNITS ||
    coarsePointer
      ? 'bajo'
      : 'alto';
  const override = readQualityOverride();
  const resolved = override ?? detected;

  // Solo dev (herramienta de diagnóstico, ver cabecera): permite confirmar
  // en consola qué perfil se resolvió y con qué límites, sin instrumentación
  // extra — imprescindible para depurar futuros repros de GPUs limitadas.
  if (import.meta.env.DEV) {
    console.info(
      `[flingo] calidad: ${resolved}${override ? ' (forzado por ?quality=)' : ''} ` +
        `(uniforms=${maxFragmentUniforms}, texUnits=${maxTextureImageUnits}, coarse=${coarsePointer})`,
    );
  }
  return resolved;
}

interface QualityStoreState {
  profile: QualityProfile;
  budget: QualityBudget;
  setProfile: (profile: QualityProfile) => void;
}

/**
 * Store zustand (mismo patrón que `dark-store.ts`): perfil inicial 'alto'
 * (idéntico a hoy) hasta que `resolveQualityProfile` lo fije de verdad al
 * crear el contexto WebGL. Legible desde React vía el hook `useQualityStore`
 * (selectores, mismo estilo que `useDarkStore`) y desde código no-React vía
 * `getQualityBudget()`.
 */
export const useQualityStore = create<QualityStoreState>((set) => ({
  profile: 'alto',
  budget: BUDGET_ALTO,
  setProfile: (profile) => set({ profile, budget: budgetForProfile(profile) }),
}));

/**
 * Resuelve el perfil UNA sola vez al crear el contexto WebGL (`onCreated`
 * del Canvas, GameRoot.tsx) y lo fija en el store. No cambia después durante
 * la sesión: el recuento de luces montadas depende de estos presupuestos, y
 * cambiarlos en caliente recompilaría shaders a mitad de partida (misma
 * invariante que `lightsGroupRef`/`ProjectileLightPool` ya documentan en sus
 * respectivos ficheros).
 */
export function resolveQualityProfile(gl: WebGLRenderingContext | WebGL2RenderingContext): QualityProfile {
  const profile = detectQualityProfile(gl);
  useQualityStore.getState().setProfile(profile);
  return profile;
}

/** Lectura fuera de React (mismo valor que `useQualityStore.getState().budget`), para código no-React. */
export function getQualityBudget(): QualityBudget {
  return useQualityStore.getState().budget;
}
