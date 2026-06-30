# ADR 0002 — Lógica pura y tests sin framework externo

## Estado

Aceptado para MVP.

## Contexto

El proyecto debe poder iterarse rápido y ser entendible por futuras sesiones de IA. Las reglas importantes deben poder probarse sin navegador.

## Decisión

- Mantener reglas principales en `src/game/core`.
- Usar tests sencillos en `tests/run-tests.ts`.
- No introducir Vitest/Jest todavía.

## Consecuencias positivas

- Menos configuración.
- Tests rápidos.
- Menos dependencias.
- Fácil de ejecutar en cualquier entorno Node.

## Consecuencias negativas

- Menos ergonomía que Vitest.
- Sin watch mode.
- Sin snapshots ni mocks avanzados.

## Cuándo reconsiderar

- Al superar 30-40 tests.
- Si se necesita cobertura.
- Si se añaden tests de componentes.
