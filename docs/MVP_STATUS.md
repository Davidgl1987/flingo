# MVP_STATUS.md

## Estado funcional

El prototipo está en estado jugable inicial. Sirve para validar la idea, no para producción.

## Funciones implementadas

### Core loop

- Sala vertical cargada desde definición estática.
- Jugador apunta y lanza.
- La sala se resuelve eliminando enemigos.
- Al limpiar sala aparece selección de mejora.
- La mejora aparece tras un breve delay para dejar ver el efecto de muerte del último enemigo.
- Tras elegir mejora avanza a la siguiente sala.
- Victoria al completar la última sala.
- Game over al perder toda la vida.

### Movimiento

- Drag & release con mouse/touch desde cualquier zona interactiva del canvas: tirar hacia atrás y soltar, estilo tirachinas.
- Cámara inclinada estilo prototipo original con ajuste de distancia para encajar la sala completa en pantalla vertical.
- Fuerza limitada por `MAX_AIM_DISTANCE`.
- Velocidad máxima limitada por `PLAYER_MAX_SPEED`.
- Rebotes contra paredes.
- Damping/fricción.
- Acción bloqueada por cooldown propio de cada modo, permitiendo cambiar a otra acción lista mientras el jugador sigue en movimiento.
- El héroe muestra un rastro de velocidad que lo sigue mientras se mueve, proporcional a su velocidad.
- El movimiento normal vuelve al motor cinemático propio sobre X/Z.
- Al entrar en un foso se activa una caída cinemática especial con inercia horizontal, altura vertical y gravedad propia, sin salto vertical inicial.

### Combate

- Daño por impacto según velocidad.
- Los dummies patrullan, persiguen al jugador si se acerca sin separarse mucho de su ruta y dañan al contacto o en impactos flojos.
- Enemigos empujados y con flash breve al recibir daño.
- Chaser persigue siempre, acelera mientras el jugador apunta y puede recibir daño de impactos fuertes aunque venga de un contacto reciente.
- Cono-pincho y trail no persiguen: patrullan entre su posición inicial y su punto de patrulla.
- El cono-pincho orienta sus pinchos hacia su próximo destino de patrulla.
- Shooter persigue 1 segundo, se planta 1 segundo y dispara un proyectil hostil blanco.
- Chaser/trail/shooter dañan por presión de contacto si se quedan empujando al jugador.
- Proyectiles de flecha y hechizo.
- Disparar flechas/hechizos aplica un pequeño retroceso al héroe.
- Cooldowns base: cuerpo 0.2s, flecha 0.5s y hechizo 1.0s.
- La previsualización discontinua del cuerpo enseña rebotes contra rocas y paredes.
- En modo flecha, la previsualización termina en el primer choque porque las flechas reales son proyectiles directos.
- Los hechizos mantienen rebote contra paredes y rocas sin reimpactar ni duplicar el efecto visual tras el rebote.
- Los proyectiles chocan con rocas y generan impacto en el punto de contacto.
- El arrastre de input se ve como una cuña 2D sin aro, fija en el punto inicial, más gruesa al principio y más fina en el punto final.
- La punta de trayectoria se renderiza como triángulo 2D orientado al final del recorrido y los impactos de proyectiles se leen en vertical.
- Enemigos con vida.
- Barriles explosivos con daño en área; los enemigos intentan evitarlos con pathfinding, pero explotan si los tocan.
- Pinchos direccionales en enemigos spike.

### Escenario

