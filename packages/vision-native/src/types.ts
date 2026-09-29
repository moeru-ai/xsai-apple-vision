import type { Buffer } from 'node:buffer'

/** The functions that the Node-API addon exports. Each one returns JSON text. */
export interface RawNativeAddon {
  isAvailable: () => Promise<string>
  /**
   * Takes the request JSON without images, and the images as Buffers.
   * `onSnapshot` receives the whole text of each stream snapshot before `result` settles.
   * `cancel` stops the session, and `result` then rejects.
   */
  /** Compiles the OCR models for this app. The first call takes about a minute. */
  prepareOCR: () => Promise<string>
  /** Returns a JSON array of maximal BCP 47 identifiers. */
  supportedLanguages: () => Promise<string>
  /** Returns `true` or `false` as JSON. */
  supportsLanguage: (tag: string) => Promise<string>
  respond: (requestJSON: string, images: Buffer[], onSnapshot?: (text: string) => void) => {
    result: Promise<string>
    cancel: () => void
  }
}
