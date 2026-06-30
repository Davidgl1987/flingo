# Plan — Escenarios no cuadrados (salas de tamaño variable, rotadas y unidas con puertas libres)

Estado: **propuesta / no implementado**. Objetivo: pasar de la rejilla uniforme actual
(todas las celdas del mismo tamaño, 1 puerta centrada por borde compartido) a mapas con
salas de **tamaño real distinto**, **rotadas en múltiplos de 90°**, empaquetadas de forma
más orgánica y con **puertas colocadas donde mejor encajen** (no solo en el centro).

Antes de tocar nada, lee `docs/instructions/ARCHITECTURE_INVARIANTS.md` (puntos 3 y 4) y
`src/game/core/worldMap.ts`. Este plan está pensado para NO reintroducir los bugs que el
modelo de rejilla uniforme resolvió.

---

## 1. De dónde partimos (y por qué es "cuadrado")

`generateProceduralWorldMap` ([worldMap.ts:31](../../src/game/core/worldMap.ts)) hoy:

- Calcula `cellWidth = max(width)` y `cellHeight = max(height)` de TODAS las salas y mete
  cada sala, centrada, en una celda **de ese tamaño máximo** → todas las salas ocupan lo
  mismo (de ahí la sensación cuadrada/uniforme), aunque su contenido sea pequeño.
- Coloca las celdas en una rejilla entera (`strideX/Y = cell + ROOM_GAP`), con un núcleo
  2×2 (ciclo garantizado) + 1 celda + el boss como hoja.
- Una conexión por par de celdas adyacentes, con la puerta **centrada** en el borde
  (`DoorSlot.offset = 0`).
- Los muros se generan por **líneas** (`computeWorldWallObstacles`): por cada línea de
  rejilla se unen los tramos sólidos de todos los bordes y se restan los huecos de puerta.
  Esto **solo funciona limpio porque los bordes compartidos caen en la MISMA línea exacta**
  (celdas idénticas y alineadas). Ese es el invariante que evita muros dobles/cruzados.

El reto del rediseño: conservar "los bordes que se tocan caen en la misma línea" mientras
permitimos tamaños distintos, rotación y puertas descentradas.

---

## 2. Principios de diseño que NO se rompen

1. **Coordenadas de mundo** (punto 3 del invariante): cada sala tiene `offset`; todo lo que
   compare contra límites usa los límites de mundo de la sala de esa entidad.
2. **Muros por línea con grosor uniforme** (punto 4): seguimos generando muros uniendo
   spans por línea y restando huecos de puerta. No volvemos a "4 muros por sala".
3. **Bordes que se tocan = misma coordenada de línea**, separados exactamente por
   `ROOM_GAP = WALL_THICKNESS`. Si dos salas comparten frontera, sus bordes enfrentados
   deben caer sobre la misma recta (x o y), o el merge produce muros dobles.
4. **Caché de muros** invalidada por `wallCacheKey` (debe incluir offsets/tamaños y estado
   de puertas; ahora también `unlocked`).
5. **Alcanzabilidad**: la llave siempre accesible sin pasar por el boss (boss = hoja tras
   puerta `requiresKey`).

---

## 3. Fases

### Fase 1 — Rotación de salas (primitiva pura)  ⟶ *base, sin cambiar la colocación*  ✅ HECHA (2026-06-29)

> **Estado:** implementada y verificada. `rotateRoomDefinition` vive en `src/game/core/worldMap.ts` junto a `offsetRoomDefinition`; 7 tests en `tests/run-tests.ts` (ida y vuelta, 4×90 = identidad, swap de dims, contención, lado de puerta, no-mutación). Convención: north = -y, `90:(-y,x)` (north→east). Door slots re-derivados geométricamente. Aún **no** se usa en la generación (eso es Fase 2). Ver CHANGELOG 2026-06-29.

Añadir `rotateRoomDefinition(room: RoomDefinition, deg: 0|90|180|270): RoomDefinition`.

- 90/270 **intercambian** `width`↔`height`.
- Remapear TODO el contenido interno con la rotación alrededor del centro de la sala:
  spawns de enemigos, hazards (`pos`, y para rectángulos también `width`↔`height`),
  items, y los `doorSlots`/lados (`north↔east↔south↔west` según el giro).
  - Transformación de un punto local centrado: para +90° (horario en pantalla),
    `(x, y) -> (y, -x)` usando coordenadas centradas en el centro de la sala; ajustar al
    sistema real (z hacia "sur"). Escribir tests de ida y vuelta (rotar 4×90 == identidad).
- Los hazards tipo `spikes` con `spikeDir` deben rotar también su dirección.
- **Test**: rotar una sala con un barril descentrado y comprobar que sigue dentro de los
  límites y que `rotate(rotate(r,90),270)` ≡ `r`.

