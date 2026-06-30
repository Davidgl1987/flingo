# ARCHITECTURE.md

## Resumen

La arquitectura separa la lógica pura del render.

- `src/game/core/`: simulación, daño, upgrades, rooms, tipos y utilidades matemáticas.
- `src/game/stores/`: Zustand, puente entre lógica y UI.
- `src/game/components/`: representación visual en React Three Fiber.
- `src/game/hooks/`: input, loop y atajos.
- `tests/`: pruebas de lógica pura.

## Flujo de datos

1. El usuario interactúa con la escena o UI.
2. Hooks llaman acciones del store.
3. El store llama funciones puras de `core`.
4. Las funciones devuelven un nuevo `GameState`.
5. React renderiza el nuevo estado.

## Por qué lógica pura

Permite testear:

- daño por impacto;
- fosos;
- explosiones;
- upgrades;
- progresión de salas;
- comportamiento de proyectiles.

Sin arrancar navegador ni WebGL.

## Estado global

Archivo principal:

```txt
src/game/stores/useGameStore.ts
```

El store debe mantenerse pequeño. Si crece demasiado, dividir en módulos, pero evitar premature abstraction.

## Render

La escena se renderiza en:

```txt
src/game/components/Scene.tsx
```

Los componentes visuales deben recibir datos y renderizar. No deberían contener reglas de juego importantes.

## Física actual

Motor cinemático propio:

```txt
src/game/core/simulation.ts
```

Usa Vec2 y representa el mundo sobre el plano X/Z del render.

Ventajas:

- simple;
- testeable;
- predecible;
- fácil de ajustar.

Limitaciones:

- colisiones simples;
- sin rotaciones reales;
- sin cuerpos complejos;
- no gestiona bien geometrías arbitrarias.

## Migración futura a Rapier

No migrar aún salvo que el prototipo demuestre diversión y el motor propio limite mucho.

Posible estrategia:

1. Mantener `GameState` como fuente de verdad.
2. Sustituir integración física por Rapier.
3. Mantener tests de daño/progresión/upgrades.
4. Añadir tests/manual checks para casos físicos.

## Normas para añadir mecánicas

Cada mecánica nueva debería incluir:

- tipo en `types.ts`;
- datos en `rooms.ts` o `upgrades.ts`;
- lógica en `core`;
- componente visual simple;
- al menos un test si afecta reglas;
- una línea en `docs/CHANGELOG.md`.
