import type { AppleVisionAvailability } from './types'

/** One earlier message of the conversation. See ADR-0008. */
export interface AppleVisionHistoryTurn {
  role: 'user' | 'assistant'
  text: string
  /** The decoded Image Attachments. An `assistant` turn has none. */
  images: Uint8Array[]
}

/** One request after the chat-completions body is translated. See ADR-0008. */
export interface AppleVisionRespondRequest {
  /** The joined `system` messages. */
  instructions?: string
  /** The `user` and `assistant` messages before the last `user` message, in order. */
  history: AppleVisionHistoryTurn[]
  /** The text parts of the last `user` message. */
  prompt: string
  /** The decoded Image Attachments of the last `user` message. */
  images: Uint8Array[]
  temperature?: number
  maximumResponseTokens?: number
}

export interface AppleVisionAnswer {
  text: string
  /** `content_filter` when the guardrails stopped the output. `text` then holds the output before the stop. See ADR-0012. */
  finishReason: 'stop' | 'content_filter'
  /** Absent when the SDK reports no token counts. See ADR-0013. */
  usage?: {
    promptTokens: number
    completionTokens: number
  }
}

/** A failure that the chat `fetch` answers with a 400 response. See ADR-0006, ADR-0011, and ADR-0012. */
export type AppleVisionRespondFailure
  = | {
    code: 'context_length_exceeded'
    message: string
    /** The context window of the model, in tokens. */
    contextSize?: number
    /** The SDK count of the request, in tokens. */
    tokenCount?: number
  }
  | {
    code: 'content_policy_violation' | 'unsupported_language' | 'invalid_image'
    message: string
  }

/** The result of `respond`. It rejects only for an error that no ADR maps. */
export type AppleVisionRespondResult
  = | { answer: AppleVisionAnswer }
    | { failure: AppleVisionRespondFailure }

export interface AppleVisionRespondOptions {
  /** Receives the whole text so far, once for each stream snapshot, before the result. See ADR-0010. */
  onText?: (text: string) => void
  /** Cancels the answer and its session. The result then rejects with the abort reason. See ADR-0008. */
  signal?: AbortSignal
}

/** What an implementation, native or Electron, provides to the chat `fetch`. */
export interface AppleVisionOperations {
  /** Reports whether the on-device model can answer now. It does not throw for an unavailable model. */
  isAvailable: () => Promise<AppleVisionAvailability>
  respond: (request: AppleVisionRespondRequest, options?: AppleVisionRespondOptions) => Promise<AppleVisionRespondResult>
}

/** The request options that `chat(model)` returns. They fit xsAI `generateText`. */
export interface AppleVisionChatRequestOptions {
  apiKey: string
  baseURL: string
  fetch: typeof globalThis.fetch
  model: string
}

/** The Foundation Models name of the default on-device model. See ADR-0002. */
export const APPLE_VISION_MODEL = 'system'

const BASE_URL = 'http://apple-vision.invalid/v1/'

/** The request fields that this release answers. Any other field fails. See ADR-0002. */
const SUPPORTED_FIELDS = new Set(['model', 'messages', 'stream', 'stream_options', 'temperature', 'max_tokens', 'max_completion_tokens'])

const DATA_URL = /^data:image\/(?:png|jpeg|heic|webp);base64,(.+)$/s

interface ChatContentPart {
  type: string
  text?: string
  image_url?: { url: string }
}

interface ChatMessage {
  role: string
  content: string | ChatContentPart[] | null
}

class ChatRequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

function errorBody(code: string, message: string, details: Record<string, number | undefined> = {}) {
  return { error: { code, message, type: 'invalid_request_error', ...details } }
}

