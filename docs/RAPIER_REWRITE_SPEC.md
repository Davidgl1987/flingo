# Reescritura Rapier desde cero

Este documento recoge el comportamiento esperado del juego para rehacerlo con `@react-three/rapier` como base fisica desde el principio.

El objetivo no es migrar incrementalmente el prototipo actual. La proxima implementacion debe partir de una arquitectura limpia donde Rapier sea la fuente de verdad para movimiento, colisiones, caidas, rebotes y sensores.

## Objetivo

Crear un MVP de roguelite por salas con vista 3D simple/isometrica:

- El jugador es una bola fisica.
- El jugador no camina: se impulsa con gesto tipo tirachinas/billar.
- Las salas son una cuadricula de tiles solidos.
- Los fosos son ausencia real de suelo.
- Los obstaculos, barriles, paredes, enemigos y proyectiles usan cuerpos/colliders Rapier.
- La logica de gameplay escucha eventos fisicos, sensores y estado de rigid bodies.

Pregunta principal del MVP:

> Es divertido lanzar/rebotar la bola, evitar peligros, empujar/matar enemigos y decidir mejoras entre salas?

## Principios de arquitectura

- Rapier es la fuente de verdad de posicion, velocidad, gravedad, contactos, rebotes y caidas.
- No debe existir otro motor cinemático paralelo para el jugador.
- No se debe detectar manualmente si el jugador esta encima de un foso mediante coordenadas/tile overlap.
- Los fosos se resuelven fisicamente: si no hay suelo, la bola cae.
- La confirmacion de caida se hace con un sensor Rapier bajo el foso o bajo la sala.
- El estado global guarda datos de gameplay, no sustituye al mundo fisico.
- Zustand puede guardar vida, monedas, sala actual, mejoras, cooldowns, modo de arma, estado de UI y referencias logicas.
- Los rigid bodies deben tener ids/userData o una capa de mapping para relacionar eventos Rapier con entidades del juego.
- Las reglas deben estar separadas de los componentes visuales.
- El render debe reflejar la simulacion, no corregirla.

## Modelo de mundo

### Coordenadas

- Usar plano horizontal X/Z.
- Y es altura/gravedad.
- Cada tile ocupa `1 x 1` unidades.
- Las posiciones iniciales de entidades se centran en tiles enteros.
- La sala debe tener anchura/altura en tiles enteros.
- Las paredes deben rodear exactamente el area jugable.

### Tiles

- Cada tile de suelo es un cubo/collider solido.
- Un tile de foso no tiene cubo/collider de suelo.
- La cuadricula visual debe encajar perfectamente dentro de las paredes.
- La pared no debe comerse parte de los tiles.
- Cada elemento del escenario ocupa como minimo 1 tile.
- Elementos de varios tiles deben ser grupos de piezas `1x1` o una estructura editorial que exporte tiles individuales.

## Jugador

### Fisica

- El jugador es una esfera Rapier dinamica.
- Debe rodar fisicamente, no desplazarse teleportado.
- Usa gravedad real.
- Rebota contra paredes y obstaculos segun materiales/restitution.
- La friccion/damping se calibra para que cada lanzamiento dure poco y sea legible.
- Al caer por un foso, la esfera debe verse bajando por debajo del escenario antes del respawn.
- El respawn ocurre despues de que la esfera toque un sensor Rapier inferior.
- Al respawnear:
  - pierde vida,
  - vuelve al ultimo punto seguro,
  - velocidad lineal y angular a cero,
  - cancela apuntado,
  - aplica invulnerabilidad breve.

### Punto seguro

- El ultimo punto seguro solo se actualiza cuando:
  - el jugador esta sobre suelo solido,
  - no esta cayendo,
  - no esta dentro de un sensor de peligro,
  - no esta en contacto peligroso.
- No actualizar `lastSafePos` mientras la bola esta en el aire/cayendo.

## Control

### Gesto base

