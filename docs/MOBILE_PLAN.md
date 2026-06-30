# MOBILE_PLAN.md

## Objetivo

Mantener el juego como web app hasta que el núcleo sea divertido. Después envolver con Capacitor para Android/iOS.

## Recomendación

No añadir Capacitor en el primer prototipo si todavía se están cambiando controles, layout y física. Primero validar en navegador móvil usando Vite en red local.

## Pasos futuros

1. Probar `npm run dev -- --host` en móvil real.
2. Ajustar UI touch.
3. Añadir safe-area CSS.
4. Añadir Capacitor.
5. Crear proyectos Android/iOS.
6. Probar haptics.
7. Medir FPS y consumo.

## Riesgos móviles

- Dedo tapa al héroe al apuntar.
- Pantallas pequeñas hacen difícil ver trayectoria.
- Botones demasiado cerca del gesto de apuntado.
- WebGL puede bajar rendimiento en móviles antiguos.
- El juego puede necesitar cámara más cercana/lejana según dispositivo.

## Reglas de UI móvil

- Botones grandes.
- No depender de hover.
- Textos mínimos.
- Feedback visual grande.
- Evitar precisión milimétrica.
- Gesto principal siempre debe funcionar con un dedo.

## Ideas de haptics

- Vibración corta al soltar lanzamiento.
- Vibración media al recibir daño.
- Vibración fuerte al explotar barril.
- Vibración suave al recoger moneda/poción.

No añadir haptics hasta empaquetar con Capacitor.
