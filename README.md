# Slingshot Dungeon MVP

Prototipo web/mobile-first para validar una idea de roguelite por habitaciones: lanzas al héroe como una bola de billar, rebotas, matas enemigos por impacto, evitas fosos/trampas, alternas entre lanzar el cuerpo o disparar proyectiles y eliges mejoras entre salas.

## Stack

- Vite + React + TypeScript
- React Three Fiber para render 3D simple
- Zustand para estado global
- Motor cinemático 2D propio sobre plano X/Z para prototipar rápido

> Nota: para este MVP he usado física propia en vez de Rapier. Así es más fácil testear reglas de juego y ajustar la sensación de movimiento. Si el núcleo engancha, el siguiente paso puede ser migrar colisiones complejas a `@react-three/rapier` o mantener el motor propio si basta.

## Instalar y ejecutar

```bash
npm install
npm run dev
```

Abre la URL que indique Vite, normalmente `http://localhost:5173`.

## Tests

```bash
npm test
```

Los tests cubren lógica pura: impacto, pinchos, fosos, barriles, upgrades y progresión de salas.

## Controles

### Desktop

- Pulsa en cualquier zona del canvas, tira hacia atrás y suelta.
- `1`: modo lanzar héroe.
- `2`: modo flecha.
- `3`: modo hechizo.
- `R`: reiniciar run.

### Móvil

- Toca en cualquier zona del canvas, tira hacia atrás y suelta.
- Botones inferiores para cambiar de arma.

## Qué valida este MVP

- Si el lanzamiento/rebote es divertido.
- Si las salas generan decisiones tácticas.
- Si alternar entre cuerpo/proyectil aporta riesgo-recompensa.
- Si fosos, barriles, pinchos, rastro dañino y enemigos que te presionan al apuntar aumentan la diversión.


## Continuar en otra sesión con IA

Este ZIP incluye documentación específica para que otra sesión con IA pueda retomar el trabajo con contexto:

- `AGENTS.md`: resumen principal del proyecto y estado actual.
- `PROJECT_MAP.json`: mapa rápido de comandos y carpetas importantes.
- `docs/`: diseño, arquitectura, roadmap, tuning, mobile y changelog.
- `docs/definitions/`: contrato de gameplay, entidades, formato de salas, upgrades y estado.
- `docs/instructions/`: prompt para siguiente sesión, estándares, debugging y QA.
- `docs/agents/`: roles para implementación, supervisión, QA y diseño.
- `docs/skills/`: guías prácticas de prototipado, física, móvil y testing.
- `tests/manual/`: checklist de playtesting manual.

Comando útil para imprimir el contexto principal:

```bash
npm run context
```

## Próximos pasos sugeridos

1. Ajustar fuerza, fricción, rebote y tamaño de sala.
2. Probar salas más pequeñas y más densas.
3. Añadir 1 jefe simple.
4. Añadir generación procedural por plantillas.
5. Añadir Capacitor cuando el prototipo ya sea divertido en navegador móvil.