Esta fase no cambia el mapa todavía: solo habilita elegir una orientación por sala en la
generación. Es la que estaba aplazada en `docs/ROADMAP.md`.

### Fase 2 — Colocación de tamaño variable sobre lattice de bordes  ✅ HECHA (2026-06-29, detrás de flag)

> **Estado:** implementada tras el flag `USE_VARIABLE_LAYOUT` (apagado). `generateProceduralWorldMap`
> es un dispatcher: flag off → `generateUniformWorldMap` (intacto); flag on → `generateVariableWorldMap`
> (empaquetado por anclaje + rotación) con `validateWorldMap` y fallback al uniforme. El plumbing de
> rotación en la materialización (paso 2a: `WorldRoomInstance.rotation` + `rotateRoomDefinition` en
> `roomSystem.loadWorldMap`) también está hecho. **Las puertas libres (Fase 3) quedan cubiertas aquí**:
> se colocan en el centro del solape del borde compartido con `offset ≠ 0`. Validado: 35/40 seeds dan
> layout variable válido; 0/40 muros paralelos dobles. Ver CHANGELOG 2026-06-29. Pendiente: probar en
> móvil y, si convence, quitar el flag (Fase 5).

### Fase 2 — Colocación de tamaño variable sobre lattice de bordes

Sustituir la rejilla de celdas uniformes por un **empaquetado por anclaje** que mantiene el
invariante de "bordes compartidos en la misma línea":

1. Elegir salas y una orientación (rotación) por sala (Fase 1).
2. Colocar la sala inicial en el origen. Mantener una lista de **bordes libres** (cada
   borde de cada sala ya colocada, con su recta y su intervalo).
3. Para cada nueva sala, elegir un borde libre y **alinear** uno de sus bordes contra él:
   - El borde nuevo se coloca a distancia `ROOM_GAP` del borde ancla, **sobre rectas
     paralelas**, y se **desliza** a lo largo del eje hasta que el solape entre ambos
     bordes sea ≥ `DOOR_WIDTH + 2*margen` (para que quepa una puerta).
   - Rechazar la posición si la sala nueva **solapa** (AABB) con cualquier sala ya
     colocada o invade su `ROOM_GAP`. Probar varios anclajes/posiciones (con el `rng`
     sembrado) y quedarse con la primera válida; si ninguna, recolocar en una "fila" de
     reserva (fallback determinista, como hoy con `?? {col: length, row:0}`).
4. Cuantizar offsets a una rejilla fina (p.ej. múltiplos de 0.5) para que las rectas
   coincidan exactamente y evitar errores de coma flotante en el merge (ya usamos
   `round()` en las claves de línea).

Esto da mapas más compactos e irregulares (forma de L, T, claustros) en lugar de un bloque
de celdas iguales. **Coste**: el merge de muros ya no asume tamaños iguales; ver Fase 4.

Topología: mantener el **ciclo** (no encadenar todo en línea) eligiendo a veces un borde de
una sala ya conectada a dos vecinas; el **boss** sigue siendo la última hoja tras
`requiresKey`. Validar conectividad con un BFS antes de devolver el mapa.

### Fase 3 — Puertas en cualquier punto del borde compartido

Hoy `DoorSlot.offset = 0` (centro). Generalizar:

- Al crear una conexión, calcular el **intervalo de solape** de los dos bordes y situar la
  puerta en un punto válido de ese intervalo (centro del solape por defecto; o sesgado por
  `rng` dejando `DOOR_WIDTH/2 + margen` a cada lado). `aSlot.offset`/`bSlot.offset` se
  derivan de ese punto respecto al centro de cada sala (ojo: el offset es relativo al
  centro de CADA sala, que tienen tamaños distintos → calcular cada uno por separado).
- Si dos salas comparten un borde largo con **dos vecinas distintas**, pueden salir dos
  puertas en esa línea (una por adyacencia) — el sistema de spans por línea ya lo soporta
  porque resta cada hueco de forma independiente.
- `doorWorldPosition` ya usa `slot.offset`; verificar que sigue correcto con offsets ≠ 0
  y con salas rotadas. Los "puentes" de suelo (`getDoorBridges`) deben usar el mismo punto.

### Fase 4 — Generalizar el constructor de muros y los puentes

`computeWorldWallObstacles` ya trabaja por líneas (no por celdas), así que en teoría admite
tamaños variables **siempre que**:

- Los bordes compartidos caigan en la misma recta (garantizado por Fase 2) → sus spans se
  unen y el muro compartido sale único.
- Un borde de la sala A puede tocar **parcialmente** a la sala B (B más pequeña). El tramo
  no cubierto por B sigue siendo muro hacia el exterior: el merge de spans lo resuelve solo
  (une el borde de A completo; resta solo el hueco de puerta donde hay conexión).
