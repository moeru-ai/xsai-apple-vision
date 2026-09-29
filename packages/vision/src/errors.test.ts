import { XSAIError } from '@xsai/shared'
import { describe, expect, it } from 'vitest'

import { AppleVisionUnavailableError } from './errors'

describe('appleVisionUnavailableError', () => {
  it('keeps the reason and uses the xsAI error code', () => {
    const reason = { code: 'model-not-ready', message: 'The model is still downloading.' } as const
    const error = new AppleVisionUnavailableError(reason)

    expect(error).toBeInstanceOf(XSAIError)
    expect(error.name).toBe('AppleVisionUnavailableError')
    expect(error.message).toBe(reason.message)
    expect(error.reason).toEqual(reason)
  })
})
