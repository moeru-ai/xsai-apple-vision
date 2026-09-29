import type { Buffer } from 'node:buffer'

/** The functions that the Node-API addon exports. Each one returns JSON text. */
export interface RawNativeAddon {
  isAvailable: () => Promise<string>
  /**
   * Takes the request JSON without images, and the images as Buffers.
   * `onSnapshot` receives the whole text of each stream snapshot before `result` settles.
   * `cancel` stops the session, and `result` then rejects.
   */
  respond: (requestJSON: string, images: Buffer[], onSnapshot?: (text: string) => void) => {
    result: Promise<string>
    cancel: () => void
  }
}