- Input mouse/touch.
- Se puede iniciar el gesto desde cualquier zona interactiva del canvas.
- Al tocar/arrastrar se fija `aimStart`.
- El jugador dispara/lanzamiento en direccion opuesta al arrastre.
- La fuerza depende de la distancia de arrastre hasta un maximo.
- Si el arrastre es demasiado corto:
  - no lanza,
  - no dispara,
  - no muestra trayectoria discontinua.

### Modos de accion

Hay tres modos:

- Cuerpo.
- Flecha.
- Hechizo.

Cambiar de modo debe ser inmediato si el jugador esta vivo y la sala esta en juego.

### Cuerpo

- Aplica impulso Rapier al rigid body del jugador.
- No debe setear posicion manualmente.
- Puede relanzarse aunque la bola este en movimiento si el cooldown del cuerpo termino.
- Si impacta a un enemigo con suficiente velocidad, hace dano.
- Si impacta flojo contra enemigos peligrosos, el jugador recibe dano.

### Flecha

- Dispara proyectil fisico Rapier o kinematico integrado con Rapier.
- Viaja en linea recta.
- No rebota.
- Atraviesa 1 enemigo por defecto.
- El numero de enemigos atravesados debe poder mejorar.
- La previsualizacion discontinua de flecha termina en el primer choque previsto.

### Hechizo

- Dispara proyectil fisico Rapier o kinematico integrado con Rapier.
- Rebota 1 vez por defecto.
- El numero de rebotes debe poder mejorar.
- Se consume al chocar con un enemigo.
- Debe leerse como energia/luz, no como cubo.

### Cooldowns

Cooldowns base:

- Cuerpo: `0.2s`.
- Flecha: `0.5s`.
- Hechizo: `1.0s`.

Reglas:

- Cada accion tiene cooldown independiente.
- Se puede cambiar a otra accion lista aunque el jugador este en movimiento.
- Los botones inferiores muestran cooldown vaciandose/rellenandose de izquierda a derecha.

## Camara

- Vista isometrica/inclinada, no ortografica salvo decision explicita posterior.
- Mobile-first en vertical.
- La sala debe entrar razonablemente en pantalla.
- El jugador empieza visualmente desde abajo de la sala.
- Al apuntar puede haber zoom ligero.
- El zoom al apuntar debe pivotar sobre el punto inicial del gesto, sin desplazar ese punto visualmente.
- El shake debe ser moderado y no ocurrir en pickups ni fosos.
- Las sombras no deben cortarse en las paredes.

## Enemigos

Todos los enemigos:

- Deben tener cuerpo/collider Rapier o movimiento compatible con Rapier.
- Deben mirar hacia la direccion en la que se mueven.
- Deben evitar fosos, rocas, pinchos y barriles mediante pathfinding por tiles.
- El pathfinding debe operar sobre grid de tiles, no posiciones continuas.
- No deben ir directos hacia barriles si hay ruta alternativa.
- Si aun asi tocan un barril, el barril explota y puede danarlos.
- Deben tener vida visible.

### Dummy

- Color rojo.
- Patrulla de un lado a otro.
- Si el jugador se acerca mucho, lo persigue.
- No debe separarse demasiado de su ruta/patrulla.
- Si toca al jugador patrullando, hace dano.
- Si el jugador lo golpea sin suficiente velocidad, hace dano al jugador.

### Chaser

- Color naranja.
- Persigue siempre al jugador.
- Al apuntar el jugador, acelera.
- Si toca al jugador, hace dano.

### Cono-pincho

- Color gris.
- Esfera con varios conos grises como pinchos en un lado.
- Patrulla como dummy.
- Si persigue, abandona su ruta.
- Su lado con pinchos mira hacia donde se mueve.
- Si el jugador ataca por el lado de los pinchos, recibe dano.

### Trail

- Color verde.
- Patrulla como dummy.
- Si persigue, abandona su ruta.
- Deja rastro danino.
- El rastro debe ser un sensor o hazard temporal.

