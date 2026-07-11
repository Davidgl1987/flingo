# Plan de reestructuración por features

*Aprobado por David (2026-07-11). Rama: `refactor/estructura-features` (desde `main` = `b141e67`). Solo reorganización: mover, renombrar y partir archivos. **Cero cambios de comportamiento.***

## Motivación

El código está organizado por capa técnica (`sim/`, `render/`, `content/`…) con features enteras en un solo archivo: `content/bosses.ts` (1.426 líneas, los 3 jefes), `EditorPage.tsx` (1.049), `styles.css` (989), `render/EnemyView.tsx` (697, todos los enemigos), `sim/ai.ts` (439, las 5 IAs), `content/constants.ts` (442, tuning de todo). Se pasa a organización por features: cada feature con su sim, su render, sus constantes y sus tests.

## Reglas invariantes (aplican a TODOS los pasos)

1. **Cada paso deja el proyecto verde**: `npm run typecheck && npm test` (y `npm run build` en los pasos 1, 2 y 6) antes de commitear. Un commit por paso.
2. **Regla de dependencias (sagrada)**: los archivos de sim NUNCA importan de React, three.js ni de archivos de render/UI. Render/UI leen la sim; jamás al revés. Los tests corren headless.
3. Solo mover/partir/renombrar. Sin refactors de lógica, sin renombrar símbolos (salvo los indicados), sin reformatear código al moverlo (diffs mínimos, `git mv` donde aplique).
4. Los comentarios con historia de decisiones/playtest viajan pegados a su constante o función (p. ej. el de la explosión 2.0→2.4 en constants.ts).
5. Los tests se mueven/parten junto a su código (co-locados, como ya están).
6. Nombres de clases CSS: no se renombra ninguna.

## Estructura objetivo

```
src/
├── app/                        # App.tsx, main.tsx
├── styles/base.css             # solo reset, #root, .game-root
├── engine/                     # genérico, sin dominio: geometry (Vec2, AABB), rng, events, physics
├── game/
│   ├── world/                  # types.ts (World, Hero, Enemy, RoomData…), create.ts (factorías/pools), step.ts
│   ├── session/                # session.ts, store.ts (zustand UI), upgrades.ts
│   ├── features/
│   │   ├── hero/               # AimInput, launch, HeroView, AimIndicatorView
│   │   ├── enemies/            # steering.ts + dummy/ chaser/ spike/ trail/ shooter/ (ai + constants + Mesh + test) + EnemyViews.tsx
│   │   ├── bosses/             # types, lifecycle, movement, registry + test-boss/ guardian/ queen/ + BossHealthBar
│   │   ├── combat/             # proyectiles, daño, contactos, ProjectileView
│   │   ├── hazards/            # hazards sim + HazardView, PuddleView
│   │   ├── items/              # items sim + ItemView
│   │   ├── dungeon/            # dungeon, dungeon-world, room-format, rooms.ts, levels/*.json
│   │   └── effects/            # el antiguo juice/ (partículas, trail, shockwave, haptics, reactToEvent, Views)
│   ├── render/                 # infraestructura de escena: GameRoot, CameraRig, RoomView, useGameLoop, assets, cameraSettings, debug-params.ts
│   └── ui/                     # HUD, modales, WeaponBar, DamageVignette, FpsCounter — cada uno con su .css al lado
└── editor/                     # EditorPage (fina) + components/ + constants/utils/validate/storage + editor.css
```

## Pasos

### Paso 1 — Alias `@/` + `juice/` → `effects/` (sonnet)

- Añadir alias `@` → `./src` en `tsconfig.json` (`paths`) y `vite.config.ts` (`resolve.alias`); comprobar que vitest lo resuelve (usa la config de vite).
- Convertir los imports entre directorios a `@/…` (los imports dentro del mismo directorio se quedan relativos `./`). Así los moves posteriores no rompen los imports salientes de cada archivo movido.
- `git mv src/game/juice src/game/effects`. Renombrar `juiceState.ts` → `effectsState.ts` (y su test). Renombrar símbolos: `JuiceSession` → `EffectsSession`, `createJuiceSession` → `createEffectsSession` (en `session.ts`) y cualquier otro identificador/comentario con "juice" (`grep -ri juice src`).

### Paso 2 — Partir `styles.css` (sonnet)

