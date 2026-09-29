import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    events: 'src/events.ts',
    index: 'src/index.ts',
    main: 'src/main.ts',
  },
  format: ['esm'],
  sourcemap: true,
  treeshake: true,
})
