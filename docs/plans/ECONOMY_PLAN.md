# Plan: economía de monedas, mejoras por niveles y tiendas

Estado: **APROBADO por David (2026-07-13)** con estas decisiones:

1. Jefe final: sin mejora gratis, directo a victoria.
2. Consumibles solo en tienda (recompensa de jefe = solo cuerpo/flecha/hechizo).
3. **Gastar monedas RESTA puntuación**: al recoger +1 (como hoy), al comprar
   `score -= precio` (clamp a 0). La puntuación final es mayor si no compras.
4. Una tienda por mazmorra, colgada del bucle.

Redefine cómo se ganan y usan las mejoras: desaparece la mejora por limpiar
sala; las monedas pasan a ser la moneda de compra en tiendas; los jefes dan
una mejora gratis (una opción por tipo de ataque); las mejoras tienen niveles
(máx 3) e identificador visual.

## Principios de orquestación (ahorro de tokens)

Igual que BOSSES_PLAN: el orquestador especifica y verifica; cada fase la
implementa un sub-agente **sonnet** con espec cerrada. Ninguna fase requiere
opus (no hay garantías formales ni algoritmos delicados).

## Qué se reutiliza (ya existe en el código)

- `pierceLeft` en proyectiles: la flecha ya atraviesa (`ARROW_PIERCE_COUNT`);
  base 1 + bonus por nivel.
- `bouncesLeft`/`SPELL_WALL_BOUNCES`: el hechizo ya rebota; base 1 + bonus.
- `dropCoinAt` + `collectDeadDrops`: los enemigos ya sueltan 1 moneda; se
  parametriza por dureza.
- `HERO_MAX_HP = 9`: coincide con el máx pedido para Corazón Extra.
- `hero.modifiers` (ramDamageBonus, arrowDamageBonus, spellDamageBonus,
  spellRadiusBonus, shieldCharges) y `applyUpgrade`/`rollUpgradeChoices`
  (se generalizan a categorías+niveles).
- Mueren: `more-slide`, `control-boots`, `explosive-ram`, `steady-pulse`
  (y sus modifiers si quedan sin uso).

## Modelo de datos nuevo

- `UpgradeDef`: + `category: 'cuerpo' | 'flecha' | 'hechizo' | 'consumible'`,
  `maxLevel`, `icon` (id para el badge visual), `price(level)`,
  `apply(hero, level)`.
- `hero.upgradeLevels: Partial<Record<UpgradeId, number>>` — nivel actual por
  mejora (gating de máximos, efectos "cuanto más nivel", UI). Persiste entre
  mazmorras (ya viaja con el traspaso de `modifiers`; se añade al traspaso).
- Monedero: `hero.coins` (saldo gastable, persiste entre mazmorras, se pierde
  al morir). `stats.coinsCollected` queda como total recogido para la
  puntuación (gastar NO baja la puntuación).

### Pool de mejoras (12)

| Categoría | Id | Nombre | Efecto por nivel | Máx | Visual |
|---|---|---|---|---|---|
| cuerpo | cuerpo-dano | Erizo de Acero | +1 daño de embestida | 3 | pinchos pequeños alrededor de la bola (n por nivel) |
| cuerpo | cuerpo-velocidad | Estela de Cometa | +1 u/s de velocidad de lanzamiento | 3 | la bola se estira más al moverse |
| cuerpo | cuerpo-firmeza | Canto Rodado | menos retroceso al recibir daño | 3 | bola más grande |
| flecha | flecha-dano | Colmillo de Hierro | +1 daño de flecha | 3 | flecha más ancha |
| flecha | flecha-multi | Bandada | +1 flecha en ángulo | 3 | — (se ve al disparar) |
| flecha | flecha-perfora | Aguja Fantasma | +1 enemigo atravesado (base 1 → máx 4) | 3 | — |
| hechizo | hechizo-dano | Orbe Voraz | +1 daño de hechizo | 3 | proyectil más ancho |
| hechizo | hechizo-multi | Coro Arcano | +1 hechizo en ángulo | 3 | — |
| hechizo | hechizo-rebote | Eco Errante | +1 rebote (base 1 → máx 4) | 3 | — |
| consumible | escudo | Burbuja de Cuarzo | +1 carga: bloquea 1 golpe | ∞ (stack) | esfera semitransparente sobre la bola |
| consumible | corazon | Ascua Vital | cura 1; si vida llena, +1 vida máx (tope 9) | tope 9 | — |
| consumible | iman | Canto de Urraca | atrae monedas desde más lejos | 3 | — |

