# CHANGELOG.md

## 2026-06-30 — Escenarios no cuadrados · Flag `USE_VARIABLE_LAYOUT` ELIMINADO

El layout variable es ya el único camino; la rejilla uniforme queda **solo como fallback** de seguridad.

- `constants.ts`: eliminada la constante `USE_VARIABLE_LAYOUT`.
- `worldMap.ts`: `generateProceduralWorldMap` ya no ramifica por flag — siempre intenta el layout variable (12 semillas derivadas + `validateWorldMap`) y cae a `generateUniformWorldMap` si ninguna valida. `generateUniformWorldMap`/`generateVariableWorldMap`/`validateWorldMap` intactos.
- `tests/run-tests.ts`: quitada la importación y los usos del flag; el guard `generateProceduralWorldMap dispatch matches USE_VARIABLE_LAYOUT` pasa a `generateProceduralWorldMap always returns a valid dispatched map`.
- `grep USE_VARIABLE_LAYOUT src tests` → 0 resultados. Verificado: `npm test` 91/91, `npm run build` limpio.

## 2026-06-30 — Escenarios no cuadrados · Playtest: smoke de runtime + fix de contención en caída de foso

Cierre del playtest del layout variable. Un smoke de simulación nuevo destapó una fuga de contención **preexistente** (independiente del layout) que el mapa variable hacía fácil de tocar.

- **Test nuevo** `runtime smoke: full simulation runs on variable/rotated maps without escaping or throwing` (`tests/run-tests.ts`): para 8 seeds, teletransporta al jugador al centro de CADA sala (incluidas las rotadas 90°/270°), dispara lanzamientos periódicos en los tres modos y ejecuta el tick completo (IA, pathfinding por sala, colisiones, hazards). Asserta: sin excepción, sin NaN, jugador dentro del AABB de mundo, enemigos contenidos en su sala. (Verificado además fuera de banda sobre 30 seeds → 0 escapes.)
- **Bug encontrado y corregido** (`simulation.ts` `tickPitFall`): `tickGame` retorna antes por la rama de caída en foso (`pitFallActive`), saltándose el clamp de mundo de `collideBodyWithWorldWalls`. Un jugador que cae en un foso con velocidad residual cerca del borde exterior del escenario podía **deslizarse fuera del mapa** durante la caída. Fix: aplicar el mismo backstop de AABB de mundo (`getWorldBounds` + `clamp`) tras integrar la posición en `tickPitFall`. Restaura el invariante #3 ("el jugador nunca sale del escenario") también durante la caída, en ambos layouts.
- Total: 91 tests (90 + 1). Verificado: `npm test` 91/91, `npm run build` limpio.

## 2026-06-29 — Escenarios no cuadrados · Flag `USE_VARIABLE_LAYOUT` ACTIVADO

Se enciende el layout variable en producción (`constants.ts`: `USE_VARIABLE_LAYOUT = true`). Verificado en el juego (R3F renderiza el mapa irregular; HUD y flujo de salas correctos) y con la suite completa adaptada al nuevo modo activo.

- `constants.ts`: `USE_VARIABLE_LAYOUT = false → true`.
- Tests adaptados para ser **conscientes del flag / del nuevo layout** (siguen 90/90):
  - `wall geometry: no two PARALLEL line walls overlap (no doubled walls)`: el test de la red de seguridad ahora prohíbe solo solapes de **misma orientación** (muro doble real) e ignora los cruces **perpendiculares** de esquina T/L, que son legítimos en mapas variables.
  - `generateProceduralWorldMap dispatch matches USE_VARIABLE_LAYOUT` (antes "flag off by default"): guard consciente del flag — con flag off exige dims uniformes; con flag on exige que todo mapa despachado pase `validateWorldMap`.
  - `loadWorldMap rotation=0 … non-regression`: parte de una baseline con la rotación *eliminada* para que la propiedad "0 ≡ campo ausente" se mantenga aunque el mapa generado ya traiga rotaciones.
- `docs/instructions/ARCHITECTURE_INVARIANTS.md` (punto 4): actualizado — dispatcher uniforme/variable y la regla "muros dobles = solo paralelos; cruces perpendiculares de esquina permitidos".

## 2026-06-29 — Escenarios no cuadrados · Fase 2: layout de tamaño variable (detrás de flag)

Generador de mapa con salas de **tamaño real distinto, rotadas y empaquetadas por anclaje**, detrás de `USE_VARIABLE_LAYOUT` (apagado). Producción intacta: con el flag en `false`, `generateProceduralWorldMap` devuelve el layout uniforme byte a byte.

