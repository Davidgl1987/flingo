# PLAYTEST_CHECKLIST.md

## Sesión rápida de 10 minutos

### Preparación

- [ ] Ejecutar `npm install` si hace falta.
- [ ] Ejecutar `npm run dev`.
- [ ] Abrir en desktop.
- [ ] Abrir en móvil si es posible.

### Desktop

- [ ] Arrastrar y soltar desde distintas zonas del canvas.
- [ ] Confirmar que el input de arrastre no muestra aro blanco, queda fijo en el punto inicial y la cuña es más gruesa al inicio que al final.
- [ ] Confirmar que la trayectoria discontinua tiene punta 2D orientada al final del recorrido y que los impactos de proyectiles salen verticales.
- [ ] Para revisar direcciones congeladas, abrir `?debugAim=up|right|down|left|upRight|downLeft`.
- [ ] Confirmar que tirar hacia la izquierda lanza/dispara hacia la derecha.
- [ ] Confirmar que el héroe rebota contra paredes.
- [ ] Confirmar que se para en un tiempo razonable.
- [ ] Matar dummy por impacto fuerte.
- [ ] Ver que impacto débil no mata.
- [ ] Ver que dummy patrulla y daña si toca al jugador.
- [ ] Ver que chaser persigue siempre y acelera al apuntar.
- [ ] Atacar un cono-pincho por el lado de pinchos y recibir daño.
- [ ] Ver que spike patrulla sin perseguir y apunta los pinchos hacia su próximo destino.
- [ ] Ver que trail patrulla sin perseguir y deja rastro dañino.
- [ ] Ver que shooter persigue, se para y dispara cono blanco.
- [ ] Confirmar que enemigos rodean rocas/fosos/pinchos/barriles al perseguir.
- [ ] Cambiar a flecha.
- [ ] Disparar flechas contra rocas y confirmar que impactan en vez de atravesarlas.
- [ ] Disparar proyectiles contra paredes y confirmar que el impacto aparece sobre la pared.
- [ ] Cambiar a hechizo.
- [ ] Disparar hechizos contra rocas y confirmar que rebotan y se ve el impacto en la cara de la roca.
- [ ] Confirmar cooldowns visibles en botones: cuerpo, flecha y hechizo.
- [ ] Recibir daño por pinchos.
- [ ] Caer en foso, ver caída/respawn y perder vida.
- [ ] Confirmar que el shake no continúa indefinidamente tras morir.
- [ ] Explotar barril.
- [ ] Recoger moneda.
- [ ] Recoger poción con vida no máxima.
- [ ] Limpiar sala y elegir mejora sin cambiar de sala automáticamente.
- [ ] Confirmar que al limpiar una sala se abren sus puertas y no vuelven a cerrarse.
- [ ] Cruzar físicamente por una puerta abierta y confirmar que la cámara sigue al jugador.
- [ ] Entrar en la sala de llave, recoger la key plateada y volver por la puerta de entrada.
- [ ] Confirmar que la puerta del boss bloquea sin llave y permite pasar con llave.

### Móvil

- [ ] La cámara sigue al jugador sin perder la lectura de puertas y paredes cercanas.
- [ ] La escala mantiene al héroe, enemigos y puertas legibles en móvil.
- [ ] Se puede apuntar desde zonas alejadas del héroe.
- [ ] El dedo no tapa demasiado la acción.
- [ ] Botones son pulsables.
- [ ] Los corazones y cooldowns se leen sin tapar la acción.
- [ ] El canvas no hace scroll accidental.
- [ ] Apuntar se siente natural.
- [ ] Soltar no falla.

### Editor de salas

- [ ] Abrir `/editor`.
- [ ] Cargar una sala existente como base.
- [ ] Colocar inicio, un enemigo, un foso, una roca y una moneda.
- [ ] Confirmar que las columnas del grid quedan juntas, sin huecos entre columnas.
- [ ] Colocar dummy/spike/trail y confirmar que aparece un punto de patrulla adyacente.
- [ ] Seleccionar y mover el enemigo; seleccionar y mover su punto de patrulla.
- [ ] Seleccionar, mover, duplicar y eliminar un elemento.
- [ ] Confirmar que la validación detecta un spawn sobre foso/roca.
- [ ] Copiar el export y confirmar que contiene una definición `RoomDefinition` legible.
- [ ] Pulsar `Probar nivel` y confirmar que se abre el juego con esa sala.
- [ ] Pulsar `Guardar nivel` y confirmar que se crea `src/game/levels/<id>.json`.

## Preguntas de diversión

- [ ] ¿Quieres repetir tras morir?
- [ ] ¿Hay una jugada obvia pero arriesgada?
- [ ] ¿Los proyectiles sirven para algo?
- [ ] ¿El foso añade tensión sin frustrar?
- [ ] ¿Las salas duran poco?