- `src/styles/base.css`: solo reset global, `#root`, `.game-root` (lo importa `main.tsx`).
- El resto, co-locado e importado por el componente que lo usa: `ui/hud.css` (HUD), `ui/damage-vignette.css`, `ui/fps-counter.css`, `ui/boss-health-bar.css`, `ui/weapon-bar.css`, `ui/modals.css` (backdrop/modal/upgrade/game-over/victory/pause — lo importan los 4 modales), `editor/editor.css`.
- Mover bloques enteros con sus comentarios. Verificación: además de build verde, concatenar los nuevos css y comprobar con un diff (ignorando orden/espacios) que no se perdió ningún selector de `styles.css`. Borrar `src/styles.css` al final.

### Paso 3 — Descomponer el editor (sonnet)

- `editor/constants.ts`: `ENEMY_KINDS`, `HAZARD_KINDS`, `ITEM_KINDS`, `ALL_TAGS`, `SIDES`, `ENEMY_COLOR`, `HAZARD_COLOR`, `ITEM_COLOR`, `SIDE_LABEL`, `HAZARD_DEFAULT_SIZE`.
- `editor/utils.ts`: `defaultRoom`, `snap`, `nextId`. `editor/validate.ts`: `validateLive`. `git mv editor-storage.ts storage.ts`.
- `editor/components/`: `EnemyProperties`, `HazardProperties` y demás paneles ya definidos como funciones aparte; y extraer del cuerpo de `EditorPage` los bloques grandes de JSX/lógica (canvas de edición, toolbar/paleta, panel lateral) como componentes. `EditorPage.tsx` queda como composición (objetivo: <250 líneas).
- Añadir tests de lo puro recién aislado: `utils.test.ts` (snap, nextId) y `validate.test.ts` (validateLive) — el editor hoy tiene cobertura cero.

### Paso 4 — Partir los jefes (sonnet)

Crear `src/game/features/bosses/`:

- `types.ts`: `BossPatternStep`, `BossDef` (de `content/bosses.ts`).
- `lifecycle.ts`: el actual `sim/boss.ts` entero (fases, derrota, `stepBosses`, `stepBossDoorSeal`, `capBossHitDamage`…) + su test como `lifecycle.test.ts`.
- `movement.ts`: `moveBossTowardWithAvoidance`, `bossTrySlide`, `bossHitsSolid`, `bossRoomBounds` + **tests nuevos de caracterización** (hoy sin cobertura directa).
- `registry.ts`: `BOSS_DEFS`, `getBossDef`.
- `test-boss/pattern.ts` (+ constantes TEST_BOSS_*), `guardian/` (patrón, patrulla, barriles, shard field + constantes del Guardián de `content/constants.ts` §15.2), `queen/` (patrón, larvas, rastro, guardianas + constantes de la Reina §15.3 + `QueenColumnsView.tsx` + `stepQueenColumns` desde `sim/combat.ts` como `queen/columns.ts`).
- Tests: `content/bosses.test.ts` se parte por jefe (`test-boss/pattern.test.ts`, `guardian/pattern.test.ts`…); `content/queen.test.ts` → `queen/`. Helpers compartidos de test → `bosses/test-helpers.ts`.
- `ui/BossHealthBar.tsx` (+ su css del paso 2) → `bosses/BossHealthBar.tsx`.
- Al final no quedan: `content/bosses.ts`, `sim/boss.ts`, ni las secciones de jefes en `content/constants.ts`.

### Paso 5 — Partir enemigos (sonnet)

Crear `src/game/features/enemies/`:

- `steering.ts`: helpers compartidos de `sim/ai.ts` (`moveToward`, `steerAwayFromHazards`, `isBlocked`, `heroDistance`, `canAggro`, `stepPatrol`…) + constantes de navegación de `content/constants.ts` + la parte correspondiente de `ai.test.ts`.
- `dummy/`, `chaser/`, `spike/`, `trail/`, `shooter/`: cada uno con `ai.ts` (su `stepX`), sus constantes (de `content/constants.ts` §enemigos), su `Mesh.tsx` (su bloque de render extraído de `EnemyMesh` en `render/EnemyView.tsx`) y su test.
- `enemies/EnemyViews.tsx`: el mapeo enemigo→Mesh + materiales compartidos (`ENEMY_MATERIAL`, `restingBodyMaterial`) + `stepEnemyAi` como dispatcher en `enemies/ai.ts`.
- Al final no quedan `sim/ai.ts` ni `render/EnemyView.tsx`.

