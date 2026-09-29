import type { EventContext } from '@moeru/eventa'
import type { AppleVisionProvider } from '@xsai-apple-vision/vision'

import { defineInvokeHandler, defineStreamInvokeHandler, toStreamHandler } from '@moeru/eventa'

import { appleVisionIsAvailable, appleVisionRespond, appleVisionSupportedLanguages, appleVisionSupportsLanguage } from './events'

/** Eventa gives a cancellable invoke an abort controller, which the renderer aborts. */
function abortSignalFrom(options: unknown) {
  return (options as { abortController?: AbortController } | undefined)?.abortController?.signal
}

/**
 * Registers the Apple Vision invokes on one main-process Eventa context.
 *
 * The setup owns its handler registrations. It does not own the Provider or
 * the Eventa context.
 *
 * Triggering workflow:
 *
 * Electron renderer Eventa invoke
 *   -> {@link setupAppleVision}
 *     -> {@link AppleVisionProvider}
 */
export function setupAppleVision<Extensions, EmitOptions extends { raw?: unknown }>(options: {
  context: EventContext<Extensions, EmitOptions>
  provider: AppleVisionProvider
}): { dispose: () => void } {
  const handlerDisposers = [
    defineInvokeHandler(options.context, appleVisionIsAvailable, () => options.provider.isAvailable()),
    defineInvokeHandler(options.context, appleVisionSupportedLanguages, () => options.provider.supportedLanguages()),
    defineInvokeHandler(options.context, appleVisionSupportsLanguage, tag => options.provider.supportsLanguage(tag)),
    defineStreamInvokeHandler(options.context, appleVisionRespond, toStreamHandler(async ({ emit, options: invokeOptions, payload }) => {
      const signal = abortSignalFrom(invokeOptions)
      const result = await options.provider.respond(payload, {
        onText: text => emit({ text, type: 'text' }),
        ...signal && { signal },
      })
      emit({ result, type: 'result' })
    })),
  ]

  return {
    dispose() {
      for (const disposeHandler of handlerDisposers)
        disposeHandler()
    },
  }
}