### Shooter

- Color negro.
- Esfera negra con cono blanco.
- Persigue 1 segundo.
- Se para 1 segundo.
- Al empezar o durante la parada dispara un cono/proyectil blanco hacia el jugador.
- El proyectil enemigo dana al jugador.

## Escenario

### Paredes

- Solidas, con colliders Rapier.
- Rebote claro.
- Deben coincidir con los limites visuales.

### Rocas

- Obstaculos solidos.
- Ocupan tiles completos.
- El jugador y enemigos chocan fisicamente con ellas.
- El pathfinding las considera bloqueadas.

### Fosos

- Son ausencia de suelo/collider.
- No tienen plano negro encima.
- No tienen circulo.
- No generan explosion ni shake.
- Si hay varios tiles de foso juntos:
  - no debe haber juntas internas,
  - visualmente deben leerse como un unico hueco,
  - no debe haber bordes por tile.
- La bola cae por gravedad.
- Un sensor Rapier inferior confirma la caida y dispara dano/respawn.

### Pinchos de suelo

- Color rojo.
- Ocupan tiles completos.
- Si son dos tiles, deben ser dos elementos o dos piezas exportadas.
- Hacen dano al contacto.
- Deben ser evitados por pathfinding enemigo.

### Barriles

- Ocupan un tile.
- Tienen collider Rapier.
- Explotan al contacto relevante con jugador, enemigo o proyectil.
- Danan en area.
- Pueden matar enemigos.
- Un barril no debe explotar dos veces.
- Enemigos deben intentar evitarlos, pero si los tocan explotan.

### Slow

- Zona de tile(s).
- Reduce velocidad/friccion mientras se atraviesa.
- Debe implementarse con sensor Rapier o material/zona de efecto.

### Boost

- Zona de tile(s).
- No debe redirigir la trayectoria.
- Incrementa la velocidad de la bola en su direccion actual.
- Si se quiere indicar direccion, usar flecha visual; si no, solo acelera trayectoria actual.

### Monedas

- Ocupan 1 tile.
- Centradas en tile.
- Deben estar un poco elevadas para no cortarse con el suelo.
- Al recoger:
  - suben hasta encima del jugador,
  - luego se desvanecen,
  - no encogen,
  - no generan shake.

### Pociones

- Ocupan 1 tile.
- Centradas en tile.
- Restauran vida.

## Pathfinding

- A* por tiles.
- Entrada: tile actual del enemigo y tile objetivo del jugador o punto de patrulla.
- Obstaculos bloqueantes:
  - fosos,
  - rocas,
  - pinchos,
  - barriles no explotados,
  - paredes.
- Evitar cortes diagonales a traves de esquinas bloqueadas.
- Recalcular path con frecuencia limitada, no cada frame si no hace falta.
- Cachear grid por sala y actualizarlo solo cuando cambie un obstaculo dinamico, como barril explotado.
- Para enemigos moviendose, usar steering hacia el siguiente waypoint.
- Si el enemigo se atasca:
  - recalcular path,
  - elegir waypoint siguiente,
  - no oscilar pixel a pixel.

## UI

### HUD

- Card de texto arriba.
- Card de vida y monedas debajo, visible y sin cortarse.
- Vida como corazones llenos/vacios.
- Monedas con icono y numero.
- Botones inferiores:
  - Cuerpo azul.
  - Flecha amarillo.
  - Hechizo lila.
  - Sin sombra en texto.
  - Seleccionado relleno.
  - No seleccionado vacio, con borde de su color.
  - Borde mas grueso que antes.
  - Cooldown se muestra rellenando/vaciando de izquierda a derecha con el color del modo.

### Pausa

- En esquina superior derecha hay icono de pausa.
- Abre modal.
- Pausa realmente simulacion y input.
- El modal contiene:
  - Reiniciar.
  - Leyenda.
  - Listado de mejoras recogidas.
