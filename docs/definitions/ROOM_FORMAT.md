# ROOM_FORMAT.md

Las salas se definen en:

```txt
src/game/core/rooms.ts
```

Las salas creadas desde el editor se guardan como JSON independiente en:

```txt
src/game/levels/<room-id>.json
```

El plan recomendado es mantener un JSON por sala y más adelante añadir un índice/pool para el mapa procedural tipo Isaac.

## Estructura

```ts
export type RoomDefinition = {
  id: string;
  name: string;
  width: number;
  height: number;
  playerStart: Vec2;
  enemies: EnemyDefinition[];
  hazards: HazardState[];
  items: ItemState[];
};
```

Los enemigos patrulleros pueden incluir:

```ts
patrolTarget: Vec2
```

En runtime, la posición inicial del enemigo actúa como inicio de ruta y `patrolTarget` como segundo punto de ida/vuelta.

## Coordenadas

- La lógica usa `Vec2 { x, y }`.
- El render lo mapea a 3D como `x, z`.
- El centro de la sala es aproximadamente `(0, 0)`.
- `width` y `height` definen límites.

## Reglas para diseñar salas

- No colocar al jugador dentro de peligros.
- No poner enemigos demasiado cerca del spawn.
- Cada sala debe enseñar o combinar una idea.
- Evitar demasiados peligros al principio.
- Dejar espacio para que el jugador pueda parar.

## Plantilla de sala

```ts
{
  id: 'room-xx',
  name: 'Sala X: idea principal',
  width: 8,
  height: 12,
  playerStart: { x: -4.5, y: 0 },
  enemies: [],
  hazards: [],
  items: [],
}
```

## Checklist antes de añadir una sala

- ¿Tiene una jugada interesante?
- ¿Es legible desde móvil vertical?
- ¿Puede completarse sin depender de suerte?
- ¿Hay suficiente espacio para rebotes?
- ¿La recompensa justifica el riesgo?
