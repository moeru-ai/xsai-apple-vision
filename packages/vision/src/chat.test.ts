import type { AppleVisionOperations } from './chat'

import { describe, expect, it, vi } from 'vitest'

import { createChatFetch, translateChatRequest } from './chat'

const png = 'data:image/png;base64,iVBORw0KGgo='

function post(fetch: typeof globalThis.fetch, body: Record<string, unknown>) {
  return fetch('http://apple-vision.invalid/v1/chat/completions', { body: JSON.stringify(body), method: 'POST' })
}

describe('translateChatRequest', () => {
  it('joins system messages into instructions and decodes the images of the user message', () => {
    const request = translateChatRequest({
      max_tokens: 64,
      messages: [
        { content: 'You describe screenshots.', role: 'system' },
        { content: [{ text: 'What is on screen?', type: 'text' }, { image_url: { url: png }, type: 'image_url' }], role: 'user' },
      ],
      model: 'system',
      temperature: 0.2,
    })

    expect(request).toEqual({
      history: [],
      images: [Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])],
      instructions: 'You describe screenshots.',
      maximumResponseTokens: 64,
      prompt: 'What is on screen?',
      temperature: 0.2,
    })
  })
})

describe('translateChatRequest with a conversation', () => {
  it('keeps earlier turns in order with their images, and gives the last user message its own images', () => {
    const request = translateChatRequest({
      messages: [
        { content: 'Be brief.', role: 'system' },
        { content: [{ text: 'What is this?', type: 'text' }, { image_url: { url: png }, type: 'image_url' }], role: 'user' },
        { content: 'A menu.', role: 'assistant' },
        { content: 'Answer in English.', role: 'system' },
        { content: 'Which item is selected?', role: 'user' },
      ],
      model: 'system',
    })

    expect(request.instructions).toBe('Be brief.\n\nAnswer in English.')
    expect(request.history).toEqual([
      { images: [expect.any(Uint8Array)], role: 'user', text: 'What is this?' },
      { images: [], role: 'assistant', text: 'A menu.' },
    ])
    expect(request.prompt).toBe('Which item is selected?')
    expect(request.images).toEqual([])
  })
})

function events(text: string) {
  return text.split('\n\n').filter(Boolean).map(line => line.replace(/^data: /, '')).map(data => data === '[DONE]' ? data : JSON.parse(data) as Record<string, unknown>)
}

describe('createChatFetch', () => {
  const operations = (overrides: Partial<AppleVisionOperations> = {}): AppleVisionOperations => ({
    isAvailable: async () => ({ available: true }),
    respond: async () => ({ answer: { finishReason: 'stop', text: 'A menu.', usage: { completionTokens: 3, promptTokens: 200 } } }),
    ...overrides,
  })

  it('answers with a chat completion and the token usage', async () => {
    const response = await post(createChatFetch(operations()), {
      messages: [{ content: 'Hi', role: 'user' }],
      model: 'system',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      choices: [{ finish_reason: 'stop', message: { content: 'A menu.', role: 'assistant' } }],
      object: 'chat.completion',
      usage: { completion_tokens: 3, prompt_tokens: 200, total_tokens: 203 },
    })
  })

  it('keeps the output before a guardrail stop as a content_filter answer, and omits absent usage', async () => {
    const response = await post(createChatFetch(operations({
      respond: async () => ({ answer: { finishReason: 'content_filter', text: 'The window' } }),
    })), { messages: [{ content: 'Hi', role: 'user' }], model: 'system' })

    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ choices: [{ finish_reason: 'content_filter', message: { content: 'The window' } }] })
    expect(body).not.toHaveProperty('usage')
  })

  it('answers a context overflow with a 400 and the sizes', async () => {
    const response = await post(createChatFetch(operations({
      respond: async () => ({ failure: { code: 'context_length_exceeded', contextSize: 4096, message: 'Too long.', tokenCount: 5000 } }),
    })), { messages: [{ content: 'Hi', role: 'user' }], model: 'system' })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: { code: 'context_length_exceeded', context_size: 4096, message: 'Too long.', token_count: 5000, type: 'invalid_request_error' },
    })
  })

  it.each([
    'content_policy_violation',
    'unsupported_language',
    'invalid_image',
  ] as const)('answers %s with a 400 and that code', async (code) => {
    const response = await post(createChatFetch(operations({
      respond: async () => ({ failure: { code, message: 'No.' } }),
    })), { messages: [{ content: 'Hi', role: 'user' }], model: 'system' })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: { code, message: 'No.', type: 'invalid_request_error' } })
  })

  it('answers an unavailable model with a 503 and its reason code', async () => {
    const respond = vi.fn()
    const response = await post(createChatFetch(operations({
      isAvailable: async () => ({ available: false, reason: { code: 'model-not-ready', message: 'Downloading.' } }),
      respond,
    })), { messages: [{ content: 'Hi', role: 'user' }], model: 'system' })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'model-not-ready' } })
    expect(respond).not.toHaveBeenCalled()
  })

  it.each([
    ['a field that this release does not answer', { tools: [] }],
    ['a stream option that this release does not answer', { stream: true, stream_options: { include_obfuscation: true } }],
    ['a tool message', { messages: [{ content: 'Hi', role: 'user' }, { content: '42', role: 'tool' }, { content: 'Again', role: 'user' }] }],
    ['an image in an assistant message', { messages: [{ content: 'Hi', role: 'user' }, { content: [{ image_url: { url: png }, type: 'image_url' }], role: 'assistant' }, { content: 'Again', role: 'user' }] }],
    ['a conversation that does not end with a user message', { messages: [{ content: 'Hi', role: 'user' }, { content: 'Hello', role: 'assistant' }] }],
    ['a remote image', { messages: [{ content: [{ image_url: { url: 'https://example.com/a.png' }, type: 'image_url' }], role: 'user' }] }],
  ])('rejects %s with a 400 instead of ignoring it', async (_, overrides) => {
    const respond = vi.fn()
    const response = await post(createChatFetch(operations({ respond })), {
      messages: [{ content: 'Hi', role: 'user' }],
      model: 'system',
      ...overrides,
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'unsupported_request' } })
    expect(respond).not.toHaveBeenCalled()
  })
})