- `constants.ts`: `export const USE_VARIABLE_LAYOUT = false;`.
- `worldMap.ts`:
  - El cuerpo original se renombró a `generateUniformWorldMap` (lógica idéntica). `generateProceduralWorldMap` es ahora un **dispatcher**: con flag off → uniforme; con flag on → prueba 12 semillas derivadas con `generateVariableWorldMap` + `validateWorldMap`, y si ninguna valida **cae al uniforme** (fallback seguro).
  - `generateVariableWorldMap(roomPool, seed): WorldMapState | null`: empaquetado por anclaje (K=24 intentos/sala, margen 0.6). Sala 0 en el origen; salas 1-3 como árbol de expansión anclando a un borde libre a `ROOM_GAP` exacto con deslizamiento que garantiza solape ≥ `DOOR_WIDTH + 2·margen`; sala 4 fuerza un **ciclo** (busca posición adyacente a dos salas); boss el último como **hoja** (adyacencia única, puerta `requiresKey`). Rotación por sala vía `rotateRoomDefinition` (se guarda en `instance.rotation`). Puertas en el **centro del solape** del borde compartido (offsets ≠ 0 → Fase 3 de puertas libres ya cubierta por reutilizar `doorWorldPosition`/`getDoorBridges`, que ya respetan `slot.offset`). **Se autovalida**: devuelve `null` si su salida no pasa `validateWorldMap`.
  - `validateWorldMap(map): boolean`: conectividad (BFS), boss gateado por llave, llave alcanzable sin cruzar la puerta del boss, ciclo en el subgrafo sin-boss, no-solape de salas, y **no muros dobles**: rechaza solape de área entre muros de línea de **misma orientación** (paralelos); ignora los de orientación cruzada (esquinas T/L, geometría legítima).
- Tests: 90 en total (86 + 4): flag off ⇒ layout uniforme; 40 seeds de `generateVariableWorldMap` pasan validador + invariantes de geometría; ≥12/40 producen dims variables (real: **35/40**); el fallback siempre da un mapa válido.
- **Nota de revisión:** la primera versión relajó el check de muros dobles a "misma línea", dejando pasar muros **paralelos** doblados en 5/40 seeds (área hasta 1.79). Corregido: el check distingue orientación; medido fuera de banda → **0/40 solapes paralelos** tras el arreglo (los cruces perpendiculares de esquina, 34/40, son correctos). Verificado: `npm test` 90/90, `npm run build` limpio.

## 2026-06-29 — Escenarios no cuadrados · Red de seguridad de geometría de muros (pre-Fase 2)

Tests de geometría que blindan los invariantes del merge de muros **antes** de cambiar la colocación a tamaños variables (orden recomendado del plan: "Fase 4 tests ANTES que Fase 2"). Solo añaden tests; no tocan producción. Pasan contra la rejilla uniforme actual — su valor es detectar regresiones cuando llegue la Fase 2.

- `tests/run-tests.ts`: 3 tests nuevos + 2 helpers locales (`aabbOverlapArea`, `forEachSeed` que barre seeds 1–40):
  1. **No hay muros de línea solapados** (detecta muros dobles / cruces en esquinas T/L): ningún par de `WallObstacle` sin `connectionId` solapa con área > `1e-3`.
  2. **Toda conexión pasable** tiene exactamente un puente (`getDoorBridges`) centrado en la puerta y ningún muro de línea cubre el centro del hueco.
  3. **Toda conexión NO pasable** tiene exactamente una barrera con su `connectionId` cubriendo el centro de la puerta; la del boss lleva `requiresKey === true`.
- Total: 84 tests (81 + 3). Verificado: `npm test` 84/84.

## 2026-06-29 — Escenarios no cuadrados · Fase 1: `rotateRoomDefinition` (primitiva pura)

Primera fase del plan `docs/plans/NON_SQUARE_SCENARIOS.md`. Groundwork de bajo riesgo: **no** cambia la generación del mapa ni la colocación todavía; solo añade la primitiva pura para rotar salas en múltiplos de 90°.

