# ARCHITECTURE_INVARIANTS.md — léeme antes de tocar la simulación o el render

Reglas que NO deben romperse. Cada una nació de un bug real. Si vas a cambiar algo
que las afecte, justifícalo y actualiza este documento.

## 1. La simulación clona el estado UNA sola vez por tick

- `tickGame` ([src/game/core/simulation.ts](../../src/game/core/simulation.ts)) hace **un único `cloneState`** al entrar y luego pasa ese borrador (`next`) a todas las etapas, que lo **mutan en sitio**.
- ❌ NO vuelvas a poner `cloneState(state)` dentro de las funciones de etapa (`integratePlayer`, `resolveHazards`, colisiones, etc.). Antes se clonaba ~30 veces por frame y disparaba el GC.
- Las funciones de etapa reciben el borrador y lo mutan; devuelven el mismo objeto solo por comodidad de encadenado.

### damageSystem: núcleos mutables + envoltorios puros
- `damageSystem.ts` expone funciones **mutables** (`damagePlayer`, `damageEnemy`, `explodeBarrelInPlace`, `resolvePlayerEnemyHitInPlace`, `respawnAfterPitInPlace`, `applyExplosiveBodySplash`) que la simulación usa sobre el borrador, y **envoltorios puros** (`explodeBarrel`, `resolvePlayerEnemyHit`, `respawnAfterPit`) que clonan una vez.
- Los tests de lógica dependen de que los envoltorios puros **no muten** la entrada. No conviertas un envoltorio puro en mutador.

### `cloneState` usa JSON a propósito
- El objeto que Zustand pasa a `tickGame` incluye las **acciones del store** (funciones). `JSON.parse(JSON.stringify())` las descarta (el store las re-fusiona en `set`).
- ❌ NO cambies `cloneState` a `structuredClone`: lanza `DataCloneError` al toparse con esas funciones.

## 2. Nunca reconstruyas estructuras "de mapa" dentro de bucles por entidad

Las estructuras que dependen solo de la sala/mundo (no de cada entidad) se **cachean a nivel de módulo** e se **invalidan por clave**:

- **Pathgrid** (`buildPathGrid` en [pathfinding.ts](../../src/game/core/pathfinding.ts)): cacheado **por sala** — `Map<roomId | 'single', { grid, key }>`. `PathGrid` lleva su propio `bounds: GridBounds` y `roomId: string | null`, por lo que `worldToCell`/`cellToWorld`/`findPath`/`hasClearPath` usan `grid.bounds` y no dependen de la sala activa global. `buildPathGrid(state, room?)` construye/cachea la rejilla para la sala indicada; si se omite `room`, usa la sala activa (`getPathRoom(state)`). A* puede correr para CUALQUIER sala, no solo la activa. El reloj de throttle se avanza con `advancePathClock(dt)` desde la simulación; los paths por enemigo caducan solos a los 0.12 s (sin `enemyPathCache.clear()` global).
- **Muros del mundo** (`buildWorldWallObstacles` en [worldMap.ts](../../src/game/core/worldMap.ts)): cacheado por `wallCacheKey` (estado `open` de las conexiones + `hasKey`). Se consulta por entidad y por frame en colisiones, así que reconstruirlo cada llamada era el cuello de botella.

➡️ Si añades algo parecido (grids espaciales, listas de obstáculos, navmesh…), **cachéalo con su clave de invalidación**. No lo recomputes por enemigo/proyectil/frame.

## 3. Las entidades del mundo viven en COORDENADAS DE MUNDO

En modo mundo cada sala tiene un `offset`; enemigos, hazards e items se colocan con ese offset (ver `offsetRoomDefinition`). Por tanto:

- Cualquier comparación contra los límites de la sala (recorte de patrullas, "¿está contra el muro?", spawns, etc.) DEBE usar los **límites de mundo de la sala de esa entidad** (`roomBounds(getCurrentRoom(worldMap, entity.roomInstanceId))`), **no** `state.room` centrado en (0,0).
- Bug que esto causó: las patrullas se recortaban contra el origen, los enemigos abandonaban su sala hacia el centro del mapa y las salas no se "limpiaban". Ver `enemyRoomBounds` en simulation.

### Contención (no quitar)
- **Enemigos**: tras mover/colisionar se clampean a los límites de mundo de su propia sala (`integrateEnemies`). No deben entrar en salas contiguas (estilo Binding of Isaac).
- **Jugador**: tras colisionar con muros se clampea al AABB del mundo (`collideBodyWithWorldWalls`) como red de seguridad contra el *tunneling* a velocidad de lanzamiento. Puede moverse entre salas, pero nunca salir del escenario. **La caída en foso** (`tickPitFall`) hace `return` temprano en `tickGame` y se salta ese clamp, así que aplica el MISMO backstop de AABB de mundo tras integrar su posición — un cuerpo que cae con velocidad residual cerca del borde no debe deslizarse fuera del escenario (regresión cazada por el smoke de runtime, 2026-06-30).
- **Patrullas**: dan media vuelta no solo al tocar muro, sino también al detectar un hazard bloqueante (roca/barril/foso/pinchos) justo delante (`isPatrolPressingHazard`); si no, se quedaban atascadas empujando contra el obstáculo.

