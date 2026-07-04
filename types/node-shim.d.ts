/**
 * Shim mínimo de tipos de Node para vite.config.ts.
 *
 * El proyecto no incluye @types/node a propósito (la app es 100% navegador y
 * la sim debe permanecer libre de APIs de plataforma); el único código que
 * toca Node es el middleware dev del editor en vite.config.ts. Aquí se
 * declara EXCLUSIVAMENTE lo que ese fichero usa, tipado sin `any`.
 */

declare module 'node:fs' {
  export function mkdirSync(path: string, options: { recursive: boolean }): void;
  export function writeFileSync(path: string, data: string, encoding: 'utf8'): void;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
}
