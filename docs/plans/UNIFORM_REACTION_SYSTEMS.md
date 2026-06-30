# Plan — Reacciones uniformes e independientes de la sala

Estado: **propuesta / no implementado**. Decidido con el usuario:
- Las **reacciones** (daño, explosiones, foso, rebotes, recogidas) son **100% geométricas**
  (por radio/solape), **nunca filtradas por sala**. Lo que impide interacciones imposibles
  es la geometría (muros + separación entre salas), no un filtro de `roomInstanceId`.
- La **IA/movimiento de enemigos SÍ sigue acoplada a la sala** (contención estilo Isaac +
  solo la sala activa corre A* completo, por rendimiento en móvil). **Novedad**: si un
  enemigo te persigue y sales de su sala, **vuelve a su posición inicial**.
- Enemigo↔enemigo: **solo colisión/separación** (no se hacen daño directo; pueden empujarse
  a un foso/pinchos/barril y eso sí los daña — emergente).

Antes de tocar nada: leer `docs/instructions/ARCHITECTURE_INVARIANTS.md` (puntos 1, 3, 5, 6).

---

## 1. Principio rector

> **Una reacción depende solo de quién toca a quién y dónde (radio/solape), no de en qué
> sala está nadie.** El único vínculo enemigo↔sala que queda es: (a) abrir las puertas de
> esa sala al limpiarla, (b) a quién persigue/qué A* corre la IA, (c) mantener al enemigo
> dentro de su sala, (d) devolverlo a su origen cuando el jugador se va. Nada de esto debe
> alterar el RESULTADO de un golpe, explosión, caída o rebote.

---

## 2. Auditoría del estado actual

| Reacción | Actores afectados | Estado hoy |
|---|---|---|
| Barril explota al tocarlo | proyectil ✓, jugador ✓, enemigo ✓ | OK (se dispara siempre) |
| Daño de la explosión del barril | jugador ✓, enemigos | **GATED** a la sala del barril (`damageSystem.ts:132`) |
| Onda expansiva (cuerpo explosivo) | enemigos | **GATED** a la sala activa (`damageSystem.ts:147`) |
| Proyectil → enemigo | enemigo | OK, global (`simulation.ts:518`) |
| Cuerpo del jugador → enemigo | enemigo | OK, global (`simulation.ts:478`) |
| Presión/arrollar de enemigo → jugador | jugador | **GATED** a la sala activa (`simulation.ts:506`) |
| Foso → jugador (daño + respawn) | jugador | OK, global |
| Foso → enemigo (muerte directa) | enemigo | OK, global (`simulation.ts:450`, daño 99) |
| Pinchos del suelo → jugador | jugador | OK, global (`simulation.ts:400`) |
| **Pinchos del suelo → enemigo** | enemigo | **FALTA** (no existe) |
| Muros rebotan | proyectil ✓, jugador ✓, enemigo ✓ | OK, global |
| Rocas rebotan | proyectil ✓, jugador ✓, enemigo ✓ | OK, global |
| **Enemigo ↔ enemigo (separación)** | enemigos | **FALTA** (se solapan entre sí) |
| Recoger items (moneda/llave/poción) | jugador | **GATED** a la sala activa (`simulation.ts:566`) |
| Rastro dañino → jugador | jugador | OK, global |
| **Rastro dañino → enemigo** | enemigos | decisión menor (ver §3.E) |

Resumen: 4 reacciones con gate de sala que hay que **quitar**, 2 reacciones que **faltan**
(pinchos→enemigo, separación enemigo↔enemigo), y la IA con su acoplamiento de sala que se
**mantiene** + retorno a origen.

---

## 3. Cambios concretos

### A. Quitar los 4 gates de sala en reacciones
- `damageSystem.ts:132` (`explodeBarrelInPlace`): eliminar el `if (... enemy.roomInstanceId !== barrel.roomInstanceId) continue;`. La explosión daña a **cualquiera dentro de `BARREL_RADIUS`** (un enemigo justo al otro lado de una puerta abierta es un golpe legítimo).
- `damageSystem.ts:147` (`applyExplosiveBodySplash`): eliminar el gate por `currentRoomInstanceId`. Daña por radio (1.55) a cualquier enemigo.
- `simulation.ts:506` (`resolveHostileEnemyPressure`): eliminar el gate por sala. Un enemigo que te toca te presiona, esté donde esté (solo lo limita el contacto físico, que ya requiere proximidad real a través de una puerta).
- `simulation.ts:566` (`collectItems`): eliminar el gate por sala. Recoges lo que tocas.

> Nota: estos gates son justo los que el invariante §5 ya dice "no volver a meter". Esta fase
> los elimina del todo y lo consolida.

### B. Reacciones que faltan

