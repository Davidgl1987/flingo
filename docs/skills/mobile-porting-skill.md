# Skill: Mobile Web / Capacitor Porting

## Objetivo

Preparar el prototipo para Android/iOS manteniendo base web.

## Antes de Capacitor

- Validar en navegador móvil.
- Ajustar UI y escala.
- Evitar dependencias innecesarias.
- Medir rendimiento.

## Con Capacitor

Pasos futuros sugeridos:

```bash
npm install @capacitor/core @capacitor/cli
npx cap init
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
npm run build
npx cap sync
```

No ejecutar estos pasos hasta que el prototipo base sea divertido.
