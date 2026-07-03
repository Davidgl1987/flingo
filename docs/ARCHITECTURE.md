# Arquitectura técnica v2

*Contrato técnico para implementar el juego descrito en [GDD.md](./GDD.md). Reglas no negociables salvo decisión explícita del orquestador.*

## Stack

- **Vite + React 19 + TypeScript estricto** (`strict: true`, sin `any` implícito).
- **@react-three/fiber** para render. **@react-three/drei** solo para utilidades puntuales (nada pesado).
- **zustand** exclusivamente para estado de UI de baja frecuencia (fase de juego, HP, monedas, mejoras, modales). Nunca para estado que cambia cada frame.
- **Física propia en 2D** (plano XZ). Sin Rapier, sin motor externo: el juego solo necesita círculos contra AABBs y reflexión de vectores. Decisión firme: ya se probó Rapier y empeoró rendimiento y comportamiento.
- **vitest** para tests headless de la simulación.

## Principio rector: simulación pura, render tonto

```
src/
  app/            # App, rutas (juego, editor), viewport móvil
  game/
    sim/          # ★ Simulación pura: SIN imports de React ni three.js
      world.ts    #   estado del mundo (tipos + factoría)
      step.ts     #   tick de simulación: física, IA, combate, hazards, flujo
      physics.ts  #   círculo-vs-AABB, reflexión, integración
      ai.ts       #   comportamientos de los 5 enemigos
      combat.ts   #   daño, knockback, i-frames, proyectiles
      hazards.ts  #   foso, pinchos, barril, barro, boost, rastro
      dungeon.ts  #   generación procedural + flujo de puertas
      events.ts   #   cola de eventos de gameplay (impacto, muerte, explosión…)
    content/      # constantes de tuning (1 fichero), definiciones de enemigos/mejoras, salas de serie
    render/       # componentes R3F que LEEN la sim (nunca la mutan)
    input/        # puntería por PointerEvents (estado en refs)
    juice/        # partículas, shake, hit-stop, estelas (consumen events.ts)
    ui/           # HUD, modales (React DOM encima del canvas, no drei/Html)
    store.ts      # zustand UI
  editor/         # editor de salas (React DOM + vista R3F reutilizando render/)
  levels/         # salas .json
```

- La **sim** es un objeto mutable poseído por un hook raíz; se hace tick con **timestep fijo de 60 Hz** (acumulador + interpolación de render). Determinista con RNG con semilla.
- **React nunca está en el hot path**: los componentes R3F leen la sim en `useFrame` y mutan `object3D` directamente (posición, escala, color). El estado de zustand se actualiza solo cuando cambia un valor de UI (HP, monedas, fase), no por frame.
- La sim publica **eventos** (`impact`, `enemy-died`, `barrel-explosion`, `player-damaged`…) en una cola que juice/ y ui/ drenan cada frame. Nada de callbacks cruzados.
- Los sistemas de reacción (partículas, shake) son **independientes de la sala**: geometría pura, sin acoplarse al flujo de puertas.

## Presupuesto de rendimiento (móvil gama media, 60 fps)

- **Cero asignaciones por frame** en sim y juice: pools preasignados (proyectiles, partículas, eventos, vectores scratch).
- **Instancing obligatorio** para partículas (1 `InstancedMesh`, pool ~256), monedas, rastros y cualquier cosa repetida.
- Geometrías y materiales **compartidos y creados una vez** (módulo de assets); prohibido crear materiales en render.
- **Sin sombras dinámicas**: blob shadows (plano con textura radial). 1 luz direccional + ambiente. Materiales lambert/basic, paleta plana.
- `dpr` limitado a `[1, 2]`, `powerPreference: 'high-performance'`, sin postprocesado.
- Cámara: seguimiento suavizado del héroe con offset elevado/inclinado; el shake se aplica como offset aditivo amortiguado.

## Juice (implementación)

- **Shake:** valor de *trauma* [0,1] que decae; offset = trauma² × ruido. Aditivo a la cámara.
- **Hit-stop:** escala temporal de la sim (`dt *= timeScale`) durante ~60–100 ms en golpes fuertes. Nunca congela el render.
- **Squash & stretch:** escala del mesh del héroe según velocidad/impacto, en render, sin tocar la sim.
- **Háptica:** `navigator.vibrate` corto en eventos fuertes, con guard de soporte.

## Móvil

- `touch-action: none` en el canvas, viewport `user-scalable=no`, `overscroll-behavior: none`, alto `100dvh`.
- Apuntado por Pointer Events unificados (ratón = dedo). `setPointerCapture` para no perder el drag.
- HUD con botones de ≥48 px táctiles.

## Editor y niveles

- Formato de sala: JSON según el contrato del GDD §13, versionado con campo `version`.
- Borrador autoguardado en `localStorage`; exportar/importar el JSON de sala; en dev, plugin de middleware de Vite para escribir en `src/levels/`.
- El generador procedural (`sim/dungeon.ts`) es una función pura `(seed, pool) → mapa` con las validaciones del GDD §10.2, testeada en vitest.

## Testing y verificación

- Tests headless de sim en vitest: física (rebotes, fricción), daño por velocidad, IA por arquetipo, generador de mazmorra (validaciones), formato de sala.
- Verificación en navegador **siempre en navegación fresca** (recarga completa, no confiar en HMR: preserva estado muerto).

## Prohibiciones

- Mirar o reutilizar código de las ramas/carpetas anteriores (`src/game` viejo, `src/game-rapier`, historial git). Este proyecto se implementa solo desde GDD.md + este documento.
- `useState`/`setState` por frame; `new` en el hot path; drei `<Html>` para HUD; sombras dinámicas; postprocesado.
