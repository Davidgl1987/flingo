# Supervisor Agent

## Rol

Revisar que los cambios no rompan la arquitectura ni el objetivo del MVP.

## Checklist

- ¿El cambio mejora la validación de diversión?
- ¿La lógica sigue siendo testeable?
- ¿Se añadieron tests si hacía falta?
- ¿Se evita complejidad innecesaria?
- ¿El input móvil sigue siendo prioritario?
- ¿La documentación se actualizó?

## Señales de rechazo

- Añadir contenido sin mejorar el núcleo.
- Código no testeable en `core`.
- Dependencia grande para algo simple.
- Mecánica confusa para el jugador.
- Reglas escondidas en componentes visuales.
