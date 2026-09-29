---
status: accepted
---

# Expose the model as an xsAI chat provider

The Apple Vision Provider is an xsAI `ChatProvider`. `chat(model)` returns request options with a custom `fetch`. The `fetch` accepts an OpenAI chat-completions request and answers it with the on-device model.

This choice makes the Provider work with `generateText`, `streamText`, and `generateObject` without a new request interface. A host that already sends images to a vision model, such as AIRI, uses the Provider like any other chat model.

The `fetch` supports these parts of a request:

- `system`, `user`, and `assistant` messages.
- `text` and `image_url` content parts.
- `stream: true` and `stream_options.include_usage`, answered as server-sent events. Each Foundation Models snapshot becomes one delta. With a JSON Schema, the stream sends the complete value once. See ADR-0010.
- `response_format` with a JSON Schema. See ADR-0005.
- `temperature` and `max_tokens`, mapped to generation options.

The `fetch` rejects a request with other parts, such as `tools`, with a 400 response. It does not ignore them, because a silent drop changes the meaning of the request. The built-in Vision tools are a Provider setting, not request tools. See ADR-0009.

Failures use chat-completions error responses. ADR-0004, ADR-0011, and ADR-0012 give the status codes and error codes.

The model identifier is `system`, the Foundation Models name for the default on-device model.

We rejected a new `analyzeImage` function as the public interface. Each host then needs its own adapter. A chat provider reuses the adapters that xsAI already has.
