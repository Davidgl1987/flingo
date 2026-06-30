# ENTITIES.md

## PlayerState

Representa al héroe.

Campos clave:

- `pos`: posición 2D lógica.
- `vel`: velocidad 2D lógica.
- `radius`: tamaño para colisión.
- `hp`, `maxHp`: vida.
- `bodyDamage`, `arrowDamage`, `spellDamage`: daño base.
- `weaponMode`: `body`, `arrow` o `spell`.
- `canAct`: puede apuntar/actuar.
- `isAiming`: está arrastrando.
- `lastSafePos`: punto de respawn tras foso.
- `invulnerableTimer`: evita daño repetido.
- `actionCooldowns`: cooldown independiente para cuerpo, flecha y hechizo.
- `pitFallTimer`: temporizador visual de recuperación tras caer en foso.
- `upgrades`: mejoras adquiridas.

## EnemyState

Tipos:

- `dummy`: patrulla, persigue de cerca con leash y daña por contacto.
- `chaser`: persigue siempre y acelera mientras se apunta.
- `spike`: enemigo gris con lado peligroso de pinchos.
- `trail`: patrulla, persigue y deja rastro dañino.
- `shooter`: esfera negra con cono blanco; alterna persecución y disparo.

Campos clave:

- `id`: único.
- `type`: tipo de enemigo.
- `pos`, `vel`, `radius`.
- `hp`, `maxHp`.
- `alive`.
- `contactCooldown`.
- `patrolAnchor`, `patrolTarget`, `patrolAxis`, `patrolRange`: ruta de patrulla.
- `shooterState`, `shooterTimer`: ciclo de persecución/parada del shooter.
- `spikeDir` opcional.

## HazardState

Tipos:

- `pit`: foso.
- `spikes`: pinchos fijos.
- `barrel`: barril explosivo.
- `slow`: zona lenta.
- `boost`: zona de impulso.
- `rock`: obstáculo.

## ItemState

Tipos:

- `coin`.
- `potion`.

Los objetos se recogen al contacto con el cuerpo del jugador.

## ProjectileState

Representa flechas/hechizos.

- Tiene `life` limitada.
- Tiene `alive`.
- Usa `damage` propio.
- `hostile` marca proyectiles enemigos que dañan al jugador.
