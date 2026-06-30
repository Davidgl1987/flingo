# GAME_DESIGN.md

## Fantasía jugable provisional

Un roguelite por habitaciones en el que el personaje se convierte en la propia bola de billar. El jugador calcula trayectorias, rebotes y riesgos para limpiar cada sala.

No hay temática cerrada todavía. El prototipo debe mantenerse abstracto hasta validar el núcleo.

## Pilares

1. Lanzamiento satisfactorio.
2. Rebotes predecibles.
3. Riesgo vs recompensa.
4. Salas compactas con peligros claros.
5. Mejora incremental entre salas.

## Loop principal

1. Observar la sala.
2. Elegir modo: cuerpo, flecha o hechizo.
3. Apuntar arrastrando.
4. Soltar.
5. Resolver impactos/rebotes/peligros.
6. Recoger objetos o recibir daño.
7. Repetir hasta limpiar la sala.
8. Elegir mejora.
9. Avanzar.

## Modos de acción

### Cuerpo

- Mayor daño potencial.
- Recoge objetos.
- Puede empujar o activar peligros.
- Expone al héroe a fosos, pinchos y enemigos.

### Flecha

- Ataque seguro.
- Daño medio/bajo.
- Permite rematar enemigos sin moverse.
- No recoge objetos.

### Hechizo

- Más lento.
- Más daño.
- Mejor para objetivos concretos.
- Debería tener VFX y personalidad propia en fases posteriores.

## Enemigos actuales

### Dummy

Sirve para enseñar impactos. No se mueve.

### Chaser

Presiona al jugador, especialmente cuando apunta. Evita que el juego sea demasiado pausado.

### Spike

Tiene dirección peligrosa. Enseña que no todo impacto es bueno.

### Trail

Deja rastro dañino. Convierte la sala en un puzzle espacial.

## Peligros actuales

### Pit

Foso. Castiga mal posicionamiento. También puede usarse ofensivamente si se añade empuje a enemigos en el futuro.

### Spikes

Daño fijo de escenario. Deben ser muy visibles.

### Barrel

Explosión en área. Debe sentirse como herramienta ofensiva.

### Slow

Zona lenta. Puede ayudar o perjudicar según colocación.

### Boost

Zona de impulso. Añade caos controlado.

### Rock

Obstáculo. Sirve para rebotes y bloqueo.

## Regla de oro de diversión

Cada sala debería tener al menos una jugada interesante:

- Rebote para matar dos enemigos.
- Barril que puedes explotar.
- Riesgo de caer al foso.
- Enemigo que presiona mientras apuntas.
- Objeto tentador en una zona peligrosa.