- Boton cerrar como `x`.
- Leyenda como acordeon.

### Mejoras

- Cada mejora tiene icono representativo.
- Las mejoras se eligen entre salas.
- Pueden modificar cooldowns, rebotes, pierce, vida, dano, friccion, escudo, etc.

## Efectos y feedback

- Al recibir dano:
  - empujar al personaje en sentido contrario mediante impulso Rapier,
  - mostrar particulas del color actual del jugador.
- Impactos de enemigos:
  - flash breve,
  - empuje.
- Muerte de enemigo:
  - efecto visible,
  - monedas/score.
- Explosion de barril:
  - area clara,
  - dano,
  - shake moderado.
- Foso:
  - sin explosion,
  - sin shake,
  - sin circulo de dano.
- Hechizo:
  - luz/energia.
- Flecha:
  - lectura 2D clara o cono/punta coherente.
- Trayectoria discontinua:
  - no se muestra si el arrastre es demasiado corto,
  - cuerpo puede mostrar rebotes,
  - flecha termina en primer choque,
  - la punta no debe verse rara/3D salvo que sea un cono intencional.

## Salas

- MVP con 5-10 salas manuales antes de procedural.
- Las salas empiezan con el jugador desde abajo.
- Contenido centrado en tiles.
- Elementos de varios tiles se exportan como piezas tile-based.
- La generacion procedural se discutira despues.

## Editor futuro

- Ruta `/editor`.
- Puede ser solo dev al principio.
- Objetivo: colocar tiles, enemigos, obstaculos, peligros, items y rutas.
- En desktop: panel lateral con elementos disponibles.
- En movil: elementos disponibles arriba, por filas/paginacion:
  - una fila de enemigos,
  - otra de elementos de sala,
  - flechas laterales para paginar.
- Click sobre elemento colocado puede abrir mini-panel contextual:
  - rotar,
  - eliminar,
  - configurar ruta,
  - añadir fin de ruta.
- Propiedades por entidad:
  - tipo,
  - tamaño si aplica,
  - vida,
  - rotacion/direccion,
  - puntos de ruta.
- Exporta directamente al formato usado por el juego.

## Tests

Mantener tests puros para reglas:

- cooldowns,
- dano,
- mejoras,
- limpieza de sala,
- pathfinding sobre grid,
- reglas de proyectiles,
- reglas de respawn tras sensor de caida.

Anadir tests/integracion o manual checks para Rapier:

- la bola cae si no hay suelo,
- el sensor inferior dispara respawn,
- paredes rebotan,
- rocas/barriles bloquean,
- pausa detiene simulacion,
- no hay deteccion manual de foso en el core.

## Rendimiento

- Evitar sincronizar Zustand cada frame si no es necesario.
- Rapier puede correr a timestep fijo.
- Leer posicion/velocidad de cuerpos fisicos con throttling si solo es para UI/IA.
- No recalcular A* cada frame.
- Cachear grid de pathfinding por sala.
- Usar instancing o geometria compartida para tiles si el numero crece.
- Mantener DPR razonable en movil.
- Sombras ajustadas a la escena, no sobredimensionadas.
- Evitar muchas luces dinamicas simultaneas.

## Criterios de aceptacion inicial

La reescritura base no se considera lista hasta que:

- El jugador es un rigid body Rapier real.
- El lanzamiento aplica impulso/fuerza Rapier.
- El suelo esta hecho por colliders de tiles.
- El foso es ausencia de collider.
- La bola cae por gravedad al entrar en un foso.
- Un sensor Rapier inferior confirma la caida y respawnea.
- No existe deteccion manual de foso por overlap de coordenadas en el core.
- Paredes, rocas y barriles tienen colliders Rapier.
- La pausa pausa Rapier.
- A* funciona por tiles.
- La sala 2 permite probar claramente un foso de varios tiles sin juntas internas.
- Build, tests y prueba manual en navegador pasan.
