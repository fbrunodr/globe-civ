import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

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

export default defineConfig({
  plugins: [mapPaintings()],
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
      },
    },
  },
});