Cada mejora lleva un badge pequeño (SVG inline / componente `UpgradeIcon`)
+ pips de nivel (●●○), usado en modal de jefe, tienda y resumen de pausa/fin.

## Flujo de juego resultante

- Limpiar sala: abre puertas + puntuación (SIN modal de mejora; la fase
  'room-cleared' desaparece o queda como transición instantánea).
- Matar enemigo: suelta monedas según dureza (propuesta inicial: dummy 1,
  chaser/trail 2, spike/shooter 3, jefe 10 esparcidas). Las salas siguen
  teniendo monedas colocadas.
- Matar jefe NO final: fase nueva 'boss-reward' → modal con 3 tarjetas
  gratis, una aleatoria elegible (no maxeada) por categoría de ataque
  (cuerpo/flecha/hechizo; consumibles NO entran) → después NextDungeonModal.
  Jefe final: directo a victoria (la mejora no serviría) — **a confirmar**.
- Tienda: sala nueva con tag 'tienda', una por mazmorra, colgada del bucle
  de `buildTopology` (el jugador la encuentra sin desviarse mucho). Contiene
  un tendero placeholder (nuevo spawn no-recogible); al tocarlo → fase
  'shopping' + ShopModal: stock de 3-4 mejoras aleatorias (todas las
  categorías, consumibles incluidos) con precio; comprar descuenta monedas
  y sube nivel. Reabrible mientras estés en la mazmorra.
- Precios iniciales (a balancear en F6): nivel 1/2/3 = 10/20/30; escudo 8,
  corazón 12, imán 10/15/20.

## Fases

### F1 — Modelo de mejoras + economía base · sonnet
Pool nuevo con categorías/niveles/iconos-id, `upgradeLevels`, monedero
`hero.coins`, quitar mejora-por-sala (y fase 'room-cleared' del flujo),
drops de moneda por dureza, traspaso entre mazmorras ampliado. Tests:
gating de niveles, drops por kind, monedero persiste/se pierde al morir.

### F2 — Efectos nuevos en la sim · sonnet
Multidisparo en ángulo (flechas y hechizos), perfora/rebotes base+bonus,
velocidad de lanzamiento, retroceso reducido + radio de bola, imán de
monedas (atracción por radio según nivel en `stepItems`). Tests por efecto.

### F3 — Recompensa de jefe + iconos en UI · sonnet
Fase 'boss-reward' tras `boss-defeated` (no final), modal de 3 categorías,
componente `UpgradeIcon` + pips de nivel en todos los modales y resumen.

### F4 — Salas de tienda · sonnet
Tag 'tienda', nodo en la topología, sala(s) JSON con tendero placeholder,
contacto → ShopModal (stock, precios, comprar/salir). Tests: topología con
tienda válida, compra descuenta y aplica, sin saldo no compra.

### F5 — Feedback visual del héroe y proyectiles · sonnet
Pinchos, estiramiento extra, bola más grande, escudo semitransparente,
anchura de flecha/hechizo. Verificación en navegador (screenshots).

### F6 — Balance + GDD · orquestador + David
Actualizar GDD (§9 objetos, §11 mejoras, nueva sección tienda), pasada de
precios/drops, playtest de David.

Orden: F1 → F2 → F3 y F4 (independientes entre sí) → F5 → F6.

(Decisiones resueltas por David 2026-07-13 — ver cabecera.)
