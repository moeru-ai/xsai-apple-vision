#!/usr/bin/env bash
# Installs the packed packages into an empty project and loads them there,
# as a user does after `npm install`. Run it after `pnpm build` and `pnpm build:native`.
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/xsai-apple-vision-install.XXXXXX")
trap 'rm -rf -- "$work_dir"' EXIT HUP INT TERM
mkdir -p "$work_dir/packs" "$work_dir/project"

for package in \
  packages/vision \
  packages/vision-native \
  packages/vision-native/npm/darwin-arm64 \
  packages/vision-electron-plugin; do
  (cd "$root/$package" && pnpm pack --pack-destination "$work_dir/packs" >/dev/null)
done

cd "$work_dir/project"
echo '{ "name": "clean-install-check", "private": true, "type": "module" }' > package.json
npm install --no-audit --no-fund --silent "$work_dir"/packs/*.tgz

node --input-type=module <<'SCRIPT'
import { appleVisionRespond, createAppleVisionProvider as createRendererProvider } from '@xsai-apple-vision/vision-electron-plugin'
import { setupAppleVision } from '@xsai-apple-vision/vision-electron-plugin/main'
import { createAppleVisionProvider } from '@xsai-apple-vision/vision-native'

for (const [name, value] of Object.entries({ appleVisionRespond, createRendererProvider, setupAppleVision }))
  if (value == null) throw new Error(`${name} is missing from the installed packages.`)

// The first operation loads the addon from node_modules.
const provider = createAppleVisionProvider()
const availability = await provider.isAvailable()
const languages = await provider.supportedLanguages()
const chat = provider.chat()
console.log('availability:', JSON.stringify(availability))
console.log('languages:', languages.length)
console.log('chat model:', chat.model)
SCRIPT

echo "The packed packages install and load."
