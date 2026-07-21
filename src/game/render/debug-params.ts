/**
 * Helpers de depuración por parámetros de URL (herramientas de playtest):
 * `?seed=N` fuerza la semilla de la mazmorra, `?boss=<id|alias>` salta directo
 * a la arena de un jefe, `?phase=2|3` fuerza su fase inicial, `?upgrades=...`
 * (F5, docs/plans/ECONOMY_PLAN.md) fuerza niveles de mejora para verificar su
 * feedback visual sin tener que jugar hasta conseguirlas, y `?godmode`
 * (presencia = activo; David 2026-07-15) hace que el héroe reviva a vida
 * máxima en vez de game-over al llegar a 0 hp — el daño se sigue aplicando
 * normal (hp baja, vignette, knockback) para poder ver cuánto quita cada
 * ataque durante la run completa (4 jefes + mazmorras). Combina con `?seed`
 * (run completa) y `?boss` (arena de jefe suelta).
 */

import { getRoomPool } from '@/game/features/dungeon/rooms';
import { applyUpgrade, UPGRADE_POOL, type UpgradeId } from '@/game/session/upgrades';
import type { EventQueue } from '@/engine/events';
import type { RoomData, World } from '@/game/world/types';

/** Semilla forzada vía ?seed=N (para verificar una mazmorra concreta); null si no hay o no es un entero. */
export function readForcedSeed(): number | null {
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Alias cortos de `?boss=` (herramienta de playtest, BOSSES_PLAN B5): salta
 * directo a la arena del jefe en modo sala única, sin recorrer la mazmorra.
 * Acepta el id del jefe (`?boss=guardian`) o el alias de fase (`?boss=b1`).
 * `b0`/`test-boss` solo existe en dev (DEV_ONLY_LEVEL_JSON de rooms.ts).
 */
const BOSS_PARAM_ALIAS: Record<string, string> = {
  b0: 'test-boss',
  test: 'test-boss',
  b1: 'guardian',
  b2: 'queen',
  b3: 'prisma',
  b4: 'storm',
};

/** Sala del jefe pedido vía ?boss=<id|alias>; null si no hay parámetro o no existe tal jefe en el pool. */
export function readForcedBossRoom(): RoomData | null {
  const raw = new URLSearchParams(window.location.search).get('boss');
  if (raw === null) return null;
  const bossId = BOSS_PARAM_ALIAS[raw.toLowerCase()] ?? raw.toLowerCase();
  return getRoomPool().find((room) => room.boss === bossId) ?? null;
}

/** Fase forzada del jefe vía `?phase=2|3` (solo con `?boss=`, herramienta de playtest); null si no aplica. */
export function readForcedBossPhase(): 2 | 3 | null {
  const raw = new URLSearchParams(window.location.search).get('phase');
  if (raw === '2') return 2;
  if (raw === '3') return 3;
  return null;
}

/**
 * Modo dios de playtest vía `?godmode` (presencia = activo, sin valor; David
 * 2026-07-15: "añade un modo invulnerable para testeo [...] para ver lo que
 * quita de vida cada ataque"). Se aplica a `world.godMode` al crear/recrear
 * la sesión (session.ts); ver `applyDamageToHero`, features/combat/combat.ts.
 */
export function readGodMode(): boolean {
  return new URLSearchParams(window.location.search).has('godmode');
}

/**
 * Nivel de penumbra de la sala vía `?dark=0|1|2` (experimento estético, rama
 * `estilo-oscuro`): 0 = luz actual EXACTA (paridad con `main`, sin vela ni
 * cambios de fondo/fog), 1 = penumbra con la vela del héroe como luz
 * principal (DEFAULT en esta rama), 2 = oscuridad casi total (solo la vela).
 * Cualquier valor ausente o no reconocido cae al default 1 de esta rama.
 */
export function readDarkMode(): 0 | 1 | 2 {
  const raw = new URLSearchParams(window.location.search).get('dark');
  if (raw === '0') return 0;
  if (raw === '2') return 2;
  return 1;
}

/** Nombres válidos de grupo para `?glow=` (brillo propio tenue, solo aplica en dark 1-2). */
const GLOW_GROUP_NAMES = ['fosos', 'hazards', 'items', 'puertas'] as const;
export type GlowGroup = (typeof GLOW_GROUP_NAMES)[number];

/**
 * Grupos de elementos de jugabilidad con brillo propio (`emissive`) activo
 * vía `?glow=fosos,hazards,items,puertas` (experimento estético, solo tiene
 * efecto en dark 1-2 — ver assets.ts). Sin el parámetro: NINGUNO activo
 * (default desde playtest ronda 7: "me gusta más la configuración con todos
 * los checks apagados" — antes el default era todos). `?glow=all`: todos.
 * `?glow=` vacío o `?glow=none`: ninguno. Nombres desconocidos en la lista
 * se ignoran en vez de romper el parseo.
 */
export function readGlowGroups(): Set<GlowGroup> {
  const raw = new URLSearchParams(window.location.search).get('glow');
  if (raw === null) return new Set();
  if (raw.toLowerCase() === 'all') return new Set(GLOW_GROUP_NAMES);
  if (raw === '' || raw.toLowerCase() === 'none') return new Set();
  const result = new Set<GlowGroup>();
  for (const entry of raw.split(',')) {
    const name = entry.trim().toLowerCase();
    if ((GLOW_GROUP_NAMES as readonly string[]).includes(name)) {
      result.add(name as GlowGroup);
    }
  }
  return result;
}

/**
 * Tope defensivo para el nivel forzado de mejoras SIN `maxLevel` finito
 * (escudo: `maxLevel` Infinity) — sin esto, un `?upgrades=escudo:999999999`
 * en la URL dispararía cientos de miles de `applyUpgrade` al crear la sesión
 * (ver aviso de F4 sobre bucles acotados por `maxLevel`).
 */
const UNCAPPED_FORCED_LEVEL_LIMIT = 20;

/**
 * Parsea el valor de `?upgrades=id:nivel,id:nivel,...` (F5, herramienta de
 * playtest/verificación: `?upgrades=cuerpo-dano:3,escudo:2,flecha-dano:1`) a
 * un mapa `UpgradeId → nivel`. Ids que no existen en `UPGRADE_POOL` se
 * ignoran; el nivel se clampa a `maxLevel` de la mejora (o a
 * `UNCAPPED_FORCED_LEVEL_LIMIT` si `maxLevel` es Infinity). Función PURA (no
 * toca `window`) para poder testear el parseo sin mockear la URL.
 */
export function parseForcedUpgrades(raw: string | null): Partial<Record<UpgradeId, number>> {
  const result: Partial<Record<UpgradeId, number>> = {};
  if (!raw) return result;
  for (const entry of raw.split(',')) {
    const [idRaw, levelRaw] = entry.split(':');
    const def = UPGRADE_POOL.find((d) => d.id === idRaw);
    if (!def) continue;
    const level = Number.parseInt(levelRaw, 10);
    if (!Number.isFinite(level) || level <= 0) continue;
    const cap = Number.isFinite(def.maxLevel) ? def.maxLevel : UNCAPPED_FORCED_LEVEL_LIMIT;
    result[def.id] = Math.min(level, cap);
  }
  return result;
}

/** Mapa de mejoras forzadas vía `?upgrades=...` (F5); `{}` si no hay parámetro. Solo dev (herramienta de playtest). */
export function readForcedUpgrades(): Partial<Record<UpgradeId, number>> {
  return parseForcedUpgrades(new URLSearchParams(window.location.search).get('upgrades'));
}

/**
 * Aplica el mapa de `readForcedUpgrades`/`parseForcedUpgrades` a un mundo
 * recién creado, subiendo cada mejora de 1 en 1 nivel vía `applyUpgrade` (así
 * `upgradeLevels` Y los modificadores del héroe quedan coherentes, igual que
 * si se hubiesen comprado/recibido en el juego real). Pensada para llamarse
 * UNA sola vez justo tras crear la sesión (GameRoot); no-op si `forced` está
 * vacío. Los niveles ya llegan clampados desde `parseForcedUpgrades`, así que
 * el bucle interno siempre es acotado (≤ `maxLevel` o `UNCAPPED_FORCED_LEVEL_LIMIT`).
 */
export function applyForcedUpgrades(
  world: World,
  events: EventQueue,
  forced: Partial<Record<UpgradeId, number>>,
): void {
  for (const [id, targetLevel] of Object.entries(forced) as [UpgradeId, number | undefined][]) {
    const def = UPGRADE_POOL.find((d) => d.id === id);
    if (!def || !targetLevel) continue;
    for (let i = 0; i < targetLevel; i++) {
      applyUpgrade(world, def, events);
    }
  }
}