describe('createChatFetch with stream: true', () => {
  const streamOf = (respond: AppleVisionOperations['respond'], streamOptions?: Record<string, unknown>) => post(
    createChatFetch({ isAvailable: async () => ({ available: true }), respond }),
    { messages: [{ content: 'Hi', role: 'user' }], model: 'system', stream: true, stream_options: streamOptions },
  )

  it('sends each snapshot as the new text only, then the finish reason, the usage, and [DONE]', async () => {
    const response = await streamOf(async (_, { onText } = {}) => {
      onText?.('The')
      onText?.('The window')
      return { answer: { finishReason: 'stop', text: 'The window', usage: { completionTokens: 2, promptTokens: 10 } } }
    }, { include_usage: true })

    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(events(await response.text())).toMatchObject([
      { choices: [{ delta: { content: 'The', role: 'assistant' }, finish_reason: null }], object: 'chat.completion.chunk' },
      { choices: [{ delta: { content: ' window' }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
      { choices: [], usage: { completion_tokens: 2, prompt_tokens: 10, total_tokens: 12 } },
      '[DONE]',
    ])
  })

  it('sends no usage chunk without include_usage', async () => {
    const response = await streamOf(async (_, { onText } = {}) => {
      onText?.('Hi')
      return { answer: { finishReason: 'stop', text: 'Hi', usage: { completionTokens: 1, promptTokens: 1 } } }
    })

    expect(events(await response.text()).some(event => typeof event === 'object' && 'usage' in event)).toBe(false)
  })

  it('answers a failure before the first text with the same 400 as a request without streaming', async () => {
    const response = await streamOf(async () => ({ failure: { code: 'content_policy_violation', message: 'No.' } }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'content_policy_violation' } })
  })

  it('sends a failure after the first text as an error event, without [DONE]', async () => {
    const response = await streamOf(async (_, { onText } = {}) => {
      onText?.('The')
      return { failure: { code: 'context_length_exceeded', contextSize: 4096, message: 'Too long.' } }
    })

    expect(response.status).toBe(200)
    expect(events(await response.text())).toMatchObject([
      { choices: [{ delta: { content: 'The' } }] },
      { error: { code: 'context_length_exceeded', context_size: 4096 } },
    ])
  })

  it('fails the stream when a snapshot rewrites text that was already sent', async () => {
    const response = await streamOf(async (_, { onText } = {}) => {
      onText?.('The cat')
      onText?.('A dog')
      return { answer: { finishReason: 'stop', text: 'A dog' } }
    })

    await expect(response.text()).rejects.toThrow('rewrote')
  })
})