- `worldMap.ts`: nueva `rotateRoomDefinition(room: RoomDefinition, deg: 0|90|180|270): RoomDefinition`, junto a `offsetRoomDefinition`. Pura (no muta la entrada), rota alrededor del centro de la sala.
  - Convención (la `y` de `Vec2` es el eje Z/"sur", así que north = -y; +90 se ve como horario en pantalla): `90:(-y,x)`, `180:(-x,-y)`, `270:(y,-x)`. Remapeo de lados → `90`: north→east, east→south, south→west, west→north; `270`: el inverso.
  - `width`/`height` se intercambian en 90/270. Rectángulos de hazard (`width`/`height`) también se intercambian. Puntos (`playerStart`, `enemy.pos`, `patrolTarget`/`patrolAnchor`/`homePos`, `hazard.pos`, `item.pos`) se rotan; direcciones (`spikeDir`, `patrolAxis`, `hazard.dir`) se rotan como vectores.
  - **Door slots**: `{side, offset}` se re-derivan geométricamente (se rota el punto del borde y se re-detecta la cara con las nuevas dimensiones), no con un mapa de lados a mano. Coordenadas y offsets cuantizados a 1e-6 para estabilidad ante coma flotante.
- Tests: 81 en total (74 anteriores + 7 nuevos): ida y vuelta 90+270 y 180+180, 4×90 = identidad, swap de dimensiones, contención dentro de límites tras 90° (con swap de rectángulo verificado), lado de puerta correcto tras 90° y 270°, y no-mutación de la entrada.
- Verificado: `npm test` (81/81) y `npm run check` (tsc + build) en verde.

## 2026-06-29 — Patrulla mínima universal: ningún enemigo se congela en salas inactivas

- `enemyAi.ts` `updateInactiveRoomEnemy`: todos los tipos de enemigo realizan ahora una patrulla mínima alrededor de su `patrolAnchor` (posición de spawn) cuando el jugador está en otra sala. Se elimina la rama `dist < 0.18` que congelaba a los tipos chase.
  - `chaser` y `shooter`: antes volvían a `homePos` y se detenían; ahora patrullan suavemente a `DUMMY_PATROL_SPEED` alrededor de su spawn. Esto también los lleva de vuelta a casa después de una persecución, sin congelarlos al llegar.
  - `trail`: ahora sigue depositando rastros mientras el jugador está en otra sala (misma lógica que la rama activa: decrementa `trailTimer`, empuja a `state.trails` cuando llega a 0 y lo resetea a 0.55).
  - `shooter`: solo se mueve en patrulla; no dispara cuando el jugador está en otra sala.
  - `dummy` y `spike`: sin cambio en comportamiento observable (ya patrullaban).
- Tests: 75 en total (72 anteriores + 3 nuevos):
  1. Chaser inactivo siempre tiene velocidad no nula (minimal patrol).
  2. Chaser inactivo y shooter inactivo ambos con velocidad > 0; shooter no dispara proyectiles.
  3. Trail inactivo deposita al menos un segmento de rastro en un tick (y también se mueve).

## 2026-06-29 — Fase D: A* por sala + retorno a homePos en salas inactivas

### Pathfinding generalizado a rejillas por sala
- `pathfinding.ts`: `PathGrid` ahora es autocontenida: lleva `bounds: GridBounds` y `roomId: string | null`, por lo que `worldToCell`/`cellToWorld`/`findPath`/`hasClearPath`/`reconstructPath` usan `grid.bounds` en vez de la sala activa global.
- La caché única `cachedPathGrid`/`cachedPathGridKey` se reemplazó por `Map<cacheId, { grid, key }>` — una entrada por sala (cacheId = `room.id` o `'single'` para modo sala simple). Las entradas de path por enemigo ya caducan solos a los 0.12 s; se elimina el `enemyPathCache.clear()` global que se ejecutaba con cada rebuild.
- `buildPathGrid(state, room?)`: acepta un `WorldRoomInstance` opcional. Sin argumento se comporta exactamente igual que antes (sala activa = compatibilidad con todos los tests existentes).
- `steerAwayFromNearbyHazards(state, from, dir, radius, roomId?)`: nuevo parámetro opcional `roomId`; filtra hazards por esa sala. Si se omite, usa la sala activa (comportamiento anterior).

### homePos en enemigos
- `types.ts` `EnemyState`: añadido `homePos?: Vec2`.
- `roomSystem.ts` `loadWorldMap` y `loadRoomDefinition`: `homePos: cloneState(enemy.pos)` fijado en el momento de materializar cada enemigo (posición de spawn).

### Retorno a homePos en salas inactivas (con A*)
- `enemyAi.ts`: `updateNeighbourPatrol` eliminado y reemplazado por `updateInactiveRoomEnemy`.
  - Tipos `dummy`/`spike`/`trail`: siguen patrullando dentro de su sala pero ahora con A* contra la rejilla de esa sala (evitan rocas, fosos y pinchos).
  - Tipos `chaser`/`shooter`: al no estar el jugador en su sala, vuelven a `homePos` usando A* contra la rejilla de su sala; deceleration suave al llegar (< 0.18 u).
