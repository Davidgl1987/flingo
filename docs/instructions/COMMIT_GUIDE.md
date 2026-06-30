# COMMIT_GUIDE.md

Aunque el ZIP no incluye repositorio Git inicializado, esta guía sirve para futuras sesiones.

## Convención sugerida

- `feat:` nueva mecánica.
- `fix:` corrección de bug.
- `tune:` ajuste de balance/constantes.
- `docs:` documentación.
- `test:` tests.
- `refactor:` refactor sin cambio funcional.

## Ejemplos

```txt
feat: add trajectory preview for body launch
fix: prevent pit respawn inside hazard
tune: increase player damping for mobile control
docs: document room hazard format
test: cover projectile collision damage
```

## Regla

Cada cambio de gameplay debería mencionar qué sensación intenta mejorar.
