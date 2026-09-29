import type {
  AppleVisionAvailability,
  AppleVisionBuiltInTools,
  AppleVisionOperations,
  AppleVisionProvider,
  AppleVisionRespondResult,
} from '@xsai-apple-vision/vision'

import type { RawNativeAddon } from './types'

import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import { arch } from 'node:process'

import { createAppleVisionProvider as createSharedAppleVisionProvider } from '@xsai-apple-vision/vision'

export interface CreateAppleVisionProviderOptions {
  /** Replaces the native addon, for example in tests. */
  addon?: RawNativeAddon
  /** Turns on built-in Vision tools for every request. A request cannot change it. See ADR-0009. */
  builtInTools?: AppleVisionBuiltInTools
}

export interface NativeAppleVisionProvider extends AppleVisionProvider {
  /**
   * Prepares the built-in tools before the first request. See ADR-0016.
   *
   * With OCR on, the first call in an app compiles the OCR models, which takes
   * about a minute once for each app and system build. Later calls return in
   * less than a second. Without OCR, it does nothing.
   */
  prepare: () => Promise<void>
}

const require = createRequire(import.meta.url)

function loadNativeAddon(): RawNativeAddon {
  return require(`@xsai-apple-vision/vision-native-darwin-${arch}`) as RawNativeAddon
}

/**
 * Creates the native Apple Vision Provider.
 *
 * Creating the Provider does not load the addon. The first operation loads it,
 * and passes a load error, such as on another architecture, to the caller.
 */
export function createAppleVisionProvider(options: CreateAppleVisionProviderOptions = {}): NativeAppleVisionProvider {
  let addon = options.addon

  const resolveAddon = (): RawNativeAddon => {
    addon ??= loadNativeAddon()
    return addon
  }

  const operations: AppleVisionOperations = {
    async isAvailable() {
      return JSON.parse(await resolveAddon().isAvailable()) as AppleVisionAvailability
    },
    async supportedLanguages() {
      return JSON.parse(await resolveAddon().supportedLanguages()) as string[]
    },
    async supportsLanguage(tag) {
      return JSON.parse(await resolveAddon().supportsLanguage(tag)) as boolean
    },
    async respond({ history, images, schema, ...request }, { onText, signal } = {}) {
      signal?.throwIfAborted()
      // The addon takes one image list: the images of each history turn in
      // order, then the prompt images. Each turn names only its image count.
      const allImages = [...history.flatMap(turn => turn.images), ...images]
      const requestJSON = JSON.stringify({
        ...request,
        builtInTools: options.builtInTools,
        history: history.map(turn => ({ imageCount: turn.images.length, role: turn.role, text: turn.text })),
        promptImageCount: images.length,
        // Swift decodes the schema with the SDK decoder from its JSON text.
        schemaJSON: schema && JSON.stringify(schema),
      })
      const answer = resolveAddon().respond(requestJSON, allImages.map(image => Buffer.from(image)), onText)
      const cancel = () => answer.cancel()
      signal?.addEventListener('abort', cancel, { once: true })
      try {
        return JSON.parse(await answer.result) as AppleVisionRespondResult
      }
      catch (error) {
        // The native error of a cancelled session says only that it was cancelled.
        if (signal?.aborted)
          throw signal.reason
        throw error
      }
      finally {
        signal?.removeEventListener('abort', cancel)
      }
    },
  }

  return {
    ...createSharedAppleVisionProvider(operations),
    async prepare() {
      if (options.builtInTools?.ocr === true)
        await resolveAddon().prepareOCR()
    },
  }
}