## 4. Los muros del mundo se generan para todo el mapa, con grosor uniforme

- `buildWorldWallObstacles` genera los muros por **líneas** (unión de los bordes de todas las salas en cada línea, menos los huecos de puerta), no 4 muros por sala.
- ❌ NO vuelvas al esquema "4 muros por sala desplazados hacia fuera": duplicaba los bordes compartidos entre salas adyacentes (apariencia de grosor irregular) y dejaba esquinas mal.
- Todos los segmentos tienen grosor `WALL_THICKNESS`. Las puertas cerradas añaden una barrera aparte etiquetada con `connectionId` (color distinto en render). Abrir la conexión quita la barrera y deja el hueco pasable.
- **Colocación** (`generateProceduralWorldMap`) — ahora es un **dispatcher** según `USE_VARIABLE_LAYOUT` (constants.ts):
  - **Rejilla uniforme** (`generateUniformWorldMap`, camino legado / fallback): cada sala se centra en una **celda del mismo tamaño** (la sala mayor) sobre una cuadrícula; las celdas se separan `ROOM_GAP = WALL_THICKNESS`. Garantiza no-solape y bordes compartidos en la **misma línea exacta** → muros fusionados sin dobles.
  - **Layout variable** (`generateVariableWorldMap`, ACTIVO con el flag en `true` desde 2026-06-29): salas de tamaño REAL distinto, rotadas (`instance.rotation` vía `rotateRoomDefinition`) y empaquetadas por anclaje, manteniendo el mismo invariante (bordes compartidos en la misma recta a `ROOM_GAP`). Se autovalida con `validateWorldMap` y, si una semilla no cuela, el dispatcher reintenta o cae al uniforme. Ver `docs/plans/NON_SQUARE_SCENARIOS.md`.
- **Regla de muros dobles (importante con layout variable):** lo prohibido es el solape de área entre dos muros de línea de **misma orientación** (dos verticales o dos horizontales = grosor irregular). Los cruces **perpendiculares** (un muro horizontal con uno vertical) en esquinas en T/L son **legítimos e inevitables** cuando salas de distinto tamaño se encuentran — NO los trates como bug. `validateWorldMap` y los tests de geometría aplican exactamente esta distinción. (Antes, con solo rejilla uniforme, no aparecía ningún solape; el layout variable introduce los cruces de esquina.)
- Los muros van por **fuera** del borde de cada celda (línea = borde ± `WALL_THICKNESS/2`, ver `sideGeometry`), así no solapan los tiles. Cada puerta tiene un "puente" de suelo (`getDoorBridges`); no hay foso ahí. La clave del caché de muros (`wallCacheKey`) DEBE incluir offsets/tamaños de sala (si no, `resetRun` puede devolver muros del mapa anterior).
- Adyacencia con ciclos permitida; el **boss es una hoja** (se añade el último) tras una conexión `requiresKey`, así la llave siempre es alcanzable sin pasar por el boss.

## 5. Las reacciones son puramente geométricas — el gate de sala ESTÁ ELIMINADO

> **Invariante:** una reacción (daño, explosión, foso, rebote, recogida) depende SOLO de radio/solape geométrico. `currentRoomInstanceId` no se usa para filtrar ninguna reacción. El único vínculo reacción↔sala es el flujo de puertas/IA/contención (§4 del plan UNIFORM_REACTION_SYSTEMS).

### Gates eliminados (no volver a añadir)
Los cuatro siguientes checks por sala fueron **borrados** y no deben reintroducirse:
1. `damageSystem.ts` `explodeBarrelInPlace` — `enemy.roomInstanceId !== barrel.roomInstanceId` (eliminado 2026-06-29).
2. `damageSystem.ts` `applyExplosiveBodySplash` — `enemy.roomInstanceId !== state.currentRoomInstanceId` (eliminado 2026-06-29).
3. `simulation.ts` `resolveHostileEnemyPressure` — `enemy.roomInstanceId !== next.currentRoomInstanceId` (eliminado 2026-06-29).
4. `simulation.ts` `collectItems` — `item.roomInstanceId !== next.currentRoomInstanceId` (eliminado 2026-06-29).

### Nuevos sistemas (Fase B, 2026-06-29)
- **Pinchos → enemigo** (`resolveHazards`): un enemigo que pisa un hazard `spikes` recibe `SPIKE_DAMAGE` con cooldown de 0.5 s en `enemy.contactCooldown`. Permite empujar a un enemigo sobre pinchos.
- **Separación enemigo↔enemigo** (`separateEnemies` en `collisions.ts`): separa pares de enemigos vivos solapados (empuje simétrico). Sin daño directo entre enemigos; el daño llega si la separación los empuja a un foso/pinchos/barril. Se clampea cada enemigo a los límites de su sala (`enemyRoomBounds`) tras separar.

