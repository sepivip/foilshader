import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

// Main library build — single entry for ESM + UMD compatibility
export default defineConfig({
  plugins: [dts({ rollupTypes: true })],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'umd'],
      name: 'HolographicFoil',
      fileName: (format) => `holographic-foil.${format === 'es' ? 'es' : 'umd'}.js`,
    },
    rollupOptions: {
      external: ['three', 'three/webgpu', 'three/tsl'],
      output: {
        globals: {
          'three': 'THREE',
          'three/webgpu': 'THREE',
          'three/tsl': 'THREE',
        },
      },
    },
  },
})
