import type { AppleVisionChatRequestOptions, AppleVisionOperations } from './chat'

import { createChatRequestOptions } from './chat'

/** The Apple Vision Provider. The native and Electron packages create it from their operations. See ADR-0002. */
export interface AppleVisionProvider extends AppleVisionOperations {
  /** Returns xsAI request options that answer chat-completions requests on-device. */
  chat: (model?: string) => AppleVisionChatRequestOptions
}

/** Creates a Provider from the operations of one implementation. */
export function createAppleVisionProvider(operations: AppleVisionOperations): AppleVisionProvider {
  return {
    chat: model => createChatRequestOptions(operations, model),
    isAvailable: operations.isAvailable,
    respond: operations.respond,
  }
}