- La contención (`integrateEnemies` clamp a `enemyRoomBounds`) no cambia; los enemigos siguen confinados a su sala.
- `updateEnemyAi` para la sala activa: sin cambios (chase / patrol A* activo exactamente igual).

### Tests nuevos (72 en total, 68 anteriores + 4 nuevos)
1. `buildPathGrid` para sala no-activa: verifica `bounds`, `roomId` y que un rock en esa sala queda marcado como bloqueado.
2. Chaser inactivo desplazado de `homePos` produce velocidad hacia `homePos`.
3. Chaser inactivo con roca entre él y `homePos` nunca solapa la roca en 30 ticks.
4. Regresión: chaser en sala activa sigue persiguiendo al jugador.

## 2026-06-29 — Fase A+B: Reacciones puramente geométricas + pinchos→enemigo + separación enemigo↔enemigo

### Fase A — Eliminados 4 gates de sala en reacciones
- `damageSystem.ts` `explodeBarrelInPlace`: la explosión de un barril ahora daña a CUALQUIER enemigo dentro del radio (`BARREL_RADIUS + enemy.radius`), sin filtrar por sala.
- `damageSystem.ts` `applyExplosiveBodySplash`: la onda del cuerpo explosivo daña por radio sin filtrar por `currentRoomInstanceId`.
- `simulation.ts` `resolveHostileEnemyPressure`: un enemigo hostil que contacta al jugador aplica presión sin importar su sala.
- `simulation.ts` `collectItems`: el jugador recoge items por proximidad geométrica, sin gate de sala.

### Fase B1 — Pinchos del suelo → enemigo
- `simulation.ts` `resolveHazards`: los hazards `spikes` ahora también dañan a los enemigos que los pisan (`SPIKE_DAMAGE`, cooldown 0.5 s en `enemy.contactCooldown`). Permite empujar a un enemigo sobre pinchos.

### Fase B2 — Separación enemigo↔enemigo (sin daño directo)
- `collisions.ts` nueva función `separateEnemies`: separa por radio cualquier par de enemigos vivos que se solapen (empuje simétrico, media distancia cada uno). Después clampea cada enemigo a los límites de su propia sala (`enemyRoomBounds`).
- `simulation.ts` `tickGame`: se llama `separateEnemies` tras `integrateEnemies` y antes de `resolveHazards`, para que un enemigo empujado sobre un foso/pinchos ese mismo frame reciba el daño.

### Principio consolidado
Las reacciones (daño, explosión, foso, rebotes, recogidas) son **puramente geométricas** (radio/solape). Lo que impide golpes imposibles es la geometría (muros + separación entre salas), no un filtro de `roomInstanceId`.

## 2026-06-29

- **FIX A — Color de llave**: la llave ahora se renderiza en dorado (`#ca8a04`), el mismo color que la barrera de la puerta del boss, en vez de gris claro. Hace obvia la correspondencia visual entre llave y cerradura.
- **FIX B — Puerta del boss: se abre por contacto, no por recoger la llave**: la barrera dorada permanece sólida incluso después de recoger la llave. Solo desaparece cuando el jugador colisiona físicamente con ella (teniendo la llave). Cambios: nuevo campo `unlocked?: boolean` en `WorldDoorConnection`; `isConnectionPassable` comprueba `unlocked` en vez de `hasKey`; `collideCircleWithWorldWalls` acepta un tercer parámetro `canUnlock` (solo activo para el jugador) que setea `conn.unlocked = true` al primer contacto; `wallCacheKey` incluye `unlocked` para invalidar el caché. Los proyectiles siguen rebotando en la barrera hasta que se abre.
- **FIX C — Rebotes anti-absorción**: los rebotes en paredes (muros del mundo, sala fallback y rocas) ya no se "absorben" cuando el círculo solapa dos segmentos co-lineales en el mismo frame. Se añadió un guard `if (dot(vel, normal) < 0)` antes de cada `reflect`, que evita reflejar la velocidad cuando ya apunta hacia fuera de la pared (lo que cancelaba el rebote anterior).
- **FIX D — Sombras que siguen al jugador**: el `directionalLight` estático con frustum fijo centrado en el origen se reemplazó por un componente `FollowLight` que, en cada frame, mueve la luz y su target a la posición del jugador. El frustum ajustado (±11 en x/z, near 0.5, far 30) siempre cubre el área activa con alta densidad de texel, eliminando sombras ausentes/cortadas en salas alejadas del origen. Se añadió `shadow-normalBias={0.04}` para reducir acné de sombra.

