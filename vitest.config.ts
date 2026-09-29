import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          exclude: ['**/node_modules/**'],
          include: ['packages/**/*.test.ts'],
          name: 'unit',
        },
      },
    ],
  },
})
