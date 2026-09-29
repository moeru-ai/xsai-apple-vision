import type { Buffer } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

import { createAppleVisionProvider } from './provider'

function answer(json: string) {
  return { cancel: vi.fn(), result: Promise.resolve(json) }
}

describe('createAppleVisionProvider', () => {
  it('parses the availability that the addon reports', async () => {
    const provider = createAppleVisionProvider({
      addon: {
        isAvailable: async () => '{"available":false,"reason":{"code":"model-not-ready","message":"Downloading."}}',
        prepareOCR: vi.fn(),
        supportedLanguages: vi.fn(),
        supportsLanguage: vi.fn(),
        respond: vi.fn(),
      },
    })

    await expect(provider.isAvailable()).resolves.toEqual({
      available: false,
      reason: { code: 'model-not-ready', message: 'Downloading.' },
    })
  })

  it('sends the history images in order, then the prompt images, with a count for each turn', async () => {
    const respond = vi.fn((_requestJSON: string, _images: Buffer[]) => answer('{"answer":{"text":"ok","finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}}'))
    const provider = createAppleVisionProvider({ addon: { isAvailable: async () => '{"available":true}', prepareOCR: vi.fn(), supportedLanguages: vi.fn(), supportsLanguage: vi.fn(), respond } })
    const image = (byte: number) => Uint8Array.from([byte])

    await provider.chat().fetch('http://apple-vision.invalid/v1/chat/completions', {
      body: JSON.stringify({
        messages: [
          { content: [{ image_url: { url: 'data:image/png;base64,AQ==' }, type: 'image_url' }], role: 'user' },
          { content: 'One.', role: 'assistant' },
          { content: [{ text: 'And this?', type: 'text' }, { image_url: { url: 'data:image/png;base64,Ag==' }, type: 'image_url' }], role: 'user' },
        ],
        model: 'system',
      }),
      method: 'POST',
    })

    const [requestJSON, images] = respond.mock.calls[0]!
    expect(JSON.parse(requestJSON)).toMatchObject({
      history: [{ imageCount: 1, role: 'user' }, { imageCount: 0, role: 'assistant', text: 'One.' }],
      prompt: 'And this?',
      promptImageCount: 1,
    })
    expect(images.map(buffer => [...buffer])).toEqual([[...image(1)], [...image(2)]])
  })

  it('passes each snapshot of the addon to a streamed response', async () => {
    const provider = createAppleVisionProvider({
      addon: {
        isAvailable: async () => '{"available":true}',
        prepareOCR: vi.fn(),
        supportedLanguages: vi.fn(),
        supportsLanguage: vi.fn(),
        respond: (_requestJSON, _images, onSnapshot) => {
          onSnapshot?.('A')
          onSnapshot?.('A menu.')
          return answer('{"answer":{"text":"A menu.","finishReason":"stop"}}')
        },
      },
    })

    const response = await provider.chat().fetch('http://apple-vision.invalid/v1/chat/completions', {
      body: JSON.stringify({ messages: [{ content: 'Hi', role: 'user' }], model: 'system', stream: true }),
      method: 'POST',
    })

    const text = await response.text()
    expect(text).toContain('"delta":{"content":"A","role":"assistant"}')
    expect(text).toContain('"delta":{"content":" menu."}')
  })

  it('does not call the addon until the first operation', async () => {
    const isAvailable = vi.fn(async () => '{"available":true}')
    const provider = createAppleVisionProvider({ addon: { isAvailable, prepareOCR: vi.fn(), supportedLanguages: vi.fn(), supportsLanguage: vi.fn(), respond: vi.fn() } })
    expect(isAvailable).not.toHaveBeenCalled()

    await provider.isAvailable()
    expect(isAvailable).toHaveBeenCalledOnce()
  })

  it('cancels the native session when the signal aborts, and rejects with the abort reason', async () => {
    const cancel = vi.fn()
    let rejectResult!: (error: Error) => void
    const provider = createAppleVisionProvider({
      addon: {
        isAvailable: async () => '{"available":true}',
        prepareOCR: vi.fn(),
        supportedLanguages: vi.fn(),
        supportsLanguage: vi.fn(),
        respond: () => ({ cancel, result: new Promise<string>((_, reject) => { rejectResult = reject }) }),
      },
    })
    const controller = new AbortController()
    const reason = new Error('The user left.')

    const result = provider.respond({ history: [], images: [], prompt: 'Hi' }, { signal: controller.signal })
    controller.abort(reason)
    rejectResult(new Error('CancellationError()'))

    await expect(result).rejects.toBe(reason)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('sends the built-in tools of the Provider with every request', async () => {
    const respond = vi.fn((_requestJSON: string, _images: Buffer[]) => answer('{"answer":{"text":"ok","finishReason":"stop"}}'))
    const provider = createAppleVisionProvider({
      addon: { isAvailable: async () => '{"available":true}', prepareOCR: vi.fn(), supportedLanguages: vi.fn(), supportsLanguage: vi.fn(), respond },
      builtInTools: { ocr: true },
    })

    await provider.respond({ history: [], images: [], prompt: 'Read this.' })

    expect(JSON.parse(respond.mock.calls[0]![0])).toMatchObject({ builtInTools: { ocr: true } })
  })

  it('compiles the OCR models in prepare only when OCR is on', async () => {
    const prepareOCR = vi.fn(async () => 'null')
    const addon = { isAvailable: vi.fn(), prepareOCR, respond: vi.fn(), supportedLanguages: vi.fn(), supportsLanguage: vi.fn() }

    await createAppleVisionProvider({ addon }).prepare()
    expect(prepareOCR).not.toHaveBeenCalled()

    await createAppleVisionProvider({ addon, builtInTools: { ocr: true } }).prepare()
    expect(prepareOCR).toHaveBeenCalledOnce()
  })

  it('parses the supported languages that the addon reports', async () => {
    const provider = createAppleVisionProvider({
      addon: { isAvailable: vi.fn(), prepareOCR: vi.fn(), respond: vi.fn(), supportedLanguages: async () => '["en-Latn-US","zh-Hans-CN"]', supportsLanguage: async (tag: string) => String(tag === 'es-MX') },
    })

    await expect(provider.supportedLanguages()).resolves.toEqual(['en-Latn-US', 'zh-Hans-CN'])
    await expect(provider.supportsLanguage('es-MX')).resolves.toBe(true)
    await expect(provider.supportsLanguage('th')).resolves.toBe(false)
  })
})