## Unreleased

- Barriles y hazards de la sala contigua: ya se pueden explotar barriles de la sala de al lado con un proyectil por la puerta (quitados los filtros por sala en `resolveHazards`); la explosión daña a los enemigos de la sala del barril (no de la activa).
- Puertas: una sala se "limpia" y abre sus puertas en cuanto sus enemigos mueren, aunque la mates a distancia desde la sala contigua (antes solo se limpiaba la sala activa). La mejora sigue dándose solo al limpiar la sala en la que estás.
- La puerta del boss (requiere llave) se pinta en dorado para distinguirla de una puerta cerrada normal (roja).

- Rendimiento (móvil): el suelo pasa de ~700 meshes individuales (uno por tile × 6 salas) a un único `InstancedMesh` → de ~700 draw calls a 1. Mismos visuales. Con `frustumCulled={false}` para que no se cullee entero al alejarse del origen.

- Ahora se puede atacar a la sala contigua a través de una puerta abierta: quitado el filtro por sala en las colisiones de ataque (proyectil y cuerpo). La geometría (muros + separación de salas) impide los golpes a través del muro, así que el filtro ya no hacía falta y solo bloqueaba el ataque legítimo por la puerta.
- Refactor: extraído el módulo de colisiones (`collisions.ts`: sweeps de proyectil contra muros/rocas, colisión círculo-vs-muro/obstáculo, tests de hazards). Con esto el split de `simulation.ts` queda hecho: pathfinding, IA, flujo de mundo y colisiones en sus módulos. `simulation.ts` pasa de ~1594 a ~615 líneas (−61%), ya como orquestador.

- World-gen rehecho a **colocación en rejilla uniforme**: cada sala se centra en una celda del tamaño de la sala mayor sobre una cuadrícula regular. Elimina los solapes de salas y los muros dobles/cruzados (los bordes compartidos coinciden exactos y se fusionan). Grafo de adyacencia con ciclos (núcleo 2×2), 1 puerta centrada por adyacencia, y boss como hoja tras puerta de llave (la llave siempre es alcanzable antes). Validado en 300 semillas. La rotación de salas queda en backlog (`ROADMAP.md`).
- Bug corregido: el caché de muros no incluía offsets/tamaños de sala en su clave, así que `resetRun` (mapa nuevo con misma estructura de conexiones) podía devolver muros del mapa anterior.
- Refactor: extraído el flujo de mundo/sala (`updateCurrentWorldRoom`, `checkRoomClear`, `advanceRoomClearReward`) a `worldFlow.ts`. Con pathfinding + IA + worldFlow, `simulation.ts` baja de ~1594 a ~957 líneas.

- Refactor: extraída la IA de enemigos (patrullas, chase, shooter) de `simulation.ts` a `enemyAi.ts`. Con pathfinding, `simulation.ts` baja de ~1594 a ~1022 líneas.
- Bug corregido: el knockback al golpear a un enemigo recortaba contra `state.room` centrado en el origen, teletransportando a los enemigos de salas con offset (parecían "reaparecer en otro sitio" y a veces quedaban inalcanzables, impidiendo abrir las puertas). Ahora se recorta contra los límites de la propia sala del enemigo.
- Bug corregido: las colisiones con enemigos (proyectil, cuerpo, presión, explosiones) ahora se filtran por sala activa, así que un disparo ya no golpea ni muestra impacto en un enemigo de la sala contigua.

- Refactor: extraído el motor de pathfinding (A*, grid, steering) de `simulation.ts` a `pathfinding.ts` (1594→1280 líneas). Primer paso del split del God file; sin cambios de comportamiento (tests verdes).
- Render imperativo: `Enemy` y `Player` se actualizan vía `useFrame` mutando refs (posición, orientación, hit-flash, barra de vida, estela) en vez de re-renderizar React cada frame; `Enemy` recibe solo `id` y está memoizado. Mismos visuales (traducción fiel).
- Puertas de 2 tiles de ancho (`DOOR_WIDTH`).
- Los enemigos patrulleros (dummy/spike/trail) de las salas contiguas ahora patrullan con steering ligero (sin pathfinding de la sala activa); chasers/shooters esperan a que entres.
- El empujón de un enemigo ya no puede expulsar al jugador fuera del escenario: se re-aplica la contención (muros + AABB) tras las colisiones enemigo-jugador.
- La previsualización de lanzamiento ya no rebota en las puertas abiertas: la trayectoria pasa a través del hueco.

