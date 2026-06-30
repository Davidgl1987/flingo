# CODING_STANDARDS.md

## Estilo general

- TypeScript estricto cuando sea posible.
- Cambios pequeños y verificables.
- Nombres explícitos.
- Evitar abstracciones prematuras.
- Mantener la lógica de juego en `src/game/core`.

## React

- Componentes visuales simples.
- No meter reglas de daño/IA dentro de componentes.
- Hooks para input/loop.
- Zustand para acciones globales.

## Game core

- Funciones puras siempre que sea razonable.
- Recibir estado y devolver nuevo estado.
- Tests para reglas críticas.
- No depender de WebGL, DOM o React en `core`.

## Performance

- Evitar crear geometrías/materiales complejos por frame.
- No hacer setState innecesario en cada componente.
- Mantener objetos visuales simples en MVP.

## Documentación

Actualizar docs si se cambia:

- una mecánica;
- el formato de sala;
- el estado global;
- el flujo de run;
- comandos de instalación/test.
