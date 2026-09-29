import type { AppleVisionOperations } from '@xsai-apple-vision/vision'

import { createContext, linkChannel } from '@moeru/eventa'
import { createAppleVisionProvider as createSharedProvider } from '@xsai-apple-vision/vision'
import { describe, expect, it, vi } from 'vitest'

import { createAppleVisionProvider } from './index'
import { setupAppleVision } from './main'

function connect(operations: AppleVisionOperations) {
  const mainContext = createContext()
  const rendererContext = createContext()
  const channel = linkChannel(mainContext, rendererContext)
  const setup = setupAppleVision({ context: mainContext, provider: createSharedProvider(operations) })
  const provider = createAppleVisionProvider({ context: rendererContext })
  return {
    dispose() {
      setup.dispose()
      channel.dispose()
    },
    provider,
  }
}

describe('electron Eventa Provider', () => {
  it('reports the availability of the main-process Provider', async () => {
    const { dispose, provider } = connect({
      isAvailable: async () => ({ available: false, reason: { code: 'model-not-ready', message: 'Downloading.' } }),
      respond: vi.fn(),
    })

    await expect(provider.isAvailable()).resolves.toEqual({
      available: false,
      reason: { code: 'model-not-ready', message: 'Downloading.' },
    })
    dispose()
  })

  it('passes the request with its image bytes, each snapshot in order, then the result', async () => {
    const respond = vi.fn<AppleVisionOperations['respond']>(async (_, { onText } = {}) => {
      onText?.('A')
      onText?.('A menu.')
      return { answer: { finishReason: 'stop', text: 'A menu.' } }
    })
    const { dispose, provider } = connect({ isAvailable: async () => ({ available: true }), respond })
    const texts: string[] = []

    const result = await provider.respond({ history: [], images: [Uint8Array.from([1, 2])], prompt: 'What is this?' }, { onText: text => texts.push(text) })

    expect(result).toEqual({ answer: { finishReason: 'stop', text: 'A menu.' } })
    expect(texts).toEqual(['A', 'A menu.'])
    expect([...respond.mock.calls[0]![0].images[0]!]).toEqual([1, 2])
    dispose()
  })

  it('streams a chat completion through the renderer Provider', async () => {
    const { dispose, provider } = connect({
      isAvailable: async () => ({ available: true }),
      respond: async (_, { onText } = {}) => {
        onText?.('Hi')
        return { answer: { finishReason: 'stop', text: 'Hi' } }
      },
    })

    const response = await provider.chat().fetch('http://apple-vision.invalid/v1/chat/completions', {
      body: JSON.stringify({ messages: [{ content: 'Hello', role: 'user' }], model: 'system', stream: true }),
      method: 'POST',
    })

    const text = await response.text()
    expect(text).toContain('"delta":{"content":"Hi","role":"assistant"}')
    expect(text).toContain('data: [DONE]')
    dispose()
  })

  it('aborts the main-process answer when the renderer signal aborts', async () => {
    let mainSignal: AbortSignal | undefined
    const { dispose, provider } = connect({
      isAvailable: async () => ({ available: true }),
      respond: (_, { signal } = {}) => new Promise((_, reject) => {
        mainSignal = signal
        signal?.addEventListener('abort', () => reject(signal.reason))
      }),
    })
    const controller = new AbortController()
    const reason = new Error('The user left.')

    const result = provider.respond({ history: [], images: [], prompt: 'Hi' }, { signal: controller.signal })
    await vi.waitFor(() => expect(mainSignal).toBeDefined())
    controller.abort(reason)

    await expect(result).rejects.toBe(reason)
    await vi.waitFor(() => expect(mainSignal?.aborted).toBe(true))
    dispose()
  })
})
