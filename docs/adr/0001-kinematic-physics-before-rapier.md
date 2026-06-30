# ADR 0001 — Motor cinemático propio antes de Rapier

## Estado

Aceptado para MVP.

## Contexto

El juego necesita validar una sensación concreta: lanzar al héroe, rebotar, impactar y resolver salas. Usar un motor físico completo desde el principio puede ralentizar la iteración y complicar tests.

## Decisión

El MVP usa una simulación propia 2D sobre plano lógico `Vec2`, renderizada en 3D con React Three Fiber.

## Consecuencias positivas

- Más fácil escribir tests.
- Más fácil ajustar fuerza/fricción/rebote.
- Menos dependencias.
- Menos fricción para entender el código en otra sesión.

## Consecuencias negativas

- Colisiones menos realistas.
- Geometría limitada.
- Puede requerir migración si el juego crece.

## Cuándo reconsiderar

- Si se necesitan colisiones complejas.
- Si hay muchos cuerpos dinámicos.
- Si se necesitan empujes/rotaciones realistas.
- Si el motor propio empieza a generar bugs difíciles.

## Revisión 2026-06-25

Rapier se volvió a valorar al añadir fosos más visuales, esferas con rotación y enemigos con persecución. La decisión sigue siendo mantener el motor cinemático propio durante el MVP: el rediseño necesitaba iterar reglas y tests de gameplay, y una migración a físicas completas mezclaría cambio de stack con cambio de mecánicas.

Se reconsiderará cuando haya una necesidad real de cuerpos dinámicos acumulados, geometría más compleja o rotaciones físicas que afecten a reglas, no solo al render.
