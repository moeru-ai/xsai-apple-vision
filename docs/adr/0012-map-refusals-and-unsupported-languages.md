---
status: accepted
---

# Map refusals and unsupported languages

Foundation Models can refuse a request, or not support its language. The Provider maps each case to the chat-completions response that a caller expects:

| Case                                                    | Response                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The guardrails reject the prompt.                       | 400, error code `content_policy_violation`.                                                    |
| The guardrails stop the output during generation.       | 200, `finish_reason: "content_filter"`, with the text that the model produced before the stop. |
| The model refuses the request.                          | 400, error code `content_policy_violation`.                                                    |
| The model does not support the language of the request. | 400, error code `unsupported_language`.                                                        |

A 400 response is for the cases where no answer exists. A 200 response with empty content looks like a success to many callers, and they show an empty answer.

The guardrail stop keeps the 200 response, as OpenAI does, so the caller keeps the partial output.

With a JSON Schema, a partial value does not match the schema. So a guardrail stop of a structured answer returns `content_policy_violation`. See ADR-0010.

A refusal uses the same code as a guardrail rejection. The SDK can generate an explanation for a refusal, but that takes another model round, so the Provider does not request it.

`unsupported_language` is not an OpenAI code. A host uses it to tell the user that the Apple model does not support the language, instead of a general failure.

## Checking a language before a request

The Provider has two methods, so a host can check a language before it sends a request:

- `supportedLanguages()` lists the languages of the model, for example to show them in settings. It returns maximal BCP 47 identifiers, such as `zh-Hans-CN` and `zh-Hant-TW`. A minimal identifier is ambiguous: the SDK lists `zh` for `zh-Hans-CN`, so `zh` does not say which script it means.
- `supportsLanguage(tag)` checks one tag with the SDK match. The match accepts a regional variant of a listed language: `es-MX` matches `es-Latn-419`, and `en-CA` matches English.

A host uses `supportsLanguage(tag)` for the check. An exact comparison with the list rejects a regional variant, such as `es-MX`, that the model supports.

On macOS 27.2, the default model lists 24 languages.

## Telling the two guardrail cases apart

The SDK has one guardrail error for both cases. The Provider tells them apart by the output before the error.

The session always streams, also for a request without `stream: true`. The Provider keeps the text of the last snapshot. When the guardrail error arrives after some text, the text is the partial output. When it arrives before any text, the guardrails rejected the prompt.

A stream and a single response give the same text and the same usage. This was measured on macOS 27.2.
