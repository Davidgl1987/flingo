# Plan de implementación: jefes (GDD §15)

*Plan de orquestación. Cada fase la ejecuta un sub-agente con el modelo indicado; el orquestador (modelo superior) escribe el prompt, verifica el resultado (git + tests + preview con `__flingo`) y commitea. Regla del repo: los sub-agentes NUNCA con un modelo superior a Sonnet.*

## Principios de orquestación (ahorro de tokens)

- Todo prompt de tarea empieza con: **"Lee AGENTS.md y cúmplelo"** + la sección del GDD que aplica + el pendiente concreto. Nada de repetir protocolo inline.
- Fases **secuenciales y pequeñas** (un jefe por agente): los agentes largos mueren por límite de sesión a mitad. Si uno cae: reanudarlo por agentId con la lista de pendientes **verificada por git** (no relanzar de cero).
- El framework (B0) se hace primero y se verifica a fondo: los 4 jefes dependen de sus contratos.
- Verificación del orquestador por fase: `npm test` + preview con `?seed` fijo + `__flingo.tick()` para reproducir la pelea sin jugarla a mano.

## Fase B0 — Framework de jefes · **sonnet**

**Objetivo:** toda la infraestructura común, sin ningún jefe concreto todavía (un "jefe de pruebas" trivial vale para los tests).

Contratos a implementar (sim pura + integración):
- Entidad jefe en el mundo (tipo propio o `Enemy` extendido con subestado de jefe): vida alta, **fases por umbral de HP (66 %/33 %)** con evento `boss-phase-changed`, máquina de patrones con **telegrafiado** (timer de aviso ≥ 0.6 s, evento `boss-telegraph`) y **ventana de vulnerabilidad** (flag consultable por combate + evento).
- Regla de daño por ventana: fuera de ventana el jefe recibe daño reducido o nulo según config del jefe; el techo de daño de un golpe de jefe al héroe (60 % vida máx en fase 1) es un helper compartido.
- **Puerta sellada:** al entrar en la sala del jefe se cierran sus puertas (evento `boss-door-sealed`); al morir el jefe → `boss-defeated` → clímax (juice máximo reutilizando trauma/hit-stop/partículas), lluvia de monedas, apertura y `victory`. Sin oferta de mejora tras jefe.
- Formato de sala: campo opcional `boss: '<id-de-jefe>'` en el JSON (validado en room-format.ts); el generador exige exactamente 1 sala con `boss` por run y sortea entre las salas de jefe del pool.
- HUD: barra de vida del jefe (aparece al entrar, con nombre; sin setState por frame — mutación de style vía rAF como la WeaponBar).
- Render base: vista de jefe con hueco para composición por jefe (patrón EnemyView), telegraph visual genérico (anillo/glow) y flash de fase.
- Pool de proyectiles: ampliar capacidad configurable (La Tormenta necesitará ~64-96 balas vivas; hoy el pool es menor). Instanciado, cero allocs.
- Tests: fases por umbral, telegraph→ataque→ventana, sellado/apertura de puertas, generador con 1 jefe por run, techo de daño.

**Verificación orquestador:** run con `?seed` que caiga en el jefe de pruebas; sellado, barra, fases y victoria vía `__flingo`.

## Fase B1 — Guardián de Canto (GDD §15.2) · **sonnet**

- Sim: patrulla perimetral → telegraph (brillo/vibración 0.8 s) → **carga recta** rápida → choque contra roca/pared = **aturdido 1.4 s** (ventana) / choque con héroe = daño+empujón. Fase 2: doble carga. Fase 3: esquirlas temporales (campo de pinchos breve) al chocar las rocas.
- Sala `boss-guardian.json` (arena §15.2: 4 rocas en esquinas, sin fosos) sustituyendo/conviviendo con boss-den.
- Render: cuerpo grande y pesado, brillo de telegraph, estado aturdido inconfundible (estrellitas/tambaleo).
- Tests: ciclo completo carga→choque→ventana, doble carga en fase 2, daño solo en ventana.

## Fase B2 — Reina del Enjambre (GDD §15.3) · **sonnet**

