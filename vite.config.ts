/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// base './' → rutas relativas, necesario para servir desde GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    // Solo tests headless de la simulación (sin DOM ni three.js).
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
