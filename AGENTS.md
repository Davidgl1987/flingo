# AGENTS.md — Slingshot Dungeon MVP

Este archivo es el punto de entrada para cualquier nueva sesión con IA. Léelo antes de modificar código.

> **Modelo y delegación:** un modelo superior (Opus) orquesta; las tareas de implementación se delegan a sub-agentes con `model: "sonnet"` (o `haiku` para lo muy mecánico). Nunca uses Opus en un sub-agente. Detalle en `.claude/CLAUDE.md`.

## Resumen del juego

Prototipo web/mobile-first para validar una idea de roguelite por habitaciones:

- Vista cenital/isométrica en 3D simple.
- El jugador no camina: se lanza con gesto tipo Angry Birds / billar.
- El héroe hace daño al impactar contra enemigos si lleva suficiente velocidad.
- También puede cambiar a modo flecha o hechizo para atacar desde una posición segura.
- Las salas contienen enemigos, fosos, pinchos, barriles explosivos, zonas lentas/impulso, monedas, pociones y mejoras.
- La intención es acercarse al ritmo de Binding of Isaac por habitaciones, pero con movimiento físico por lanzamiento.

## Objetivo actual

Validar si el núcleo es divertido con gráficos placeholder. No optimizar arte, monetización ni progresión larga todavía.

Pregunta principal del MVP:

> ¿Es divertido apuntar, lanzar/rebotar, empujar/matar enemigos, evitar trampas y elegir mejoras entre salas?

## Estado actual del prototipo

Implementado:

- Vite + React + TypeScript.
- React Three Fiber para la escena.
- Zustand para estado global.
- Motor cinemático 2D propio sobre plano X/Z.
- 5 salas diseñadas a mano.
- Drag & release con mouse/touch.
- Modo cuerpo, flecha y hechizo.
- Enemigos: dummy, chaser, spike, trail.
- Peligros: pit, spikes, barrel, slow, boost, rock.
- Objetos: coin, potion.
- Mejoras entre salas.
- Tests de lógica pura.

No implementado aún:

- Capacitor para Android/iOS.
- Arte final.
- Sonido.
- Guardado persistente.
- Generación procedural.
- Jefes.
- Balance fino.
- VFX pulidos.

## Decisiones importantes

1. El motor físico actual es propio, no Rapier.
   - Motivo: es más fácil testear y ajustar rápido.
   - El render es 3D, pero la simulación usa Vec2 sobre X/Z.

2. El estado del juego vive en `src/game/stores/useGameStore.ts`.
   - La lógica pura vive en `src/game/core/`.
   - Los componentes solo renderizan el estado y disparan acciones.

3. La prioridad es jugabilidad antes que arquitectura perfecta.
   - Mantén cambios pequeños y testeables.
   - Si una mecánica no mejora la diversión, elimínala o ponla detrás de una constante.

## Cómo arrancar

```bash
npm install
npm run dev
npm test
```

## Flujo recomendado para una nueva IA

1. Leer `AGENTS.md`.
2. **Leer `docs/instructions/ARCHITECTURE_INVARIANTS.md`** antes de tocar la simulación, el mundo o el render. Son reglas anti-bug que NO deben romperse (clonado único por tick, caché de pathgrid/muros, coordenadas de mundo en patrullas, generación de muros, culling por sala).
3. Leer `docs/MVP_STATUS.md` y `docs/ROADMAP.md`.
4. Leer `docs/definitions/GAMEPLAY_CONTRACT.md`.
5. Ejecutar `npm test` antes de tocar nada.
6. Hacer una modificación pequeña.
7. Ejecutar `npm test`.
8. Probar manualmente usando `tests/manual/PLAYTEST_CHECKLIST.md`.
9. Actualizar `docs/CHANGELOG.md` y `docs/MVP_STATUS.md` si cambia comportamiento.

## Principios de diseño

- Input simple: tocar, arrastrar, soltar.
- Decisiones claras: riesgo cuerpo vs seguridad proyectil.
- Feedback inmediato: impacto, daño, mensaje, recompensa.
- Salas cortas: 20-90 segundos.
- Las muertes deben sentirse justas: el jugador debe entender por qué recibió daño.

## Qué NO hacer sin confirmación

- No reescribir todo a Rapier todavía.
- No meter generación procedural antes de pulir 5-10 salas manuales.
- No añadir monetización.
- No añadir inventario complejo.
- No cambiar el stack base salvo necesidad clara.
- No llenar el MVP de armas antes de validar el cuerpo/proyectiles básicos.
