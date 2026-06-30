# GAMEPLAY_CONTRACT.md

Este contrato describe comportamientos que no deberían romperse sin intención explícita.

## Input

- El jugador solo puede iniciar apuntado si `phase === 'playing'`.
- El jugador no puede iniciar apuntado ni avanzar simulación si `isPaused === true`.
- El jugador solo puede iniciar apuntado si `player.canAct === true`.
- El punto inicial del input puede estar en cualquier zona interactiva del canvas.
- El input de arrastre debe mostrarse como una cuña 2D fija en el punto inicial, gruesa al inicio y fina al final, sin aro blanco.
- La fuerza se calcula por distancia de arrastre y la dirección de acción es opuesta al arrastre, tipo tirachinas.
- Soltar con arrastre demasiado corto no debe lanzar ni disparar.

## Movimiento

- En modo cuerpo, soltar aplica velocidad al jugador.
- Tras lanzar/disparar, el cooldown del modo usado debe bloquear esa misma acción.
- Los cooldowns son independientes por modo: cuerpo 0.2s, flecha 0.5s y hechizo 1.0s antes de mejoras.
- Cuando el modo actual no tiene cooldown, `canAct` debe volver a true aunque el jugador siga en movimiento.
- El jugador debe rebotar o mantenerse dentro de la sala.

## Daño por cuerpo

- Impactos por debajo de `IMPACT_DAMAGE_MIN_SPEED` no deben dañar enemigos normales.
- Impactos por encima de `IMPACT_DAMAGE_MIN_SPEED` deben dañar.
- El daño aumenta con velocidad.
- Enemigos muertos incrementan monedas y puntuación.

## Pinchos

- Un enemigo spike puede dañar al jugador si se golpea desde su lado peligroso.
- Un enemigo spike debe mostrar y respetar un lado peligroso con varios pinchos.
- Los pinchos fijos de escenario causan daño si el jugador los toca y deben empujarlo fuera de la trampa.
- Debe existir invulnerabilidad temporal para evitar daño repetido inmediato.

## Fosos

- Caer en un pit causa daño.
- El jugador reaparece en `lastSafePos`.
- La velocidad se pone a cero.
- Se cancela el apuntado.
- El foso no debe generar explosión, shake ni VFX circular de daño.
- A nivel visual/físico, el foso debe leerse como ausencia de suelo sólido, no como un plano negro encima del escenario.
- El movimiento normal del jugador debe seguir usando el motor cinemático propio.
- Al entrar en un foso, se activa temporalmente un estado de caída cinemática separado.
- La caída conserva la inercia horizontal de entrada, pero no debe añadir velocidad vertical hacia arriba.
- Rozar una esquina o borde exterior del foso no debe activar la caída; el centro del jugador debe entrar en una zona interior del foso.
- La caída debe conservar la velocidad horizontal de entrada para formar una parábola sobre el hueco.
- Si durante la caída el jugador vuelve a quedar sobre suelo firme antes de bajar del umbral de aterrizaje, debe aterrizar sin perder vida.
- Si ya ha bajado del umbral de aterrizaje, tocar suelo firme no debe subirlo al plano de juego ni generar VFX; debe perder la velocidad horizontal y seguir cayendo por el hueco.
- Mientras la caída especial está activa, el motor cinemático normal no debe integrar cooldowns, colisiones ni lógica de pickups/daño del jugador.
- La caída debe confirmarse cuando la altura vertical cruza un umbral negativo; entonces el jugador recibe daño y vuelve a `lastSafePos`.
- `lastSafePos` no debe actualizarse si la bola está sobre un foso, aunque todavía no haya empezado a caer visualmente.

## Barriles

- El barril explota al contacto relevante.
- La explosión daña enemigos en radio.
- La explosión puede dañar al jugador si está cerca.
- Un barril no debe explotar varias veces.

## Proyectiles

- Modo flecha y modo hechizo crean proyectiles.
- Los shooter crean proyectiles hostiles que dañan al jugador.
- Los proyectiles tienen vida limitada.
- Los proyectiles dañan enemigos al impactar.
- Los proyectiles hostiles no dañan enemigos.
- Los proyectiles no recogen objetos.
- Las flechas reales no rebotan: se consumen al impactar con enemigos, rocas o paredes.
- Los proyectiles deben generar un impacto visual al chocar con paredes, rocas, enemigos, barriles o el jugador.
- El impacto visual de proyectiles debe ser vertical, no una onda horizontal pegada al suelo.
- En paredes y rocas, el centro del impacto visual debe estar sobre la cara de impacto y no quedar oculto por la geometría.
- La previsualización discontinua del modo flecha termina en el primer choque, sin mostrar rebote.
- La previsualización discontinua del modo cuerpo puede mostrar rebotes contra paredes y rocas como ayuda de apuntado.
- Si el arrastre no llega al umbral mínimo de acción, no debe mostrarse la trayectoria discontinua.
- La trayectoria discontinua debe rematar con una punta triangular 2D clara orientada al final del recorrido.
- Los hechizos rebotan contra paredes y rocas.

## Enemigos

- Dummy patrulla de lado a lado.
- Dummy persigue solo si el jugador se acerca mucho y no debe alejarse demasiado de su ruta.
- Dummy daña al jugador al tocarlo durante la patrulla o si recibe un impacto flojo.
- Chaser persigue siempre al jugador y acelera mientras el jugador apunta.
- Cono-pincho no persigue: patrulla entre su posición inicial y su punto de patrulla.
- Cono-pincho debe orientar sus pinchos hacia su próximo destino de patrulla.
- Trail no persigue: patrulla entre su posición inicial y su punto de patrulla mientras deja rastro dañino.
- Shooter persigue durante 1 segundo, se queda parado durante 1 segundo y dispara un cono blanco al empezar su parada.
- Las persecuciones deben rodear rocas, fosos, pinchos y barriles mediante pathfinding.
- Un enemigo que llegue a tocar un barril debe hacerlo explotar; el pathfinding debe reducir esos contactos, no desactivar la explosión.

## Tiles

- Cada elemento de sala debe ocupar como mínimo un tile.
- Los elementos rectangulares que cubran varios tiles deben dividirse en piezas de `1x1` tile.
- Enemigos, objetos, barriles y piezas de sala deben arrancar centrados en un tile.

## Limpieza de sala

- Una sala se considera limpia cuando no quedan enemigos vivos.
- Al limpiar una sala no final, el estado pasa a `choosing-upgrade`.
- Al limpiar la última sala, el estado pasa a `victory`.

## Mejoras

- Elegir mejora debe modificar el estado de jugador.
- Elegir mejora debe cargar la siguiente sala si no era la última.
- Las mejoras no deben borrar vida/monedas/progresión salvo que esté definido.