- Revisar `sideGeometry` (extensión de medios-grosores en las esquinas): con salas de
  distinto tamaño, las esquinas en "T" o "L" deben seguir cerrando sin dejar huecos ni
  solapar. **Este es el punto de mayor riesgo de regresión** → cubrir con tests de
  geometría específicos (línea con dos salas de distinto alto compartiendo parte del borde).
- `getDoorBridges` debe puentear el hueco `ROOM_GAP` en la posición real de cada puerta
  (ya iteramos conexiones; solo cambia que `offset` ya no es 0).

### Fase 5 — Tests, validación y despliegue

- **Tests de geometría** (ampliar `tests/run-tests.ts`):
  - No hay muros solapados/duplicados: para cada par de obstáculos de muro, no se solapan
    sus AABB salvo en las esquinas esperadas.
  - Toda conexión `open && pasable` deja un hueco de exactamente `DOOR_WIDTH` y un puente.
  - Conectividad: BFS desde `startRoomId` alcanza todas las salas; el boss es hoja; la
    llave es alcanzable sin cruzar la puerta `requiresKey`.
  - Rotación: ida y vuelta (Fase 1) y que el contenido cae dentro de límites.
  - No solape de salas: AABB de salas separados al menos `ROOM_GAP`.
- **Validador en generación**: si el mapa generado falla una invariante, re-sembrar y
  reintentar N veces; si no, caer al layout de rejilla uniforme actual (fallback seguro).
- **Flag de despliegue**: empezar detrás de un flag (`USE_VARIABLE_LAYOUT`) para poder
  comparar contra la rejilla uniforme y revertir rápido. Probar en móvil (los muros y el
  suelo instanciado ya están optimizados; el coste extra es solo de generación, una vez).

---

## 4. Cambios de modelo de datos previstos

- `RoomDefinition`/`WorldRoomInstance`: posible `rotation?: 0|90|180|270` (o aplicar la
  rotación al materializar y guardar solo el resultado ya rotado en la instancia).
- `WorldRoomInstance.width/height`: dejan de ser el `cell` uniforme y pasan a ser el tamaño
  REAL (rotado) de la sala. Revisar todos los usos de `room.width/height` (cámara, físicas,
  `roomBounds`, suelo) — hoy ya usan `instance.width/height`, así que el cambio es contenido.
- `WorldDoorConnection`: sin cambios estructurales (ya tiene `aSlot/bSlot` con `offset`).
  (Recordatorio: ya añadimos `unlocked?` para la puerta del boss por contacto.)
- `wallCacheKey`: ya incluye offsets/tamaños por sala y estado de puertas → sigue válido.

## 5. Orden recomendado y riesgo

1. **Fase 1 (rotación)** — autocontenida, bajo riesgo, testeable sola. Hacer primero. ✅ HECHA (2026-06-29).
2. **Fase 4 (tests de geometría) ANTES que Fase 2** — escribir primero los tests que
   detectan muros dobles/huecos para tener red de seguridad antes de cambiar la colocación.
   ✅ HECHA (2026-06-29): red de seguridad mínima en `tests/run-tests.ts` (no-solape de
   muros de línea, puente+hueco por conexión pasable, barrera única por conexión cerrada),
   barrida sobre 40 seeds. Pendiente de Fase 5: ampliarla con el caso específico de dos
   salas de distinto alto compartiendo parte del borde (esquinas T/L con tamaños variables).
3. **Fase 2 (colocación variable)** detrás de flag. ✅ HECHA (2026-06-29). Incluye el paso 2a
   (plumbing de rotación en materialización) y 2b (generador + validador + fallback).
4. **Fase 3 (puertas libres)**. ✅ Cubierta dentro de 2b: las puertas se sitúan en el centro
   del solape del borde compartido (`offset ≠ 0`), reutilizando `doorWorldPosition`/`getDoorBridges`
   que ya respetaban `slot.offset`. Pendiente opcional: sesgar la posición con `rng` en vez de centrar.
5. Quitar el flag cuando los tests y la prueba en móvil estén verdes. ✅ **HECHO** (2026-06-30): flag `USE_VARIABLE_LAYOUT` eliminado; el layout variable es el único camino y el uniforme queda como fallback de `validateWorldMap`. Verificado en desktop (render + smoke de runtime + 91/91 tests). Pendiente: playtest en móvil real.

Mayor riesgo: **esquinas en T/L del merge de muros** (Fase 4) y **errores de coma flotante**
en las rectas (mitigado con cuantización a rejilla fina + `round()`). Mantener el fallback a
rejilla uniforme hasta validar.
