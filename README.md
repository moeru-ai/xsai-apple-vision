# xsai-apple-vision

🍎👁️ On-device image understanding with Apple Foundation Models, for Node.js and Electron, compatible with xsAI.

> [!NOTE]
> This repository is in early development. No package is published yet.

## What it does

The Apple Vision Provider is an xsAI chat provider. It sends a prompt and images to the on-device Apple Foundation Model and returns text. The model runs on the Mac. It needs no API key, no account, and no network.

It answers a conversation of `system`, `user`, and `assistant` messages, with images in `user` messages. It streams text with `stream: true`, and an aborted request cancels the on-device session.

## Usage

### Node.js

```ts
import { createAppleVisionProvider } from '@xsai-apple-vision/vision-native'
import { generateText } from '@xsai/generate-text'

const provider = createAppleVisionProvider()

const { text } = await generateText({
  ...provider.chat(),
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'What is on this screen?' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } },
    ],
  }],
})
```

Images are base64 data URLs in PNG, JPEG, HEIC, or WebP. The Provider does not download remote URLs.

Call `provider.isAvailable()` to check the model before a request. It returns a reason code when the model cannot answer: `framework-unavailable`, `device-not-eligible`, `apple-intelligence-not-enabled`, or `model-not-ready`.

### Electron

The main process owns the native addon. A renderer uses the same Provider through Eventa:

```ts
// Main process
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { setupAppleVision } from '@xsai-apple-vision/vision-electron-plugin/main'
import { createAppleVisionProvider } from '@xsai-apple-vision/vision-native'
import { ipcMain } from 'electron'

const eventa = createContext(ipcMain)
setupAppleVision({ context: eventa.context, provider: createAppleVisionProvider() })
```

```ts
// Renderer
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { createAppleVisionProvider } from '@xsai-apple-vision/vision-electron-plugin'

const eventa = createContext(window.electron.ipcRenderer)
const provider = createAppleVisionProvider({ context: eventa.context })
```

### Reading small text

The model scales each image down to a fixed size. Small text in a large screenshot then becomes unreadable, and the model guesses. Turn on the built-in OCR tool to read it:

```ts
const provider = createAppleVisionProvider({
  builtInTools: { ocr: true, barcode: false },
})
```

The tools are off by default. Each tool call uses part of the context window.

The first OCR call in an app takes about a minute, because the system compiles the OCR models for that app once. Call `prepare()` in the background when the app starts, so the first image does not wait:

```ts
void provider.prepare()
```

After the models are compiled, `prepare()` returns in less than a second, and an OCR call takes a few seconds.

## Errors

A failed request returns a chat-completions error response:

| Status | Code                             | Cause                                                              |
| ------ | -------------------------------- | ------------------------------------------------------------------ |
| 400    | `unsupported_request`            | A request part that this release does not answer, such as `tools`. |
| 400    | `invalid_image`                  | An image that cannot be decoded.                                   |
| 400    | `context_length_exceeded`        | The request does not fit the context window of the model.          |
| 400    | `content_policy_violation`       | The guardrails reject the prompt, or the model refuses it.         |
| 400    | `unsupported_language`           | The model does not support the language of the request.            |
| 503    | An availability code, see above. | The model cannot answer now.                                       |

When the guardrails stop the output after some text, the response keeps that text with `finish_reason: "content_filter"`.

## Packages

| Package                                         | Content                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `@xsai-apple-vision/vision`                     | The shared Provider contract, the availability types, and the errors.    |
| `@xsai-apple-vision/vision-native`              | The native Provider. It loads the Node-API addon.                        |
| `@xsai-apple-vision/vision-native-darwin-arm64` | The addon. macOS 27 runs only on Apple silicon, so no x64 addon exists.  |
| `@xsai-apple-vision/vision-electron-plugin`     | The Eventa contract, the main-process plugin, and the renderer Provider. |

## Requirements

- macOS 27 or later. Image input to the on-device model starts in macOS 27.
- A Mac that is eligible for Apple Intelligence, with Apple Intelligence turned on and its model downloaded.

This repository does not speak. For on-device text-to-speech and speech recognition, see [xsai-apple-speech](https://github.com/moeru-ai/xsai-apple-speech).

## License

[MIT](LICENSE)
