/**
 * Tuning de mundo y run (salas, muros, puertas, estructura de la mazmorra)
 * — GDD, Apéndice. Valores validados por playtesting; no ajustar sin probar.
 */

import { HERO_RADIUS } from '@/game/features/hero/constants';

// ── Mundo y run ───────────────────────────────────────────────────────────

export const ROOMS_PER_RUN = 6;
export const DOOR_WIDTH = 2.0;
export const WALL_THICKNESS = 0.42;
export const ROOM_MIN_SIZE = 5;
export const ROOM_CLEAR_SCORE = 50;
/** Distancia al centro de una puerta para considerar que el héroe está lo bastante cerca como para avisar "necesitas la llave". Deliberadamente más generosa que el contacto real (`DOOR_CONTACT_MARGIN`): avisar de cerca está bien, lo que no puede pasar es abrir antes de tocar. */
export const DOOR_TOUCH_MARGIN = 1.1;
/**
 * Distancia de CONTACTO real al centro de la puerta del jefe para abrirla con
 * llave (bug playtest 2026-07-14: antes se abría a `DOOR_TOUCH_MARGIN`=1.1u,
 * mucho antes de llegar al muro, dejando atacar al jefe desde la sala
 * contigua). Cuenta: radio del héroe + medio grosor de muro (el hueco de
 * puerta está centrado en el muro) + margen pequeño de tolerancia numérica.
 */
export const DOOR_CONTACT_MARGIN = HERO_RADIUS + WALL_THICKNESS / 2 + 0.05;
