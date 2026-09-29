---
status: accepted
---

# Publish only the darwin-arm64 addon

The native Provider has one platform package, `@xsai-apple-vision/vision-native-darwin-arm64`. No x64 addon exists.

macOS 26 is the last macOS release for Intel Macs, and ADR-0003 requires macOS 27. Apple Intelligence also requires Apple silicon, so an Intel Mac reports `device-not-eligible` even where it runs.

xsai-apple-speech publishes an x64 addon because it supports macOS 26. This repository does not copy that part of its structure.

The release workflow builds and stages only the arm64 addon. On another architecture, such as an x64 Node.js under Rosetta, the native package is not installed, and the first Provider operation passes the load error to the caller.