- Rendimiento: la simulación clona el estado una sola vez por tick (antes ~30 veces); pathgrid A* cacheado + min-heap + throttle por enemigo; obstáculos de muro del mundo cacheados (antes se reconstruían por entidad y frame). Ver `docs/instructions/ARCHITECTURE_INVARIANTS.md`.
- Render: en modo mundo solo se dibujan las entidades de la sala activa (culling), igual que ya se simulaban.
- Bug corregido: las patrullas se recortaban contra el origen del mapa, así que los enemigos abandonaban su sala (rompía patrullas y dejaba salas sin limpiarse). Ahora se recortan contra los límites de mundo de su propia sala.
- Muros del mundo rehechos con grosor uniforme: se generan por líneas (unión de bordes de sala menos huecos de puerta) en vez de 4 muros por sala, eliminando los muros dobles en bordes compartidos.
- Contención: los enemigos ya no pueden salir de su sala (clamp a los límites de su sala) y el jugador no puede salir del escenario (clamp al AABB del mundo, evita el tunneling a velocidad de lanzamiento).
- Patrullas: eligen el eje (horizontal/vertical) con más espacio libre y dan media vuelta al toparse con un hazard; el dummy de la sala 1 ya no se atasca contra el barril y completa su patrulla.
- Las salas se separan el grosor del muro: los muros van por fuera y los tiles del borde salen enteros (sin solapes); cada puerta tiene un puente de suelo para tapar el hueco.
- Previsualización de lanzamiento: los rebotes se calculan contra los límites reales de la sala actual (coords de mundo), así que se muestran desde el principio y no solo tras limpiar la sala.
- Render: revertido el culling por sala (los enemigos de salas vecinas ya no "aparecen de la nada" al entrar); la simulación sigue corriendo solo la sala activa.
- Documentadas las invariantes de arquitectura en `docs/instructions/ARCHITECTURE_INVARIANTS.md` (enlazado desde `AGENTS.md`).

