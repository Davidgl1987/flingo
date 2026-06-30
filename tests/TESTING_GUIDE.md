# TESTING_GUIDE.md

## Comando principal

```bash
npm test
```

Este comando compila con `tsconfig.test.json` y ejecuta `tests/run-tests.ts` compilado.

## Filosofía

Los tests actuales son deliberadamente simples y sin framework externo. Así el MVP depende de menos piezas y se puede ejecutar rápido.

## Añadir un test

Editar:

```txt
tests/run-tests.ts
```

Añadir una llamada `test('nombre', () => { ... })`.

Usar `assert(condition, message)` para fallos.

## Qué cubrir primero

- Funciones de `src/game/core`.
- Casos límite de input.
- Daño y muerte.
- Salas y upgrades.

## Cuándo pasar a Vitest

Cuando haya más de 30-40 tests o se necesiten mocks/fixtures más cómodos.
