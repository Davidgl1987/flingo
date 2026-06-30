# STATE_MODEL.md

## GameState

El estado de juego contiene todo lo necesario para simular y renderizar una partida.

No debería contener referencias a objetos Three.js, DOM, timers externos ni funciones.

## Importante sobre clonación

`cloneState` usa JSON parse/stringify. Por tanto:

- No guardar funciones en `GameState`.
- No guardar clases.
- No guardar fechas.
- No guardar Maps/Sets.
- Mantener datos serializables.

## Fases

- `playing`: gameplay normal.
- `choosing-upgrade`: el jugador debe elegir mejora.
- `game-over`: derrota.
- `victory`: run completada.

## Reglas

- Las funciones de `core` reciben `GameState` y devuelven `GameState`.
- No mutar estado original salvo que se clone antes.
- Los componentes no deberían modificar directamente estructuras profundas.
- Preferir acciones del store.