- Añadido mapa procedural continuo: las salas manuales se colocan como instancias conectadas por puertas, con sala start, key y boss.
- Las puertas cerradas bloquean, las puertas abiertas son huecos pasables y la conexión de boss requiere recoger la key física.
- La cámara ahora sigue al jugador por el mundo continuo y las mejoras ya no cargan automáticamente la siguiente sala.
- El editor permite asignar `RoomTag`, editar hasta dos puertas por pared con separación y colocar item `key`.
- Eliminado `?scenario=pits`; las pruebas de fosos quedan cubiertas por tests de core y checklist general.
- Corregida la patrulla de spike/trail creada en editor para alternar entre posición inicial y punto de patrulla; spike/trail ya no persiguen y el spike orienta sus pinchos hacia el próximo destino.
- Mejorado el editor de salas: columnas compactas, puntos de patrulla automáticos/editables para enemigos patrulleros, botón de probar nivel y guardado JSON por sala mediante Vite dev server.
- Añadido editor inicial de salas en `/editor` con grid, paleta de enemigos/peligros/objetos, edición básica de propiedades, validación y export de `RoomDefinition`.
- Los impactos fuertes del cuerpo dañan al chaser aunque tenga cooldown reciente por contacto/presión.
- Los pinchos fijos de suelo expulsan al jugador fuera de la trampa al aplicar daño para evitar bloqueos dentro.
- Corregido el rebote del hechizo contra rocas para que no reimpacte en el siguiente tick ni pinte dos efectos de impacto.
- Rehecha la caída de fosos sin Rapier: la bola conserva velocidad horizontal de entrada y empieza a caer sin salto vertical inicial antes del respawn.
- Añadido punto de no retorno en fosos: si la bola ya ha caído demasiado, tocar suelo al otro lado bloquea la inercia horizontal y se ve caer hasta más abajo en vez de aparecer arriba.
- Corregido el apuntado: la línea de arrastre pasa a ser una cuña 2D fija en el inicio, gruesa al principio y fina al final, sin aro blanco, y la trayectoria usa punta triangular 2D.
- Los impactos de proyectiles se muestran verticales y el shake deja de quedarse activo al terminar la partida.
- Las flechas y demás proyectiles chocan contra rocas en vez de atravesarlas.
- Los impactos de proyectiles contra paredes se colocan sobre el plano de la pared, no desplazados hacia dentro de la sala.
- Los hechizos rebotan también contra rocas y los impactos de pared/roca se renderizan con prioridad para que no queden ocultos.
- La caída sólo se activa al entrar en la zona interior del foso, evitando que un roce de esquina cuente como caída.
- Si la bola cruza un foso pequeño con suficiente velocidad y vuelve a quedar sobre suelo firme, aterriza en lugar de atravesar el suelo.
- Durante la caída de foso se congela el motor cinemático normal y sólo corre el estado especial de caída, evitando el bucle de bajar/subir.
- Entrar en un foso activa una parábola cinemática especial; el daño y respawn ocurren al cruzar el umbral vertical de caída.
- Eliminada la dependencia de `@react-three/rapier`; el MVP vuelve a ser completamente cinemático.
- Los proyectiles generan un impacto visual al chocar con paredes, enemigos, barriles o el jugador.
- El foso vuelve a depender de física real: el suelo es ausencia de collider y la bola cae por gravedad antes del respawn.
- Optimizado el A* enemigo a celdas de 1 tile con malla bloqueada compartida por tick de IA.
- Reducidas renderizaciones estáticas preservando referencias de `room`, `hazards` e `items` cuando no cambian y memoizando sala, peligros e items.
- Reducido el coste gráfico bajando el techo de DPR y la resolución del shadow map.
- Ajustado el zoom de apuntado para pivotar sobre el punto inicial del gesto sin desplazarlo en pantalla.
- Eliminada toda la geometría de borde del hazard de foso: varios fosos juntos forman un único hueco visual sin juntas internas.
- Corregido el foso para que no dispare VFX/shake de daño y se lea como hueco rectangular del escenario, sin aro circular.
- Eliminado el fondo/cuadrado negro del render del foso; el hueco se apoya en ausencia de suelo y paredes internas.
- Normalizadas las salas a elementos centrados en tiles: peligros rectangulares divididos en piezas `1x1`, enemigos, objetos y barriles centrados en tile.
- Las flechas perforantes ya no pueden golpear dos veces al mismo enemigo antes de avanzar al siguiente.
- Alargada la caída visual del héroe en fosos para que se vea bajar por debajo del escenario antes del respawn.
- Ajustada la caída del foso para que ocurra dentro del hueco, no desde el suelo cercano al borde.
- El suelo de la sala se renderiza como cubos de tile, dejando agujeros reales donde hay fosos.
- Las monedas recogidas ya no encogen; suben con tamaño estable y se desvanecen al llegar arriba.
- Ajustada la cuadrícula para que quede dentro de las paredes y alineada a salas con dimensiones impares, con enemigos y barriles en posiciones enteras de tile.
- Reforzado el A* enemigo contra barriles con margen extra, evitación local y bloqueo de corte diagonal en esquinas.
- El menú de pausa ahora pausa realmente la simulación y bloquea input/acciones mientras está abierto.
- Convertida la leyenda del modal de pausa a acordeón y cambiado el cierre a botón `×`.
- Subidas las monedas sobre el suelo y cambiado el pickup para que la moneda suba sobre el jugador y se desvanezca sin shake.
- Los enemigos vuelven a explotar barriles si llegan a tocarlos; el pathfinding intenta evitarlos antes de ese contacto.
- Las zonas de impulso aceleran la trayectoria actual de la bola sin redirigirla.
- Ampliada la cámara de sombras direccional para evitar cortes visibles en paredes.
- Suavizado el indicador frontal de enemigos normales para evitar el pico blanco parpadeante; el shooter conserva su cono blanco.
- Reordenado el HUD: card de texto arriba, card de vida/monedas debajo y acciones de leyenda/reinicio dentro de un menú de pausa.
- Añadido modal de pausa con reinicio, leyenda y listado de mejoras recogidas.
- Ajustados botones inferiores: sin sombra en texto, borde grueso por color, y solo el modo seleccionado aparece relleno.
- Los enemigos orientan su indicador frontal hacia la dirección de movimiento; el cono-pincho actualiza su lado peligroso hacia donde se mueve.
- Cambiadas reglas base: hechizos se consumen al golpear enemigo y tienen 1 rebote; flechas atraviesan 1 enemigo antes de expirar en el siguiente.
- Giradas las salas portrait para que el jugador empiece desde la parte inferior.
- Actualizado Tailwind CSS a v4 con `@tailwindcss/vite`, usando Node v24.16.0 de nvm.
- Corregidas patrullas que podían quedarse empujando contra la pared cuando su target quedaba fuera de la sala.
- Ajustado HUD: vida y monedas salen de la card, botones inferiores usan color por habilidad y el cooldown se vacía/rellena completo.
- Cambiada la punta de la trayectoria discontinua a una flecha plana 2D.
- Rediseñados comportamientos enemigos: dummies patrullan/persiguen con leash, chaser persigue siempre y acelera al apuntar, cono-pincho/trail abandonan ruta al perseguir y shooter alterna persecución/parada/disparo.
- Añadido pathfinding en grid para persecuciones evitando rocas, fosos, pinchos y barriles.
- Añadidos cooldowns independientes por acción: cuerpo 0.2s, flecha 0.5s y hechizo 1.0s, con relleno visual en botones.
- Migrada la UI principal a Tailwind CSS y añadidos corazones de vida e iconos de mejoras.
- Mejorados placeholders visuales: dummy rojo, chaser naranja, cono-pincho gris con varios pinchos, trail verde, shooter negro con cono blanco y foso con aspecto de agujero.
- El daño al jugador ahora aplica empuje contrario y partículas con el color del modo actual.
- Valorada migración completa a Rapier; se descarta para el MVP y el core cinemático mantiene movimiento, caída, reglas, IA y tests puros.
- Restaurada la cámara inclinada del prototipo original y ajustada la distancia para móvil vertical.
- Cambiado el apuntado a gesto tipo tirachinas con eventos nativos de canvas: el toque puede empezar en cualquier zona interactiva y la acción sale en dirección opuesta al arrastre.
- Permitido relanzar el cuerpo o disparar proyectiles/magia durante el movimiento cuando termina el cooldown.
- Rotadas las salas manuales a formato vertical y ajustado el encuadre para que ocupen más pantalla móvil.
- Añadida leyenda desplegable para distinguir héroe, enemigos, objetos y peligros.
- Ajustada la IA para que chaser/trail rodeen fosos en vez de ir directos a ellos.
- Cambiadas las pociones a cilindros rosas pequeños y los enemigos spike a conos con punta dañina.
- Aumentado el movimiento enemigo: dummies derivan, chasers patrullan, spikes se desplazan sobre su eje y trail/chaser son más rápidos.
- Corregida la orientación visual del cono spike y cambiada la idle AI del chaser a rutas de patrulla.
- Añadida capa de juice provisional: VFX de acciones principales y shake de cámara.
- Aumentado mucho el camera shake y añadido daño por presión cercana de chaser/trail.
- Añadido delay antes de recompensas al limpiar sala y ajustado el shake para que tenga más desplazamiento y menos sensación de rotación.
- Ajustada la previsualización discontinua: en modo flecha termina al chocar, mientras el modo cuerpo conserva rebotes visuales.
- Añadido empujón/flash a enemigos al recibir daño y zoom ligero de cámara durante el apuntado.
- Añadida luz puntual pulsante a los hechizos y reforzado su rastro luminoso.
- Eliminado el rastro cúbico del hechizo y añadido retroceso del héroe al disparar flechas/hechizos.
- Sustituido el aro de lanzamiento del héroe por un rastro de velocidad que sigue a la bola y se escala con su velocidad.
- Los dummies ahora dañan al jugador en contactos flojos o si lo alcanzan con su movimiento.
- Actualizados tests, contrato de gameplay y checklist manual para el nuevo control.

