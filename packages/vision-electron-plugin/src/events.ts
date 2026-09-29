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

export const appleVisionSupportedLanguages = defineInvokeEventa<string[]>(
  'xsai-apple-vision:vision:supported-languages',
)

export const appleVisionSupportsLanguage = defineInvokeEventa<boolean, string>(
  'xsai-apple-vision:vision:supports-language',
)

export const appleVisionRespond = defineInvokeEventa<AppleVisionRespondEvent, AppleVisionRespondRequest>(
  'xsai-apple-vision:vision:respond',
)
