# Flingo

Roguelite de tirachinas por salas, **móvil primero** (navegador). Lanzas al héroe como una bola de billar: apuntas arrastrando, sueltas, rebotas por la sala y embistes enemigos con la propia velocidad. Limpia cada sala, elige una mejora, encuentra la llave, abre la puerta del jefe y termina la run.

- **Diseño del juego:** [docs/GDD.md](docs/GDD.md)
- **Arquitectura técnica:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Cómo se juega

1. **Apunta** tocando (o clicando) en cualquier parte del tablero y arrastra hacia atrás, como un tirachinas: la línea de puntos muestra dirección y fuerza.
2. **Suelta** para disparar el modo de arma activo:
   - **Cuerpo (azul):** te lanzas tú; a partir de ~2.5 u/s de impacto la embestida daña (más velocidad, más daño).
   - **Flecha (amarilla):** proyectil rápido que atraviesa 1 enemigo.
   - **Hechizo (violeta):** más daño, rebota 1 vez en las paredes.
3. Cambia de arma con los **3 botones inferiores** (cada uno con su barra de recarga).
4. Limpia la sala (todos los enemigos muertos) → elige **1 de 3 mejoras** → sigue por las puertas.
5. La **llave** (sala custodiada) abre la puerta dorada del **jefe**. Derrótalo y ganas la run.

Cuidado con los hazards: fosos (casi negros, con reborde de piedra), pinchos, **barriles explosivos** (la herramienta táctica estrella: embiste uno rodeado de enemigos), barro que frena y aceleradores. Cada enemigo tiene color y silueta propios; el botón de **pausa** (arriba a la derecha) muestra la leyenda completa y tus mejoras acumuladas.

Funciona igual con ratón en escritorio (Pointer Events unificados).

## Ejecutar

```bash
npm install
npm run dev        # dev server (Vite), se abre en la red local con --host
```

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con HMR |
| `npm run build` | Typecheck (`tsc -b`) + build de producción en `dist/` |
| `npm run preview` | Sirve la build de producción en local |
| `npm test` | Tests headless de la simulación (vitest) |
| `npm run typecheck` | Solo comprobación de tipos |

## Editor de niveles

En **`#/editor`** (enlace "✎ Editor" dentro del juego) vive el editor visual de salas:

- Rejilla 1×1 con snap; coloca/arrastra/duplica el inicio, los 5 enemigos, los 6 hazards y los 3 objetos.
- Propiedades por entidad (HP, radio, tamaño, dirección de púa/acelerador) y **destino de patrulla arrastrable** en el lienzo.
- Huecos de puerta por lado (máx. 2), validaciones en vivo y autoguardado del borrador.
- **▶ Probar**: playtest inmediato de la sala y vuelta al editor.
- **Exportar/Importar** la sala como JSON; las salas exportadas entran al pool del generador procedural. En dev, "Guardar en src/levels" escribe el fichero directamente en el repo.

## Depuración

- **`?seed=N`** en la URL fuerza la semilla de la mazmorra (misma run reproducible, también tras reiniciar). Ej.: `http://localhost:5173/?seed=42`.
- **`?godmode`** (presencia = activo, sin valor) activa el modo dios de playtest: el daño se aplica normal (hp baja, vignette, knockback) pero al llegar a 0 hp el héroe revive a vida máxima en vez de game-over — para ver cuánto quita cada ataque en una run completa. Un badge "GOD" junto a los corazones marca que la run es de testeo. Combina con `?seed=N` (run completa) y `?boss=<id>` (arena de jefe suelta).
- En dev, `window.__flingo` expone la sesión y helpers (`tick(segundos)`, `frame(dt)`) para avanzar la sim desde la consola.

## Arquitectura en una línea

Simulación 2D propia, pura y determinista a 60 Hz (`src/game/sim/`, sin React ni three.js, testeada con vitest) + render "tonto" con React Three Fiber que la lee e interpola (`src/game/render/`), juice por cola de eventos (`src/game/juice/`) y HUD en DOM (`src/game/ui/`). Detalles y presupuesto de rendimiento en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