- Sim: invocación de **larvas** (enemigo nuevo mínimo: Dummy débil de 1 HP, sin drop de moneda o drop reducido) por oleadas ~3 s; **rastro grande y duradero** (charcos de radio mayor y vida larga — reutiliza el sistema del Trail con parámetros propios y pool ampliado si hace falta); sin ventana (vulnerable siempre, mucha vida). Fase 2: rastro más rápido + larvas perseguidoras. Fase 3: patrón de rastro envolvente + larvas agresivas.
- Sala `boss-queen.json` (arena alargada con pasillos, §15.3).
- Render: Reina grande y distinta (corona/pulso de invocación), larvas mini-dummies.
- Tests: cadencia de oleadas, límite de larvas vivas (cap para rendimiento), comportamiento del rastro por fase.

## Fase B3 — El Prisma (GDD §15.4) · **sonnet**

- Sim: **escudo de color rotatorio** (azul/amarillo/violeta) con telegraph de cambio 1.5 s; regla de daño: **solo el arma del color activo daña** (cuerpo/flecha/hechizo; feedback de inmune vía evento `boss-immune-hit`); ataque temático por modo (embestidas cortas / ráfagas de dardos / arcos que rebotan — reutilizar proyectiles hostiles); ventana al final de cada ataque. Fase 2: rotación acelerada. Fase 3: solape de 2 colores con golpe doble si acierta.
- Sala `boss-prisma.json` (§15.4).
- Render: núcleo con color activo dominante (reutiliza `WEAPON_COLOR` de assets.ts — el mapeo arma↔color ya existe para el héroe), tartamudeo de color en el telegraph, chispazo de "inmune" al golpe incorrecto.
- Tests: gating de daño por arma/color, rotación y telegraph, solape de fase 3.

## Fase B4 — La Tormenta (GDD §15.5) · **sonnet**

- Sim: 3 **patrones de balas** generativos (espiral, anillos, ráfaga radial) sobre el pool ampliado de B0, cada uno con telegraph propio y con **pasillo garantizado** (regla de honestidad §15.5: verificar por construcción, no por azar); recarga 1.2 s = ventana; balas ≤ 4.5 u/s. Fase 2: densidad+, recarga−. Fase 3: encadena espiral→anillos.
- Sala `boss-storm.json` (arena despejada §15.5).
- Render: balas instanciadas legibles (contraste alto), pose de recarga inconfundible.
- Tests: pasillo garantizado en cada patrón (propiedad, no ejemplo: para N semillas el hueco mínimo ≥ diámetro del héroe + margen), cadencias, recarga.
- **Riesgo de rendimiento:** presupuesto de balas + verificación FPS en móvil real (David) antes de dar por buena la fase.

## Fase B5 — Integración, balance y cierre · **sonnet** (verificación final: orquestador + David)

- Los 4 jefes en el pool con sorteo; `?boss=guardian|queen|prisma|storm` para forzar uno en dev (herramienta de playtest).
- Pasada de coherencia de juice (clímax de victoria común, empujones, sonido-ready: eventos emitidos aunque no haya audio aún).
- Actualizar README y la tabla §15.6 del GDD con los valores que queden tras el primer balance.
- Playtest de David con los 4 (uno por run o forzados) → ronda de ajustes de tuning como las fases 5/6.

## Qué modelo y por qué

| Tarea | Modelo | Motivo |
|---|---|---|
| Specs, prompts, revisión, verificación en preview, commits | **Orquestador (superior)** | Es donde se decide; los errores aquí cuestan fases enteras |
| B0–B5 implementación | **sonnet** | Implementación guiada por spec cerrada + protocolo AGENTS.md; ha entregado bien las fases 1-6 |
| Retoques mecánicos sueltos (renombrados, mover constantes, JSON de salas ya diseñadas) | **haiku** | Sin decisiones; más barato |
| Nunca | ~~opus/fable en sub-agente~~ | Regla del repo (CLAUDE.md) |

## Presupuesto orientativo

6 fases × 1 agente sonnet (~150-300k tokens/fase visto el histórico) + verificaciones del orquestador. Mitigaciones ya en marcha: AGENTS.md (protocolo fuera de los prompts), reanudación por agentId tras límites de sesión, verificación por `__flingo` (barata) en vez de playtest manual del orquestador.
