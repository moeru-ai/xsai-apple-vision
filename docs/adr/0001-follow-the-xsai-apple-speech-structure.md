---
status: accepted
---

# Follow the xsai-apple-speech structure

This repository copies the structure of xsai-apple-speech. Only the Swift module is different.

The native package uses this call path:

```text
TypeScript Provider
  -> Node-API addon
    -> Objective-C++ adapter
      -> Swift module
        -> Foundation Models
```

The repository copies these parts from xsai-apple-speech:

- The package split: a shared contract package, a native package, and an Electron plugin package.
- A separate native package for the addon, selected from `process.arch`. ADR-0015 limits it to arm64.
- The explicit native addon loader, which loads the addon on the first Provider operation.
- The build scripts, the release workflow, and the clean-install checks.
- The Electron example, which exercises every Provider operation.

The Swift module owns the Foundation Models sessions, image decoding, schema conversion, and cleanup. The Objective-C++ adapter owns Node-API conversion and callback delivery. The TypeScript Provider owns the public interface, addon loading, error conversion, and the chat-completions adapter.

We rejected a separate native helper process that talks JSON-RPC. It isolates a crash of the model from the Electron main process. But it needs its own signing, notarization, and app-bundle placement, so npm cannot distribute it like the addon. It also needs its own protocol and process lifecycle. A non-macOS host does not load the addon, because the platform packages declare `os: ["darwin"]` and the addon loads lazily. So a helper gives no platform advantage.

We keep the helper as an option if the model crashes or hangs the main process in practice.
