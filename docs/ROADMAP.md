# ROADMAP.md

## Backlog / decisiones aplazadas

- **Rotación de salas en múltiplos de 90° en el world-gen (fase 2).** La primitiva pura `rotateRoomDefinition(room, 0|90|180|270)` ya está **implementada y testeada** (ver `docs/plans/NON_SQUARE_SCENARIOS.md` Fase 1 y CHANGELOG 2026-06-29): rota todo el contenido (posiciones de enemigos/hazards/items, `playerStart`, direcciones de pinchos/impulso, ejes de patrulla, `doorSlots`). Pendiente: **aplicarla en la colocación** (Fase 2 del plan), una vez los tests de geometría estén escritos y el mundo de tamaño variable esté verificado detrás de flag.

## Fase 0 — Prototipo actual

Objetivo: comprobar que se puede lanzar, rebotar, dañar y limpiar salas.

Estado: completado a nivel inicial.

## Fase 1 — Pulido del núcleo

Prioridad máxima.

- Ajustar constantes de movimiento.
- Mejorar línea de predicción.
- Añadir ghost/preview de trayectoria si merece la pena.
- Clarificar cuándo el jugador puede actuar.
- Mejorar feedback de daño y muerte.
- Añadir pequeños VFX placeholder.
- Añadir SFX básicos.

Criterio de éxito:

- El lanzamiento se siente bien en móvil.
- Las muertes se entienden.
- El jugador quiere repetir una sala.

## Fase 2 — Diseño de salas

- Crear 10 salas manuales.
- Clasificarlas por dificultad.
- Probar salas pequeñas vs grandes.
- Introducir peligros uno a uno.
- Añadir una sala tutorial sin texto largo.

Criterio de éxito:

- 5 minutos de juego sin aburrir.

## Fase 3 — Builds roguelite

- Mejoras más sinérgicas.
- Mejoras con tradeoff.
- Rarezas.
- Cofres más interesantes.
- Posible tienda simple.

Ejemplos:

- Más daño pero más rebote.
- Menos vida pero proyectiles atraviesan.
- Explosión al primer impacto de cada lanzamiento.
- Curación al limpiar sin recibir daño.

## Fase 4 — Jefe simple

- Un jefe con 2 fases.
- Ataques telegrafiados.
- Puntos débiles.
- Uso de rebotes/peligros.

## Fase 5 — Mobile packaging

- Añadir Capacitor.
- Probar Android real.
- Ajustar safe areas.
- Añadir vibración.
- Test de rendimiento.
- Preparar iconos/splash.

## Fase 6 — Temática

Elegir una dirección visual solo después de validar el núcleo.

Opciones pendientes:

- Mazmorra abstracta.
- Hielo/curling.
- Barco/cubierta mojada.
- Laboratorio inundado.
- Parque acuático maldito.