### Paso 6 — Reorganización general (opus — reordena el grafo de imports completo; riesgo de ciclos y decisiones de capa)

- `src/engine/`: `geometry.ts` (Vec2, AABB extraídos de `world.ts`), `rng.ts`, `events.ts`, `physics.ts` (+ `body-collision.test.ts`).
- `src/game/world/`: `types.ts` (tipos de dominio de `world.ts`), `create.ts` (`createWorld`, `buildRoomEntities`, pools, `createEnemy`…), `step.ts`.
- `src/game/session/`: `session.ts`, `store.ts`, `upgrades.ts`.
- `src/game/features/`: `hero/` (AimInput, launch, HeroView, AimIndicatorView, constantes de héroe/armas/input), `combat/` (combat.ts + ProjectileView + constantes de armas/proyectiles), `hazards/` (hazards.ts + HazardView + PuddleView + constantes), `items/` (items.ts + ItemView), `dungeon/` (dungeon.ts, dungeon-world.ts, room-format.ts, rooms.ts, `src/levels/*.json`), `effects/` (mover `game/effects/` aquí).
- `src/game/render/`: queda solo infraestructura (GameRoot, CameraRig, RoomView, useGameLoop, assets, cameraSettings) + extraer de GameRoot los helpers de URL de debug a `debug-params.ts`.
- `src/app/`: mover `main.tsx` (actualizar `index.html`).
- Disolver del todo `content/constants.ts` (lo que quede: física global → `engine/physics`, mundo/run → `world/`, héroe/armas/input → sus features) y eliminar `content/`.
- **Actualizar el árbol de `docs/ARCHITECTURE.md`** para reflejar la estructura nueva (el principio sim pura / render tonto no cambia).
- Verificación extra: no hay ciclos de imports (`npx madge --circular src` o equivalente) y ningún archivo de sim importa react/three (`grep`).

### Paso 7 — Estado por jefe extensible (opus — diseño de contrato de la sim; aprobado por David 2026-07-11)

Sacar `QueenColumn` del tipo `World` hacia un estado por-jefe que el core no conozca. Fugas a cerrar (estado real tras el paso 6):

- `world/types.ts`: `interface QueenColumn` + campo `queenColumns: QueenColumn[]` en `World`.
- `world/create.ts` y `dungeon/dungeon-world.ts`: inicializan `queenColumns: []`.
- `world/step.ts`: llama a `stepQueenColumns(...)` directamente en el tick (el core invoca lógica de un jefe concreto).

Diseño requerido:

- `World` pasa a tener un único slot opaco de estado por jefe (p. ej. `bossState`); el core no nombra a ningún jefe. El tipo concreto (`QueenState` con sus columnas) vive en `queen/` con un **accessor tipado con guard** (`queenState(world)`), nada de `as` repartidos por los consumidores. Si la reina no se ha inicializado, el accessor devuelve estado vacío seguro (QueenColumnsView puede montar sin reina).
- `interface QueenColumn` se muda a `queen/` (columns.ts o types propio).
- La llamada de `step.ts` se generaliza: un hook opcional por jefe (en `BossDef` o vía `bosses/lifecycle.ts`) invocado desde el MISMO punto del tick — el orden de fases del tick no cambia ni un pelo.
- Los tests de la reina solo cambian en la mecánica de construcción/acceso al estado (helpers `makeQueenWorldWith*`); si una aserción necesita cambiar, la extracción está mal planteada.
- Verificación: typecheck, 269 tests en verde, build, greps de pureza (grep `queen` en `world/` y `engine/` → cero resultados salvo genéricos).

## Delegación

Orquestador (sesión principal) verifica tras cada paso: `git log`/`git diff --stat`, typecheck y tests. Sub-agentes: sonnet en pasos 1-5; opus en el paso 6 (justificación: es el único paso que toca todo el grafo de dependencias a la vez, donde un error compila pero rompe la separación sim/render o introduce ciclos). Los sub-agentes no lanzan otros agentes, no pushean y no arrancan servidores.
