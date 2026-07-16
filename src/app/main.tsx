import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@/styles/base.css';

// Solo dev: `?rafshim=1` sustituye requestAnimationFrame por un reloj basado
// en Worker para que el juego avance y pinte frames aunque el navegador
// considere la página oculta (visibilityState 'hidden': rAF queda suspendido
// y las cadenas de setTimeout caen bajo el "intensive wake up throttling" de
// Chromium, ~1 disparo/minuto). Los timers de un Worker NO se estrangulan por
// visibilidad. Necesario para verificación headless con capturas (navegador
// integrado de Claude).
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('rafshim')) {
  const workerUrl = URL.createObjectURL(
    new Blob(['setInterval(() => postMessage(0), 33);'], { type: 'text/javascript' }),
  );
  const ticker = new Worker(workerUrl);
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();
  ticker.onmessage = () => {
    const batch = [...pending.values()];
    pending.clear();
    const now = performance.now();
    for (const cb of batch) cb(now);
  };
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    pending.set(nextId, cb);
    return nextId++;
  };
  window.cancelAnimationFrame = (id: number): void => {
    pending.delete(id);
  };
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('No se encontró el elemento #root');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
