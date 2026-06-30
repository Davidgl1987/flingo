# UPGRADES_AND_WEAPONS.md

## Archivo principal

```txt
src/game/core/upgrades.ts
```

## Modos de arma

### body

Lanza al héroe. Es el modo más arriesgado y con más potencial.

### arrow

Dispara un proyectil rápido y preciso.

### spell

Dispara un proyectil más lento y potente.

## Mejoras actuales

- `impact_damage`: aumenta daño de impacto.
- `max_hp`: aumenta vida máxima y cura.
- `slippery`: reduce fricción, más deslizamiento.
- `sticky_boots`: aumenta fricción, más control.
- `explosive_body`: daño en área al golpear.
- `sharper_arrows`: mejora flechas.
- `arcane_spell`: mejora hechizos.
- `quick_aim`: reduce cooldown tras proyectiles.
- `shield_start`: añade cargas de escudo.

## Reglas para nuevas mejoras

Cada mejora debería:

- Cambiar una decisión del jugador.
- Ser entendible en una frase.
- Tener efecto visible o medible.
- Evitar bonus planos aburridos si hay alternativa.

## Buenos ejemplos futuros

- Primer rebote de cada lanzamiento hace más daño.
- Si limpias sin daño, ganas moneda extra.
- Flecha atraviesa un enemigo.
- Hechizo empuja enemigos.
- Cuerpo deja una onda al caer en zona boost.

## Malos ejemplos para MVP

- +2% de daño.
- +1 moneda aleatoria sin decisión.
- Sistema complejo de inventario.
- Mejoras con texto largo.