### Lo que impide golpes imposibles
La **geometría** (proyectiles colisionan con los muros del mundo; salas separadas por muro+hueco `ROOM_GAP`). Un enemigo junto a una puerta **cerrada** no puede golpear al jugador al otro lado — el muro los separa físicamente.

### IA y contención (se mantiene el acoplamiento de sala)
- La **IA activa** (chase / A* completo hacia el jugador) solo corre para enemigos en la sala activa.
- **Salas inactivas** (`updateInactiveRoomEnemy` en `enemyAi.ts`): **TODOS los tipos hacen una patrulla mínima alrededor de su `patrolAnchor` (posición de spawn) — ninguno se congela nunca.**
  - `chaser` y `shooter`: no tienen patrulla propia, así que se les aplica `updatePatrolTarget` con su spawn como ancla, moviéndose a `DUMMY_PATROL_SPEED`. Esto también los lleva de vuelta a casa después de una persecución sin detenerlos al llegar.
  - `dummy`/`spike`/`trail`: continúan patrullando dentro de su sala, con A* contra su propia rejilla (evitan rocas, fosos, pinchos).
  - `trail`: además sigue depositando rastros mientras el jugador está en otra sala (misma lógica que en la sala activa: `trailTimer -= dt`; al llegar a 0 empuja a `state.trails` y lo resetea a 0.55).
  - `shooter`: solo se mueve en patrulla; no dispara cuando el jugador está en otra sala.
  - ❌ **No existe ya la rama `dist < 0.18` que detenía a los chase-types al llegar a homePos.**
- **`homePos`**: añadido en `EnemyState` (opcional `Vec2`); se rellena con la posición de spawn en `loadWorldMap`/`loadRoomDefinition`. `patrolAnchor` también se inicializa en el spawn — `updatePatrolTarget` oscila el enemigo alrededor de ese punto, lo que naturalmente lo mantiene cerca de casa.
- **Contención**: tras mover/colisionar los enemigos se clampean a los límites de su sala (`integrateEnemies` + `separateEnemies`). Los enemigos no salen de su sala ni cuando patrullan/retornan.
- **Puertas**: `checkRoomClear` abre conexiones al limpiar una sala. El acoplamiento sala↔IA/contención NO afecta al resultado de reacciones.
- `Scene` renderiza TODAS las entidades (sin culling: eliminado porque causaba pop-in; draw calls optimizados con `InstancedMesh` en el suelo).

## 6. Flujo de limpieza de sala / puertas

- `checkRoomClear` limpia **cualquier** sala cuyos enemigos estén todos muertos (abre sus conexiones con `openRoomConnections`), no solo la activa — puedes haber matado a la sala vecina a distancia. La fase de **mejora** solo se dispara cuando se limpia la sala en la que está el jugador.
- La puerta del boss requiere llave **Y contacto del jugador** para abrirse: su barrera lleva `requiresKey` y se pinta en dorado. Recoger la llave (`hasKey = true`) NO la abre automáticamente. El primer frame en que el jugador colisiona con la barrera (teniendo la llave), `collideCircleWithWorldWalls` (con `canUnlock = true`, solo en la ruta del jugador) setea `connection.unlocked = true` y muestra el mensaje "Has abierto la puerta del jefe." La barrera desaparece en el siguiente frame porque el caché de muros se invalida. El campo `unlocked` forma parte de `wallCacheKey` (se añade como sufijo `U` al fragmento del connection). Enemigos y proyectiles solo pasan `canUnlock = false` (por defecto), así que no pueden abrir la puerta.
- Tras elegir mejora, el store devuelve `phase = 'playing'`. Las puertas quedan abiertas porque su barrera depende de `connection.open`.

## Antes de dar por terminado

1. `npm test` debe seguir en verde (cubre lógica pura **y** el mapa procedural: muros, puertas, llave, limpieza).
2. Si tocaste un hot-path, perfila un frame en DevTools y compara antes/después.
3. Prueba manualmente con `tests/manual/PLAYTEST_CHECKLIST.md`.

## Deuda conocida (no es invariante, es pendiente)

- `simulation.ts` ya está partido en módulos: pathfinding (`pathfinding.ts`), IA de enemigos (`enemyAi.ts`), flujo de mundo/sala (`worldFlow.ts`) y colisiones (`collisions.ts`). `simulation.ts` (~615 líneas) queda como orquestador del tick + aim + integración + etapas de resolución. Mantén los puntos 1–3 al editarlos.
- Render imperativo: `Enemy` y `Player` ya se actualizan por `useFrame` (mutan el `ref` del mesh; `Enemy` recibe solo `id` y está memoizado para no re-renderizar). Proyectiles, trails y efectos siguen declarativos (son pocos y efímeros). Si conviertes más, sigue ese patrón: prop estable (`id`) + lectura con `useGameStore.getState()` dentro de `useFrame`.
- `npm run build` (Vite) falla por carga ESM/CJS de `vite.config.ts`; no afecta a `dev` ni a los tests.
