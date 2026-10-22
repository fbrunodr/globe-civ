import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

// The town editor (/town_editor.html) saves its drawings here (dev only).
// The file is not watched: saving must not reload the editor; pages opened
// afterwards get the new drawings.
const DRAWINGS = resolve(import.meta.dirname, 'src/town/drawings.json');
function townDrawings(): Plugin {
  return {
    name: 'town-drawings',
    apply: 'serve',
    configureServer(server) {
      server.watcher.unwatch(DRAWINGS);
      server.middlewares.use('/__town/save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
        req.on('end', () => {
          try {
            const data = JSON.parse(body) as Record<string, unknown>;
            // One drawing per line, in key order (readable diffs).
            const keys = Object.keys(data).sort();
            writeFileSync(DRAWINGS, keys.length ? `{\n${keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(data[k])}`).join(',\n')}\n}\n` : '{}\n');
            for (const m of server.moduleGraph.getModulesByFile(DRAWINGS) ?? []) server.moduleGraph.invalidateModule(m);
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ saved: keys.length }));
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
  plugins: [townDrawings()],
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
        cityDesigns: resolve(import.meta.dirname, 'city_designs.html'),
        townEditor: resolve(import.meta.dirname, 'town_editor.html'),
        buildings: resolve(import.meta.dirname, 'buildings.html'),
      },
    },
  },
});
