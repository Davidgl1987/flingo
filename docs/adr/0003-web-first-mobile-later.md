# ADR 0003 — Web primero, Capacitor después

## Estado

Aceptado para MVP.

## Contexto

El destino final puede ser Android/iOS, pero el núcleo todavía necesita validación. Añadir Capacitor demasiado pronto puede distraer.

## Decisión

Mantener Vite web como entorno principal. Probar en navegador móvil. Añadir Capacitor cuando el gameplay base sea prometedor.

## Consecuencias positivas

- Iteración más rápida.
- Menos complejidad inicial.
- Permite compartir builds web fácilmente.

## Consecuencias negativas

- Aún no se validan APIs nativas.
- No hay haptics ni empaquetado.
- Puede haber ajustes posteriores de safe areas.

## Cuándo reconsiderar

- Cuando el prototipo sea divertido durante 5-10 minutos.
- Cuando haya que probar input/haptics en dispositivo real.
- Antes de preparar una demo instalable.
