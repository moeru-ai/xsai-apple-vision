import type { EventContext } from '@moeru/eventa'
import type { AppleVisionProvider } from '@xsai-apple-vision/vision'

import { defineInvoke, defineStreamInvoke } from '@moeru/eventa'
import { createAppleVisionProvider as createSharedAppleVisionProvider } from '@xsai-apple-vision/vision'

import { appleVisionIsAvailable, appleVisionRespond } from './events'

/**
 * Creates an Apple Vision Provider for an Electron renderer Eventa context.
 *
 * The Provider sends all native work to the main-process setup. It does not
 * import Electron or the native addon.
 */
export function createAppleVisionProvider<EmitOptions>(options: {
  context: EventContext<undefined, EmitOptions>
}): AppleVisionProvider {
  const invokeAvailability = defineInvoke(options.context, appleVisionIsAvailable)
  const invokeRespond = defineStreamInvoke(options.context, appleVisionRespond)

  return createSharedAppleVisionProvider({
    isAvailable: () => invokeAvailability(),
    async respond(request, { onText, signal } = {}) {
      signal?.throwIfAborted()
      try {
        for await (const event of invokeRespond(request, signal ? { signal } : {})) {
          if (event.type === 'result')
            return event.result
          onText?.(event.text)
        }
      }
      catch (error) {
        if (signal?.aborted)
          throw signal.reason
        throw error
      }
      throw new Error('The Apple Vision stream ended without a result.')
    },
  })
}

export * from './events'
export * from '@xsai-apple-vision/vision'