**B1. Pinchos del suelo → enemigo.** En `resolveHazards`, donde hoy los pinchos solo dañan
al jugador (`simulation.ts:400`), añadir un barrido sobre enemigos: si un enemigo solapa un
hazard `spikes`, aplicarle daño (`SPIKE_DAMAGE` o el daño de pinchos correspondiente) con un
cooldown por enemigo (reusar `enemy.contactCooldown`) para no drenarle la vida cada frame.
Empujarlo fuera como con el jugador (opcional). Esto, combinado con la separación
enemigo↔enemigo (B2), permite "empujar a un enemigo a los pinchos".

**B2. Separación enemigo↔enemigo.** Hoy los enemigos pueden solaparse. Añadir un sistema de
separación (sin daño): para cada par de enemigos vivos cuyos círculos se solapen, repartir
el empuje a lo largo de la normal (mitad cada uno), igual que `collideEnemiesWithCircleObstacle`
pero entre dos enemigos. Tras separar, reclampar cada uno a los límites de su propia sala
(`enemyRoomBounds`). Coste O(n²) sobre enemigos vivos — n es pequeño (una sala), aceptable;
si crece, usar una rejilla espacial. **Sin daño directo** (decisión del usuario): el daño solo
llega si la separación empuja a un enemigo a un foso/pinchos/barril, que ya lo resuelven sus
propios sistemas geométricos.

### C. Centralizar en "sistemas" con nombre

El usuario pidió "crear sistemas para cada cosa". Hoy las reacciones están repartidas dentro
de `resolveHazards` (un bucle gigante) y varias funciones en `simulation.ts`. Propuesta de
reorganización (sin cambiar el modelo de tick: un solo clon, mutación in situ, §1 del
invariante), agrupando por **tipo de interacción** en módulos claros:

- `systems/barrelSystem.ts` — detección de toque (proyectil/jugador/enemigo) + explosión por radio.
- `systems/hazardSystem.ts` — foso (jugador y enemigo), pinchos (jugador y enemigo), slow/boost, rastro.
- `systems/contactSystem.ts` — cuerpo jugador↔enemigo, presión enemigo→jugador, separación enemigo↔enemigo.
- `systems/projectileSystem.ts` — proyectil↔muro/roca/barril/enemigo/jugador.
- (los rebotes contra muros/rocas ya viven en `collisions.ts`; se mantienen.)

Cada sistema:
1. No recibe ni consulta `currentRoomInstanceId` para decidir reacciones (solo geometría).
2. Es una función `(state, dt) => state` que muta el borrador, llamada en orden desde
   `tickGame`. El orden actual se preserva (integrar → resolver hazards → colisiones →
   limpieza de sala) para no cambiar el comportamiento físico.

> Esto es **refactor de organización**, no de lógica: se puede hacer en un paso posterior y
> de forma incremental (extraer una a una con tests verdes entre medias). Si se prefiere,
> las fases A/B/D se pueden aplicar primero sobre la estructura actual y dejar C para el final.

### D. IA por sala + retorno a la posición inicial (con A*)

Mantener el acoplamiento de sala de la IA (Isaac), con un añadido y un cambio de pathfinding:

- **Posición de origen (`homePos`)**: cada enemigo guarda su posición de spawn. Añadir
  `homePos: Vec2` a `EnemyState` y rellenarlo al materializar el enemigo (en `roomSystem.ts`).
- **Retorno CON A***: cuando el jugador NO está en la sala del enemigo, el enemigo que se
  había desplazado (p.ej. el `chaser` que perseguía) debe **volver a `homePos`**, pero
  **sin chocar con rocas, sin pasar por encima de fosos ni sobre otros enemigos** → decisión
  del usuario: usa **A***, no steering ligero. Al llegar, idle (o retoma patrulla los tipos
  que patrullan).
- **El A* deja de ser exclusivo de la sala activa.** Hoy todo el pathfinding está cableado a
  `currentRoomInstanceId` (una única rejilla cacheada a nivel de módulo, y `worldToCell`/
  `cellToWorld`/`getPathBounds`/filtro de hazards usan la sala activa). Para que un enemigo
  de una sala NO activa pueda usar A* en SU sala, hay que **generalizar `pathfinding.ts` a
  rejillas por sala**:
  - `PathGrid` pasa a ser autocontenida: añadir `bounds: RoomBounds` y `roomId` al objeto, y
    que `worldToCell`/`cellToWorld`/`findPath`/`hasClearPath`/`reconstructPath` usen
    `grid.bounds` en vez de `getPathBounds(state)` (quitar la dependencia de la sala activa
    en la aritmética de celdas).
  - Caché por sala: sustituir `cachedPathGrid` único por `Map<roomId, {grid, key}>`
    (si no, al alternar entre salas dentro del mismo frame la caché única se reconstruye sin
    parar). `buildPathGrid(state, room?)` construye/cachea para una sala concreta (sala activa
    si se omite, por compatibilidad). El filtro de hazards de la rejilla usa `room.id`.
  - `steerAwayFromNearbyHazards(state, from, dir, radius, roomId?)` filtra hazards por el
    `roomId` indicado (no por la sala activa).
  - `enemyPathCache` sigue por `enemyId` (cada enemigo pertenece a una sala), pero se quita
    el `enemyPathCache.clear()` global del build; los paths caducan solos a los 0.12 s.
