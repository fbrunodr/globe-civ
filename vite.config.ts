import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';

// The map editor (/map_editor.html) saves paintings to src/maps/<name>.json
// (dev only). The files are not watched: saving must not reload the
// editor; pages opened afterwards get the new paintings.
const MAPS = resolve(import.meta.dirname, 'src/maps');
function mapPaintings(): Plugin {
  return {
    name: 'map-paintings',
    apply: 'serve',
    configureServer(server) {
      server.watcher.unwatch(`${MAPS}/*.json`);
      server.middlewares.use('/__map/save', (req, res) => {
        const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? '';
        if (req.method !== 'POST' || !/^[a-z]+$/.test(name)) { res.statusCode = 400; res.end('POST /__map/save?name=<lowercase name>'); return; }
        let body = '';
        req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
        req.on('end', () => {
          try {
            const data = JSON.parse(body) as Record<string, unknown>;
            const file = resolve(MAPS, `${name}.json`);
            // One size per line (readable diffs).
            const keys = Object.keys(data);
            writeFileSync(file, `{\n${keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(data[k])}`).join(',\n')}\n}\n`);
            for (const m of server.moduleGraph.getModulesByFile(file) ?? []) server.moduleGraph.invalidateModule(m);
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ saved: keys }));
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

// The game's record (gameLog.ts): each turn's events appended to
// logs/<game>.jsonl (dev only; logs/ is not committed).
const LOGS = resolve(import.meta.dirname, 'logs');
function gameLogs(): Plugin {
  return {
    name: 'game-logs',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__log', (req, res) => {
        const game = new URL(req.url ?? '', 'http://x').searchParams.get('game') ?? '';
        if (req.method !== 'POST' || !/^[\w.-]+$/.test(game)) { res.statusCode = 400; res.end('POST /__log?game=<id>'); return; }
        let body = '';
        req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
        req.on('end', () => {
          mkdirSync(LOGS, { recursive: true });
          appendFileSync(resolve(LOGS, `${game}.jsonl`), body);
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [mapPaintings(), gameLogs()],
  // Pre-bundle every dependency up front: modules only the dev pages import
  // (the gallery's OrbitControls, CSS2DRenderer) would otherwise be found
  // late, re-bundled, and served stale (a 504 and a blank page).
  optimizeDeps: {
    include: ['three', 'three/addons/controls/OrbitControls.js', 'three/addons/renderers/CSS2DRenderer.js', 'three/addons/utils/BufferGeometryUtils.js'],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        gallery: resolve(import.meta.dirname, 'gallery.html'),
        worldView: resolve(import.meta.dirname, 'world_view.html'),
        cityLab: resolve(import.meta.dirname, 'city_lab.html'),
        citySamples: resolve(import.meta.dirname, 'city_samples.html'),
        mapEditor: resolve(import.meta.dirname, 'map_editor.html'),
        buildings: resolve(import.meta.dirname, 'buildings.html'),
        units: resolve(import.meta.dirname, 'units.html'),
        wonders: resolve(import.meta.dirname, 'wonders.html'),
      },
    },
  },
});
