/**
 * Helpers de depuración por parámetros de URL (herramientas de playtest):
 * `?seed=N` fuerza la semilla de la mazmorra, `?boss=<id|alias>` salta directo
 * a la arena de un jefe y `?phase=2|3` fuerza su fase inicial.
 */

import { getRoomPool } from '@/game/features/dungeon/rooms';
import type { RoomData } from '@/game/world/types';

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
