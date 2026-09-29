---
status: accepted
---

# Report context overflow as context_length_exceeded

A request that does not fit the context window fails with a 400 response. The error code is `context_length_exceeded`, the code that OpenAI uses for the same failure. Hosts and xsAI already recognize it.

The error object has two more fields:

- `context_size`: the context window of the model, in tokens.
- `token_count`: the SDK count of the request, in tokens. It is absent when the SDK cannot count the request.

The message gives the number and the pixel size of the Image Attachments:

```json
{
  "error": {
    "code": "context_length_exceeded",
    "message": "The request does not fit the context window of 4096 tokens. It has 1 image: 768×768.",
    "type": "invalid_request_error",
    "context_size": 4096
  }
}
```

The caller can then decide how much to shrink the images before it tries again.

The Provider does not shrink the images and try again itself. ADR-0006 leaves the trade-off between detail and latency to the caller.

We rejected a 413 response. A 413 means that the request body is too large, not that the prompt has too many tokens.

## Where the sizes come from

The macOS 27.0 SDK declares `LanguageModelError.contextSizeExceeded` with the context size and the token count. The Provider uses these values when the runtime throws this error.

On macOS 27.2, the runtime still throws the deprecated `GenerationError.exceededContextWindowSize`, which has only a description. The Provider then reads `contextSize` from the model and counts the request with `tokenCount(for:)`.

`tokenCount(for:)` fails for a prompt or a transcript with an image attachment on macOS 27.2. So an overflow with images has no `token_count`. The Provider does not estimate it, for the same reason as ADR-0013.
