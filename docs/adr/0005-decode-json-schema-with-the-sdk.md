---
status: accepted
---

# Decode JSON Schema with the SDK

A request with `response_format: { type: 'json_schema' }` returns structured output. This is the Visual Context that a host gives to its own conversation or agent. The answer is JSON text that matches the schema, so `generateObject` in xsAI parses it like any other provider's answer.

The Swift module decodes the JSON Schema with the SDK decoder: `GenerationSchema` is `Decodable` from JSON Schema. Guided generation then keeps the model output inside the schema. We rejected a converter of our own to `DynamicGenerationSchema`. The SDK decoder already covers more of JSON Schema than a converter would, and it changes with the SDK.

## Keywords that the SDK drops

The SDK decoder drops some keywords without an error. The output then does not follow them, and the caller does not know. So the Swift module encodes the decoded schema again, and compares the keywords. A dropped keyword fails the request with a 400 `unsupported_request` response that names the keyword and its location, for example `The "format" keyword at properties.email is not supported.`

Measured with the macOS 27.2 SDK:

| Result                   | Keywords                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Kept and guided          | `type`, `properties`, `required`, `description`, `items`, `minItems`, `maxItems`, string `enum`, `const`, `pattern`, `minimum`, `maximum` |
| Dropped, so rejected     | `format`, `minLength`, `maxLength`, `uniqueItems`, `multipleOf`, `exclusiveMinimum`, an `enum` of numbers                                 |
| Dropped, and accepted    | Annotations that do not change the output: `$schema`, `$id`, `$comment`, `default`, `examples`, `deprecated`, `readOnly`, `writeOnly`     |
| Not decoded, so rejected | A `type` array such as `["string", "null"]`, `oneOf`, `anyOf` without a `title`                                                           |

A schema that the SDK cannot decode fails with the same code and the SDK message.

## Other formats

`response_format: { type: 'text' }` is the same as no format. `type: 'json_object'` fails with a 400 response, because it has no schema, and nothing then guides the output to valid JSON.

We rejected a prompt that only asks for JSON. The small on-device model does not follow such a prompt reliably, and the caller then has to repair the output.
