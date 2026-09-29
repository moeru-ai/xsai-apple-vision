# @xsai-apple-vision/vision-native

The native macOS Apple Vision Provider. It loads a Node-API addon that calls the on-device Apple Foundation Model.

It requires macOS 27 on Apple silicon.

## Development

- `pnpm build:native` builds the addon with the macOS 27 SDK. The Command Line Tools are enough.
- `pnpm test:native` runs the Swift tests. They need Xcode, because the Command Line Tools do not include the Swift Testing macros. Select Xcode for one command with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer pnpm test:native`.
- Run `pnpm build` in the workspace before `pnpm typecheck`. This package reads the types of `@xsai-apple-vision/vision` from its `dist` directory.
