// @ts-nocheck
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function roomEditorSavePlugin() {
  return {
    name: 'room-editor-save',
    configureServer(server) {
      server.middlewares.use('/api/editor/rooms', (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }

        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const room = JSON.parse(body);
            const id = typeof room.id === 'string' ? room.id : '';
            if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
              throw new Error('El id debe usar solo minúsculas, números y guiones.');
            }

            const relativePath = `src/game/levels/${id}.json`;
            const levelsDir = path.resolve(process.cwd(), 'src/game/levels');
            await mkdir(levelsDir, { recursive: true });
            await writeFile(path.join(levelsDir, `${id}.json`), `${JSON.stringify(room, null, 2)}\n`, 'utf8');

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: relativePath }));
          } catch (error) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'No se pudo guardar.' }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/flingo/' : '/',
  plugins: [react(), tailwindcss(), roomEditorSavePlugin()],
  server: {
    port: 5173,
  },
}));
