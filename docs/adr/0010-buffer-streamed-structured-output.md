---
status: accepted
---

# Buffer streamed structured output

A request with `stream: true` and a JSON Schema succeeds. The Provider waits until the model completes the structured value, then sends it as one delta and ends the stream.

Foundation Models streams partial structured values, not JSON text. Two serialized snapshots are not always a prefix of each other, because a later snapshot can reorder fields or close a bracket. A chat-completions stream only appends text, so the snapshots do not map to deltas without a JSON diff.

The buffered stream returns the same content as a request without streaming. Only the arrival time is different. A request without a schema streams normally, as ADR-0002 describes.

We rejected a 400 response for streaming with a schema. It breaks a caller that always streams, such as a host that uses `streamText` for every request.

A later release can stream partial values when a caller needs them.

## Wire format

A stream uses the chat-completions server-sent events:

1. Each text snapshot sends one `chat.completion.chunk` with the new text as `delta.content`. The first chunk also has `delta.role: "assistant"`.
2. The last chunk has an empty `delta` and the `finish_reason`: `stop`, or `content_filter` after a guardrail stop.
3. With `stream_options.include_usage`, a chunk with empty `choices` and the `usage` follows. It is absent when the SDK reports no usage. See ADR-0013.
4. `data: [DONE]` ends the stream.

A text snapshot contains all text so far, and the Provider sends only the new part. This needs each snapshot to extend the previous one. On macOS 27.2, 60 snapshots in three answers always did. If a snapshot changes sent text, the Provider fails the stream, because an event cannot take text back.

A failure before the first text returns the same error response as a request without streaming, with its status code. A failure after the first text sends one event with the error object of ADR-0011 or ADR-0012, and the stream ends without `[DONE]`.
