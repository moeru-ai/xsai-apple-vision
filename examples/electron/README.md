# Electron example

This application checks the complete package path: a Vue renderer, a limited preload bridge, the Eventa Electron transport, the main-process plugin, the native Provider, and the on-device model.

It uses every Provider operation:

- The header shows `isAvailable()`, checks the system language with `supportsLanguage()`, and lists `supportedLanguages()`.
- **Ask** streams a text answer about the selected image with `streamText`. **Stop** aborts it, which cancels the on-device session.
- **Describe as JSON** asks `generateObject` for a Visual Context that matches a Valibot schema with a nullable field.
- **Use the AIRI image prompt** wraps the question in the prompt that AIRI sends with a chat image, so the answer matches what AIRI gets.
- The main process turns on the OCR and barcode tools, and calls `prepare()` in the background, so the first image does not wait for the OCR models.

Choose an image with the file picker, drop it on the image area, or paste it.

Run the example on macOS 27 with Apple Intelligence on:

```sh
pnpm build
pnpm --filter @xsai-apple-vision/example-electron dev
```

The `dev` script builds the native addon first.

Build the unpacked application with:

```sh
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @xsai-apple-vision/example-electron package
```

The package keeps the addon outside `app.asar`, in `app.asar.unpacked`, because Node.js cannot load a native addon from an archive.