function errorResponse(status: number, code: string, message: string) {
  return new Response(JSON.stringify(errorBody(code, message)), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

function failureBody(failure: AppleVisionRespondFailure) {
  // `JSON.stringify` drops an absent size.
  const details = failure.code === 'context_length_exceeded'
    ? { context_size: failure.contextSize, token_count: failure.tokenCount }
    : {}
  return errorBody(failure.code, failure.message, details)
}

function failureResponse(failure: AppleVisionRespondFailure) {
  return new Response(JSON.stringify(failureBody(failure)), {
    headers: { 'Content-Type': 'application/json' },
    status: 400,
  })
}

function usageBody(usage: AppleVisionAnswer['usage']) {
  return usage && {
    usage: {
      completion_tokens: usage.completionTokens,
      prompt_tokens: usage.promptTokens,
      total_tokens: usage.promptTokens + usage.completionTokens,
    },
  }
}

function unsupported(message: string): never {
  throw new ChatRequestError(400, 'unsupported_request', message)
}

function textOf(message: ChatMessage) {
  if (typeof message.content === 'string')
    return message.content
  return (message.content ?? []).filter(part => part.type === 'text').map(part => part.text ?? '').join('\n')
}

function decodeImage(part: ChatContentPart, index: number) {
  const url = part.image_url?.url ?? ''
  if (/^https?:/.test(url))
    unsupported(`Image ${index + 1} is a remote URL. Pass a base64 data URL instead. See ADR-0006.`)
  const base64 = DATA_URL.exec(url)?.[1]
  if (base64 == null)
    unsupported(`Image ${index + 1} is not a base64 PNG, JPEG, HEIC, or WebP data URL.`)
  // `atob` exists in Node.js and in an Electron renderer. `Buffer` exists only in Node.js.
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0))
}

/** Translates a chat-completions body. It fails with a 400 for any part that this release does not answer. */
export function translateChatRequest(body: Record<string, unknown>): AppleVisionRespondRequest {
  for (const field of Object.keys(body)) {
    // Hosts such as AIRI match "tools are not supported" to retry without tools.
    if (field === 'tools')
      unsupported('Tools are not supported. The built-in Vision tools are a Provider setting. See ADR-0009.')
    if (!SUPPORTED_FIELDS.has(field))
      unsupported(`The "${field}" field is not supported yet.`)
  }
  for (const option of Object.keys((body.stream_options ?? {}) as Record<string, unknown>)) {
    if (option !== 'include_usage')
      unsupported(`The "stream_options.${option}" option is not supported yet.`)
  }
  if (body.model !== APPLE_VISION_MODEL)
    unsupported(`Unknown model "${String(body.model)}". Use "${APPLE_VISION_MODEL}".`)

  const messages = (body.messages ?? []) as ChatMessage[]
  const system = messages.filter(message => message.role === 'system')
  const conversation = messages.filter(message => message.role !== 'system')
  const last = conversation.at(-1)
  if (last?.role !== 'user')
    unsupported('The last message must be a user message.')

  // Image numbers in errors count across the whole conversation.
  let imageNumber = 0
  const imagesOf = (message: ChatMessage) => {
    const parts = typeof message.content === 'string' ? [] : message.content ?? []
    for (const part of parts) {
      if (part.type !== 'text' && part.type !== 'image_url')
        unsupported(`The "${part.type}" content part is not supported.`)
    }
    return parts.filter(part => part.type === 'image_url').map(part => decodeImage(part, imageNumber++))
  }

  const history = conversation.slice(0, -1).map((message): AppleVisionHistoryTurn => {
    if (message.role !== 'user' && message.role !== 'assistant')
      unsupported(`The "${message.role}" role is not supported.`)
    if (message.content == null)
      unsupported('An assistant message without content, such as a tool call, is not supported.')
    const images = imagesOf(message)
    if (message.role === 'assistant' && images.length > 0)
      unsupported('An assistant message cannot contain images.')
    return { images, role: message.role, text: textOf(message) }
  })

  const request: AppleVisionRespondRequest = {
    history,
    images: imagesOf(last),
    prompt: textOf(last),
  }
  if (system.length > 0)
    request.instructions = system.map(textOf).join('\n\n')
  if (typeof body.temperature === 'number')
    request.temperature = body.temperature
  const maximumResponseTokens = body.max_completion_tokens ?? body.max_tokens
  if (typeof maximumResponseTokens === 'number')
    request.maximumResponseTokens = maximumResponseTokens
  return request
}

/**
 * Answers a request with `stream: true` as server-sent events. See ADR-0010.
 *
 * A failure before the first text returns the same error response as a request
 * without streaming. After the first text, a failure becomes an error event.
 */
