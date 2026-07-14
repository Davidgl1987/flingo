/**
 * Funciones puras de "qué mostrar a qué nivel" para el feedback visual de
 * proyectiles (docs/plans/ECONOMY_PLAN.md F5): sin three.js, testeadas aquí;
 * `ProjectileView` las llama en `useFrame`.
 *
 * Nota: el hechizo (Orbe Voraz / hechizo-dano) NO tiene función propia aquí
 * — su radio de sim ya crece con `spellRadiusBonus` (`PROJECTILE_RADIUS` →
 * `SPELL_RADIUS_UPGRADED`, combat.ts) y `ProjectileView` ya escala el grupo
 * completo por `p.radius`; añadir otro factor duplicaría el efecto.
 */

/**
 * Escala transversal extra de la flecha (Colmillo de Hierro / flecha-dano):
 * +25%/nivel, solo en el ANCHO (ejes X/Y locales del grupo, perpendiculares
 * al vuelo) — el largo del cono/asta (eje Z, dirección de vuelo) no cambia.
 */
export function arrowWidthScaleForLevel(level: number): number {
  return 1 + Math.max(0, level) * 0.25;
}