- **Coste/rendimiento**: `getEnemyMoveDirection` ya cortocircuita a steering cuando hay línea
  recta libre y solo corre A* (throttle 0.12 s, cacheado) cuando está bloqueado. La rejilla
  de cada sala se construye una vez y se cachea. Con ~6 salas el sobrecoste es asumible.
- **Contención** (`integrateEnemies` clamp a `enemyRoomBounds`) y **foco de chase en sala
  activa** se mantienen. "No solaparse con otros enemigos" lo garantiza la separación
  enemigo↔enemigo (B2), no el grid (los enemigos son dinámicos).

### E. Decisiones menores (defaults propuestos)
- **Rastro dañino → enemigo**: por coherencia con pinchos, el rastro podría dañar enemigos.
  Default: **no** por ahora (el rastro lo generan enemigos `trail`; dañar a otros enemigos es
  raro). Dejar como mejora futura.
- **Proyectil hostil (de `shooter`) → enemigo**: hoy los proyectiles hostiles solo tocan al
  jugador. Default: **mantener** (sin fuego amigo entre enemigos), porque "global" aquí
  significa "sin filtro de sala", no "todos se disparan entre sí". Si se quisiera, sería
  trivial quitar el `!projectile.hostile` de `resolveProjectileEnemyCollisions`.

---

## 4. Acoplamiento sala↔entidad que SE MANTIENE (y por qué)

1. **Abrir puertas al limpiar** (`worldFlow.checkRoomClear`): una sala sin enemigos vivos
   abre sus conexiones. Es el único vínculo de "lógica de sala" deseado.
2. **Foco de IA / A***: solo la sala activa corre pathfinding completo (móvil).
3. **Contención**: cada enemigo se queda en su sala (`enemyRoomBounds`).
4. **Retorno a `homePos`** cuando el jugador sale de la sala (nuevo, §3.D).

Ninguno de estos cambia el RESULTADO de una reacción; solo afectan a movimiento/flujo.

---

## 5. Riesgos y tests

- **Riesgo**: quitar el gate de presión enemigo→jugador (`506`) podría permitir que un
  enemigo pegado a una puerta cerrada te golpee. Mitigación: ya hay separación por muros;
  verificar que con la puerta CERRADA la distancia jugador-enemigo nunca baja del umbral
  (el muro los separa). Test: jugador junto a puerta cerrada, enemigo al otro lado → 0 daño.
- **Riesgo**: separación enemigo↔enemigo + contención podría crear jitter en esquinas.
  Mitigación: separar primero, clampar después; medio empuje por enemigo.
- **Tests a añadir** en `tests/run-tests.ts`:
  - Explosión de barril daña a un enemigo de la sala contigua que está dentro del radio (sin gate).
  - Pinchos dañan a un enemigo que los pisa (con cooldown, no por frame).
  - Dos enemigos solapados se separan y ninguno sale de su sala.
  - Empujar un enemigo a un foso lo mata; a unos pinchos le quita vida.
  - Recoger una moneda de la sala contigua a través de una puerta abierta funciona.
  - El chaser persigue dentro de la sala y, al salir el jugador, su objetivo pasa a ser `homePos`.
  - (Regresión) Con puerta cerrada, ninguna reacción cruza el muro.
- `npm test` verde + prueba manual (`tests/manual/PLAYTEST_CHECKLIST.md`) + prueba en móvil.

---

## 6. Orden de implementación y delegación

Siguiendo la política del proyecto (orquesta Opus, implementan sub-agentes Sonnet):

1. **Fase A** (quitar 4 gates) — mecánico, bajo riesgo. Sonnet. Tests de regresión.
2. **Fase B** (pinchos→enemigo, separación enemigo↔enemigo) — Sonnet. Tests nuevos.
3. **Fase D** (`homePos` + retorno) — Sonnet. Test del chaser.
4. **Fase C** (extraer a `systems/*` módulos con nombre) — refactor incremental, al final,
   con tests verdes entre cada extracción. Opcional/cosmético; no cambia comportamiento.

Actualizar al terminar: `docs/CHANGELOG.md` y el §5 de `ARCHITECTURE_INVARIANTS.md`
(reformular: "las reacciones son puramente geométricas; el único gate de sala es flujo de
puertas/IA/contención/retorno", con la lista de §4 de este plan).
