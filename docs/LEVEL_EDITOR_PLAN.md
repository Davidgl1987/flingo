# LEVEL_EDITOR_PLAN.md

## Objetivo

Crear un editor sencillo de salas para acelerar el diseño manual antes de pasar a generación procedural.

La ruta prevista es `/editor`. De momento será una herramienta de desarrollo, no necesariamente publicada en la build final.

## Estado actual

Primera versión implementada en `/editor`:

- Carga una sala borrador o cualquiera de las salas existentes como base.
- Permite colocar inicio del jugador, enemigos, peligros y objetos sobre grid.
- Permite seleccionar, mover, duplicar y eliminar entidades.
- Mantiene las columnas del grid juntas con celdas fijas.
- Los enemigos con patrulla (`dummy`, `spike`, `trail`) crean automáticamente un punto de patrulla adyacente; ese punto se puede seleccionar y mover.
- Permite editar nombre, id, tamaño de sala y propiedades básicas como posición, radio, HP, ancho y alto.
- Valida requisitos básicos: id/nombre, bounds, ids duplicados y spawn bloqueado por peligro/obstáculo.
- Exporta una definición `RoomDefinition` lista para pegar en el módulo de salas.
- Persiste automáticamente el borrador actual en `localStorage`, aunque cambies de pantalla.
- Permite probar una sala abriendo el juego en otra pestaña con la sala temporal en `localStorage`.
- Permite guardar la sala como JSON en `src/game/levels/<id>.json` mediante el dev server.

Pendiente inmediato:

- Cargar salas guardadas desde `src/game/levels/` en el selector del editor.
- Añadir edición visual de dirección de boost/spike.
- Añadir tags de sala para futuro mapa: inicio, combate, llave, recompensa, boss.

## Decisiones acordadas

- El editor debe escribir las salas directamente en el lugar que consume el juego.
- La generación procedural se discutirá más adelante; primero interesa crear y probar salas manuales con rapidez.
- Prioridad desktop. En móvil, si sale natural, se puede reutilizar la misma paleta adaptada.
- El escenario debe apoyarse en la cuadrícula. Enemigos, objetos, barriles y piezas de sala deben colocarse en centros de tile para simplificar A*, diseño y futura edición.
- Cada elemento debe ocupar como mínimo un tile. Si una roca, foso, zona o pinchos ocupan varios tiles, deben representarse como varias piezas `1x1` o como grupo editable de piezas `1x1`.

## Layout

En móvil:

- Parte superior con elementos disponibles.
- Una fila para enemigos.
- Otra fila para elementos de sala.
- Flechas laterales para paginar elementos si no caben.

En pantallas grandes:

- El mismo componente de elementos disponibles, pero colocado en lateral.
- El canvas/editor ocupa el resto.

## Herramientas base

- Seleccionar.
- Mover.
- Colocar inicio del jugador.
- Colocar enemigos.
- Colocar peligros: fosos, pinchos, barriles, rocas, slow, boost.
- Colocar objetos: moneda, poción.
- Borrar.

## Propiedades

Las propiedades son las naturales de cada entidad:

- Enemigos: tipo, tamaño/radio, vida, ruta si aplica.
- Barriles: radio/tamaño.
- Fosos/rocas/zonas: posición, ancho, alto.
- Boost: dirección o modo de impulso.
- Objetos: tipo y tamaño.

No hace falta un panel grande desde el primer día. Puede haber dos niveles:

- Menú contextual junto al objeto seleccionado: rotar, eliminar, duplicar, añadir fin de ruta.
- Panel lateral o inferior sólo para propiedades más detalladas cuando proceda.

En móvil, el menú contextual probablemente debería convertirse en una bottom sheet pequeña para no tapar el escenario.

## Rutas

Para enemigos con patrulla:

- Seleccionar enemigo.
- Acción contextual `añadir punto de ruta`.
- Posibilidad de mover puntos.
- Acción para borrar punto.
- Más adelante se puede permitir cerrar ruta o cambiar entre ida/vuelta y circuito.

## Organización y guardado

Las salas creadas por el editor se guardan como un JSON por sala:

```txt
src/game/levels/<room-id>.json
```

Motivo: cada sala es una pieza independiente, fácil de revisar, duplicar, borrar y etiquetar. Cuando llegue el mapa procedural tipo Isaac, conviene añadir un índice/pool separado con metadatos de conexión y tags, por ejemplo:

```txt
src/game/levels/index.json
```

Ese índice podrá decir qué salas son `start`, `key`, `boss`, `combat`, `treasure`, etc. La geometría y entidades siguen viviendo en el JSON de cada sala.

## Validaciones

- Debe existir `playerStart`.
- Todos los objetos deben quedar dentro de bounds.
- Entidades tile-based deben encajar en centros de tile si esa regla se mantiene.
- Los fosos deben ocupar tiles claros para que el suelo sea ausencia de cubos.
- Los fosos deben marcar tiles sin suelo; el motor cinemático activa una caída parabólica y respawn al cruzar el umbral vertical.
- No permitir ids duplicados.

## Pendiente de decidir

- Si las salas se guardan como TypeScript actual o si pasamos a JSON importado.
- Si todo será tile-based o sólo algunos elementos.
- Cómo representar rutas en el formato final.
- Si el editor tendrá playtest embebido o botón para abrir la sala en el juego.
