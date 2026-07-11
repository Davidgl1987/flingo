/**
 * Tabla de definición de jefes (GDD §15): un jefe = una entrada aquí, en el
 * mismo espíritu que `sim/upgrades.ts::UPGRADE_POOL` — B1-B4 solo añaden una
 * entrada a `BOSS_DEFS` + sus funciones `stepPattern`/`onPhaseChanged`, sin
 * tocar el framework de `lifecycle.ts`.
 */

import type { BossId } from '@/game/world/types';
import { GUARDIAN_BARREL_DAMAGE_FRACTION, GUARDIAN_DAMAGE_OUTSIDE_WINDOW, GUARDIAN_HIT_DAMAGE_CAP_FRACTION, GUARDIAN_MAX_HP, GUARDIAN_RADIUS } from '@/game/features/bosses/guardian/constants';
import { guardianOnPhaseChanged, guardianStepPattern } from '@/game/features/bosses/guardian/pattern';
import { QUEEN_DAMAGE_OUTSIDE_WINDOW, QUEEN_HIT_DAMAGE_CAP_FRACTION, QUEEN_MAX_HP, QUEEN_RADIUS } from '@/game/features/bosses/queen/constants';
import { queenOnInit, queenOnPhaseChanged, queenStepPattern } from '@/game/features/bosses/queen/pattern';
import { testBossStepPattern } from '@/game/features/bosses/test-boss/pattern';
import type { BossDef } from './types';

export const BOSS_DEFS: Record<BossId, BossDef> = {
  'test-boss': {
    id: 'test-boss',
    name: 'Jefe de Pruebas',
    maxHp: 12,
    hitDamageCapFraction: [0.6, 0.65, 0.7],
    damageOutsideWindow: 0,
    stepPattern: testBossStepPattern,
  },
  guardian: {
    id: 'guardian',
    name: 'Guardián de Canto',
    maxHp: GUARDIAN_MAX_HP,
    radius: GUARDIAN_RADIUS,
    hitDamageCapFraction: GUARDIAN_HIT_DAMAGE_CAP_FRACTION,
    damageOutsideWindow: GUARDIAN_DAMAGE_OUTSIDE_WINDOW,
    barrelDamageFraction: GUARDIAN_BARREL_DAMAGE_FRACTION,
    stepPattern: guardianStepPattern,
    onPhaseChanged: guardianOnPhaseChanged,
  },
  queen: {
    id: 'queen',
    name: 'Reina del Enjambre',
    maxHp: QUEEN_MAX_HP,
    radius: QUEEN_RADIUS,
    hitDamageCapFraction: QUEEN_HIT_DAMAGE_CAP_FRACTION,
    // Rediseño 2026-07-10 (GDD §15.3, docs/plans/QUEEN_REDESIGN_PLAN.md): su
    // vida está en las columnas, pero al cuerpo SIEMPRE le entra daño (cualquier
    // ataque): reducido por `damageOutsideWindow` (0.15) fuera de aturdimiento,
    // completo mientras está ATURDIDA (al romper columna, o permanente con todas
    // rotas — ver `queenStepPattern`/`stepQueenColumns`).
    damageOutsideWindow: QUEEN_DAMAGE_OUTSIDE_WINDOW,
    stepPattern: queenStepPattern,
    onPhaseChanged: queenOnPhaseChanged,
    onInit: queenOnInit,
  },
};

export function getBossDef(id: BossId): BossDef {
  return BOSS_DEFS[id];
}
