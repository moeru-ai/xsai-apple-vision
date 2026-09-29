import { defineConfig } from 'bumpp'

export default defineConfig({
  all: true,
  commit: 'release: v%s',
  files: [
    'packages/vision/package.json',
    'packages/vision-native/package.json',
    'packages/vision-native/npm/darwin-arm64/package.json',
    'packages/vision-electron-plugin/package.json',
  ],
  push: false,
  sign: false,
})