- Salas manuales rotadas a formato vertical para ocupar mejor pantallas móviles.
- Salas con dimensiones impares; enemigos, objetos, barriles y peligros rectangulares quedan centrados en posiciones enteras de tile.
- Los peligros rectangulares se dividen en piezas `1x1` para que ningún elemento ocupe medio tile o varios tiles como una sola pieza.
- Rocas como obstáculos.
- Fosos con daño y respawn a última posición segura.
- Los fosos no usan VFX/shake de daño; se leen como ausencia de suelo/collider y la bola cae sin salto inicial hasta cruzar un umbral de altura negativo más profundo.
- El trigger de caída usa una zona interior del foso para que rozar una esquina no haga caer al jugador.
- Si el jugador cruza un foso pequeño con suficiente velocidad y vuelve a estar sobre suelo firme, aterriza sin recibir daño.
- Si la bola ya ha bajado más que el umbral de aterrizaje, tocar suelo al otro lado corta la velocidad horizontal y sigue cayendo visualmente por el hueco.
- Mientras la caída especial está activa, el motor cinemático normal queda congelado y no empuja la bola de vuelta.
- La última posición segura no se actualiza cuando la bola está sobre un foso, evitando bucles de respawn dentro del hueco.
- Pinchos fijos.
- Los pinchos fijos empujan al jugador fuera de la trampa al hacer daño.
- Zonas lentas.
- Zonas de impulso.
- Rastros dañinos de enemigos trail.
- Persecuciones con pathfinding en grid para rodear rocas, fosos, pinchos y barriles.

### UI

- HUD migrado a Tailwind CSS v4 con corazones y monedas fuera de la card principal.
- Leyenda desplegable de jugador, enemigos, objetos y peligros.
- Botones de arma con relleno de cooldown de izquierda a derecha.
- Botones de arma coloreados por modo: cuerpo azul, flecha amarillo y hechizo lila.
- Menú de pausa con reinicio, listado de mejoras recogidas y leyenda en acordeón.
- Modal de mejoras con icono representativo para cada mejora.
- Modal final de victoria/derrota.

### Herramientas dev

- Editor inicial de salas en `/editor` con grid, paleta de entidades, selección, mover/duplicar/eliminar, validación básica y export de `RoomDefinition`.
- El editor mantiene columnas compactas, crea puntos de patrulla editables para enemigos patrulleros, permite probar la sala temporal en el juego y guarda JSON por sala en `src/game/levels/`.

### Juice provisional

- Ondas visuales para lanzamiento, disparo, impacto, muerte, explosión, daño, escudo y pickups.
- Impacto visual específico cuando un proyectil golpea paredes, rocas, enemigos, barriles o al jugador, colocado en la cara del impacto y forzado a ser visible.
- Shake de cámara con desplazamiento de cámara y objetivo en impactos, muertes y explosiones.
- El shake se desactiva fuera de la fase `playing` para evitar vibración infinita en muerte/game over.
- Zoom-in ligero mientras se apunta, vuelve al encuadre normal al soltar.
- Efectos temporales gestionados desde estado para poder testearlos y tunearlos.

## Calidad actual

- Bueno para validar sensaciones.
- Balance provisional.
- Gráficos placeholder.
- Motor cinemático suficiente para MVP, pero no robusto para producción.
- La caída de fosos también vive en el core cinemático testeable; no hay motor físico externo activo en el MVP.
- El run inicial genera un mapa continuo pequeño con salas manuales, puertas, sala de llave y sala boss.
- Las puertas cerradas bloquean, las abiertas se cruzan físicamente y la cámara sigue al jugador por el mundo.

## Riesgos actuales

- La simulación propia puede quedarse corta si se añaden geometrías complejas.
- Las colisiones son simples; algunos casos extremos pueden sentirse raros.
- El coste principal a vigilar es la frecuencia de simulación/render y el número de efectos visuales vivos durante salas densas.
- Falta feedback visual/sonoro, por lo que el juego puede parecer menos divertido de lo que realmente es.
- Hay que probar mucho en móvil real: tamaños de botones, precisión de input y rendimiento.

## Próxima validación recomendada

1. Ajustar sensación del lanzamiento.
2. Reducir o aumentar fricción hasta que cada turno sea satisfactorio.
3. Usar `/editor` para diseñar 3 salas más pequeñas y densas.
4. Medir si el jugador entiende cuándo puede actuar.
5. Añadir SFX mínimos: lanzamiento, impacto, daño, muerte, pickup y explosión.
