import { dirname, join } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import { createContext } from '@moeru/eventa/adapters/electron/main'
import { setupAppleVision } from '@xsai-apple-vision/vision-electron-plugin/main'
import { createAppleVisionProvider } from '@xsai-apple-vision/vision-native'
import { app, BrowserWindow, ipcMain } from 'electron'
import { injeca, lifecycle } from 'injeca'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

/** Creates the single example window and loads its development or packaged page. */
async function createExampleWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    height: 860,
    minHeight: 640,
    minWidth: 760,
    show: false,
    title: 'xsAI Apple Vision Example',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(currentDirectory, '../preload/index.mjs'),
      sandbox: false,
    },
    width: 1120,
  })
  window.once('ready-to-show', () => window.show())

  if (env.ELECTRON_RENDERER_URL)
    await window.loadURL(env.ELECTRON_RENDERER_URL)
  else
    await window.loadFile(join(currentDirectory, '../renderer/index.html'))

  return window
}

/**
 * Composes and starts the example's Electron runtime.
 *
 * Call stack:
 *
 * startApplication
 *   -> {@link injeca.start}
 *     -> setupAppleVision
 *       -> {@link createExampleWindow}
 */
async function startApplication(): Promise<void> {
  const electronApp = injeca.provide('host:electron-app', () => app)
  const readyApp = injeca.provide('host:ready-electron-app', {
    dependsOn: { app: electronApp },
    async build({ dependsOn }) {
      await dependsOn.app.whenReady()
      return dependsOn.app
    },
  })
  const eventa = injeca.provide('transport:eventa', {
    dependsOn: { app: readyApp },
    build() {
      return createContext(ipcMain)
    },
  })
  // The main process owns the built-in tools. A renderer request cannot change them.
  const provider = injeca.provide('vision:provider', () => createAppleVisionProvider({
    builtInTools: { barcode: true, ocr: true },
  }))
  const visionSetup = injeca.provide('vision:electron-setup', {
    dependsOn: { eventa, provider },
    build({ dependsOn }) {
      // The first OCR call in an app compiles the OCR models for about a
      // minute. Prepare them in the background, so the first image does not wait.
      dependsOn.provider.prepare().catch(error => console.error('Apple Vision prepare failed:', error))
      return setupAppleVision({
        context: dependsOn.eventa.context,
        provider: dependsOn.provider,
      })
    },
  })
  const exampleWindow = injeca.provide('window:example', {
    dependsOn: { app: readyApp, eventa, lifecycle, setup: visionSetup },
    async build({ dependsOn }) {
      const window = await createExampleWindow()

      // One stop hook owns the cleanup order. Closing the window ends new
      // renderer work before the setup removes handlers and the Eventa context
      // stops the transport.
      dependsOn.lifecycle.appHooks.onStop(() => {
        if (!window.isDestroyed())
          window.destroy()
        dependsOn.setup.dispose()
        dependsOn.eventa.dispose()
      })
      return window
    },
  })

  injeca.invoke({
    dependsOn: { window: exampleWindow },
    callback: () => {},
  })

  await injeca.start()
}

let isStopping = false
app.on('before-quit', (event) => {
  if (isStopping)
    return
  event.preventDefault()
  isStopping = true
  void injeca.stop().finally(() => app.quit())
})

void startApplication().catch((error) => {
  console.error(error)
  app.exit(1)
})
