# TUNING_GUIDE.md

## Archivo principal de constantes

```txt
src/game/core/constants.ts
```

## Sensación de lanzamiento

### `PLAYER_LAUNCH_POWER`

Subir si el jugador se queda corto. Bajar si cruza toda la sala sin control.

### `MAX_AIM_DISTANCE`

Define cuánto puede arrastrar el jugador. En móvil conviene que no sea demasiado largo.

### `PLAYER_MAX_SPEED`

Limita velocidad máxima. Si el juego se vuelve caótico, bajar.

### `PLAYER_DAMPING`

Fricción. Si el jugador tarda demasiado en pararse, subir. Si se para demasiado pronto, bajar.

### `ROOM_RESTITUTION`

Rebote contra paredes. Si los rebotes son demasiado muertos, subir. Si son demasiado caóticos, bajar.

## Combate

### `IMPACT_DAMAGE_MIN_SPEED`

Velocidad mínima para dañar con el cuerpo. Si los golpes flojos matan demasiado, subir. Si el juego parece injusto porque no haces daño, bajar.

## Peligros

### `PIT_DAMAGE`

Daño al caer en foso. Para MVP es mejor quitar vida y respawnear, no muerte instantánea.

### `BARREL_DAMAGE` y `BARREL_RADIUS`

Controlan si el barril es herramienta o simple decoración. Debe poder resolver situaciones.

## Proyectiles

### `PROJECTILE_SPEED`

Flecha. Debe sentirse precisa.

### `SPELL_SPEED`

Hechizo. Debe sentirse más pesado.

### `PROJECTILE_LIFETIME`

Si hay demasiados proyectiles vivos, bajar.

## Procedimiento recomendado de tuning

1. Cambiar una constante cada vez.
2. Probar sala 1 tres veces.
3. Probar sala 2 con foso.
4. Ejecutar tests.
5. Documentar el cambio si altera mucho el comportamiento.
