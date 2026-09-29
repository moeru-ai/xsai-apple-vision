import type {
  AppleVisionAvailability,
  AppleVisionRespondRequest,
  AppleVisionRespondResult,
} from '@xsai-apple-vision/vision'

import { defineInvokeEventa } from '@moeru/eventa'

/** One event of an answer: the text so far for each stream snapshot, then the result once. */
export type AppleVisionRespondEvent
  = | { text: string, type: 'text' }
    | { result: AppleVisionRespondResult, type: 'result' }

export const appleVisionIsAvailable = defineInvokeEventa<AppleVisionAvailability>(
  'xsai-apple-vision:vision:is-available',
)

export const appleVisionRespond = defineInvokeEventa<AppleVisionRespondEvent, AppleVisionRespondRequest>(
  'xsai-apple-vision:vision:respond',
)