## 0.1.1 — Context pack para continuidad IA

- Corregidos errores de TypeScript que impedían `npm run build` (`AimIndicator` y pointer capture).
- Añadido `package-lock.json` para instalaciones reproducibles.
- Añadido `docs/QA_REPORT_2026-06-24.md` con resultados de `npm test` y `npm run build`.
- Ajustado `tsconfig.node.json` para emitir artefactos de build en `dist-node`.
- Añadidas carpetas `docs/definitions/`, `docs/instructions/`, `docs/agents/`, `docs/skills/` y documentación adicional en `tests/`.
- Añadido `AGENTS.md` como punto de entrada para nuevas sesiones con IA.
- Añadidas guías de arquitectura, diseño, testing, tuning y roadmap.
- Añadidas instrucciones para agentes: implementación, supervisión, QA y diseño.

## 0.1.0 — MVP inicial

- Prototipo jugable con Vite + React + TypeScript.
- Render 3D con React Three Fiber.
- Estado global con Zustand.
- Movimiento drag & release.
- Cinco salas manuales.
- Enemigos dummy, chaser, spike y trail.
- Peligros: fosos, pinchos, barriles, rocas, zonas lentas e impulso.
- Monedas, pociones, mejoras, victoria y derrota.
- Tests de lógica pura.
