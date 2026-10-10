import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
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
      },
    },
  },
});