async function streamResponse(
  respond: (onText: (text: string) => void) => Promise<AppleVisionRespondResult>,
  includeUsage: boolean,
): Promise<Response> {
  const encoder = new TextEncoder()
  const id = `chatcmpl-${crypto.randomUUID()}`
  const created = Math.floor(Date.now() / 1000)
  const event = (data: unknown) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
  const chunk = (fields: Record<string, unknown>) => event({ created, id, model: APPLE_VISION_MODEL, object: 'chat.completion.chunk', ...fields })

  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start: (value) => {
      controller = value
    },
  })
  let sent: string | undefined
  let closed = false
  const firstText = Promise.withResolvers<'text'>()

  const sendText = (text: string) => {
    if (closed)
      return
    // A text snapshot only appends. An event cannot take back sent text, so a rewrite fails the stream.
    if (!text.startsWith(sent ?? '')) {
      closed = true
      controller.error(new Error('A stream snapshot rewrote text that was already sent.'))
      return
    }
    const content = text.slice(sent?.length ?? 0)
    if (sent != null && content === '')
      return
    const delta = sent == null ? { content, role: 'assistant' } : { content }
    controller.enqueue(chunk({ choices: [{ delta, finish_reason: null, index: 0 }] }))
    sent = text
    firstText.resolve('text')
  }

  const result = respond(sendText)
  const settled = result.then(() => 'settled' as const, () => 'settled' as const)
  if (await Promise.race([firstText.promise, settled]) === 'settled' && sent == null) {
    const outcome = await result
    if ('failure' in outcome)
      return failureResponse(outcome.failure)
  }

  void result.then((outcome) => {
    if (closed)
      return
    if ('failure' in outcome) {
      controller.enqueue(event(failureBody(outcome.failure)))
    }
    else {
      const { finishReason, text, usage } = outcome.answer
      sendText(text)
      if (closed)
        return
      controller.enqueue(chunk({ choices: [{ delta: {}, finish_reason: finishReason, index: 0 }] }))
      if (includeUsage && usage)
        controller.enqueue(chunk({ choices: [], ...usageBody(usage) }))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
    }
    closed = true
    controller.close()
  }, (error: unknown) => {
    if (closed)
      return
    closed = true
    controller.error(error)
  })

  return new Response(body, { headers: { 'Cache-Control': 'no-cache', 'Content-Type': 'text/event-stream' } })
}

/** Creates the `fetch` that answers chat-completions requests with the on-device model. */
export function createChatFetch(operations: AppleVisionOperations): typeof globalThis.fetch {
  return async (_input, init) => {
    try {
      const signal = init?.signal ?? undefined
      signal?.throwIfAborted()
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const request = translateChatRequest(body)

      const availability = await operations.isAvailable()
      if (!availability.available)
        return errorResponse(503, availability.reason.code, availability.reason.message)

      if (body.stream === true) {
        const includeUsage = (body.stream_options as { include_usage?: unknown } | undefined)?.include_usage === true
        return await streamResponse(onText => operations.respond(request, { onText, ...signal && { signal } }), includeUsage)
      }

      const result = await operations.respond(request, signal && { signal })
      if ('failure' in result)
        return failureResponse(result.failure)

      const { finishReason, text, usage } = result.answer
      return new Response(JSON.stringify({
        choices: [{
          finish_reason: finishReason,
          index: 0,
          message: { content: text, role: 'assistant' },
        }],
        created: Math.floor(Date.now() / 1000),
        id: `chatcmpl-${crypto.randomUUID()}`,
        model: APPLE_VISION_MODEL,
        object: 'chat.completion',
        ...usageBody(usage),
      }), { headers: { 'Content-Type': 'application/json' } })
    }
    catch (error) {
      if (error instanceof ChatRequestError)
        return errorResponse(error.status, error.code, error.message)
      throw error
    }
  }
}

/** Creates the request options for `chat(model)`. */
export function createChatRequestOptions(operations: AppleVisionOperations, model = APPLE_VISION_MODEL): AppleVisionChatRequestOptions {
  return { apiKey: '', baseURL: BASE_URL, fetch: createChatFetch(operations), model }
}
