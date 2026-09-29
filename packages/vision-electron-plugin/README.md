# `@xsai-apple-vision/vision-electron-plugin`

This package projects an Apple Vision Provider across Electron IPC with Eventa. It owns two invokes: availability, and a streamed answer.

Register the handlers once in the main process:

```ts
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { setupAppleVision } from '@xsai-apple-vision/vision-electron-plugin/main'
import { createAppleVisionProvider } from '@xsai-apple-vision/vision-native'
import { ipcMain } from 'electron'

const eventa = createContext(ipcMain)
const setup = setupAppleVision({
  context: eventa.context,
  provider: createAppleVisionProvider(),
})
```

Create a renderer Provider from the renderer Eventa context, and use it like any xsAI chat provider:

```ts
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { createAppleVisionProvider } from '@xsai-apple-vision/vision-electron-plugin'

const eventa = createContext(window.example.ipcRenderer)
const provider = createAppleVisionProvider({ context: eventa.context })
```

The renderer Provider translates the chat-completions request in the renderer. Only the translated request, with the image bytes, crosses IPC. The main process sends the text of each stream snapshot, then the result.

The host owns the injected Provider and both Eventa contexts. On shutdown, dispose the plugin setup before the main Eventa context. The setup removes its handlers. It does not dispose the Provider or context.

An aborted request cancels the main-process session. See ADR-0008.
