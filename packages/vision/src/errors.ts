import type { AppleVisionUnavailableReason } from './types'

import { XSAIError } from '@xsai/shared'

/** Thrown by an operation when the on-device model is unavailable. `isAvailable()` never throws it. */
export class AppleVisionUnavailableError extends XSAIError {
  readonly reason: AppleVisionUnavailableReason

  constructor(reason: AppleVisionUnavailableReason, options?: ErrorOptions) {
    super(reason.message, 'apple_vision_unavailable', options)
    this.name = 'AppleVisionUnavailableError'
    this.reason = reason
  }
}
