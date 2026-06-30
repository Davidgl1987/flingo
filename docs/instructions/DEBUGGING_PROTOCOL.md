# DEBUGGING_PROTOCOL.md

## Protocolo de depuración

1. Reproducir el problema.
2. Identificar si es de lógica, render o input.
3. Si es lógica, añadir o modificar un test.
4. Corregir el caso mínimo.
5. Ejecutar `npm test`.
6. Probar manualmente la sala afectada.
7. Actualizar changelog si el comportamiento cambia.

## Clasificación rápida

### Problemas de lógica

Archivos probables:

- `src/game/core/simulation.ts`
- `src/game/core/damageSystem.ts`
- `src/game/core/roomSystem.ts`
- `src/game/core/upgrades.ts`

### Problemas de input

Archivos probables:

- `src/game/hooks/useAimHandlers.ts`
- `src/game/hooks/useKeyboardShortcuts.ts`

### Problemas visuales

Archivos probables:

- `src/game/components/Scene.tsx`
- `src/game/components/*`
- `src/styles.css`

### Problemas de estado

Archivo probable:

- `src/game/stores/useGameStore.ts`

## Señales de alerta

- Cambios enormes sin tests.
- Lógica duplicada entre render y core.
- Estado no serializable.
- Mecánicas que añaden complejidad sin mejorar la decisión del jugador.
