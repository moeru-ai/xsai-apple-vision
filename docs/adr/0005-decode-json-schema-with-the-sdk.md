---
status: accepted
---

# Decode JSON Schema with the SDK

A request with `response_format: { type: 'json_schema' }` returns structured output. This is the Visual Context that a host gives to its own conversation or agent. The answer is JSON text that matches the schema, so `generateObject` in xsAI parses it like any other provider's answer.

The Swift module decodes the JSON Schema with the SDK decoder: `GenerationSchema` is `Decodable` from JSON Schema. Guided generation then keeps the model output inside the schema. We rejected a converter of our own to `DynamicGenerationSchema`. The SDK decoder already covers more of JSON Schema than a converter would, and it changes with the SDK.

## Keywords that the SDK drops

The SDK decoder drops some keywords without an error. The output then does not follow them, and the caller does not know. So the Swift module encodes the decoded schema again, resolves its `$ref` values, and checks that each keyword of the request schema is still there with the same value. A dropped or changed keyword fails the request with a 400 `unsupported_request` response that names the keyword and its location, for example `The "format" keyword at properties.email is not supported.`

Measured with the macOS 27.2 SDK:

| Result                   | Keywords                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kept and guided          | `type`, `properties`, `required`, `description`, `items`, `minItems`, `maxItems`, string `enum`, `const`, `pattern`, `minimum`, `maximum`, `anyOf`, a `null` type in an `anyOf` |
| Dropped, so rejected     | `format`, `minLength`, `maxLength`, `uniqueItems`, `multipleOf`, `exclusiveMinimum`, an `enum` of numbers                                                                       |
| Dropped, and accepted    | Annotations that do not change the output: `$schema`, `$id`, `$comment`, `default`, `examples`, `deprecated`, `readOnly`, `writeOnly`                                           |
| Not decoded, so rejected | A `type` array such as `["string", "null"]`, `oneOf`                                                                                                                            |

A schema that the SDK cannot decode fails with the same code and the SDK message.

## Titles for `anyOf`

A nullable field or a union, such as `v.nullable()` or `v.union()` in Valibot, becomes an `anyOf`. The SDK requires a `title` on each `anyOf`, and it stores each titled choice in `$defs` under its title. So:

- The Swift module gives each `anyOf` without a title a unique title, from the property name.
- It also gives each object in an `anyOf` a unique title. Otherwise the SDK names both objects from the same path, and the second object replaces the first.
- Two `anyOf` with the same title from the caller become one choice in the SDK. The value check then finds the changed type and fails the request.

A title is only a name, so it does not change what the caller asked for. The model fills a `null` choice when there is no value.

## Other formats

`response_format: { type: 'text' }` is the same as no format. `type: 'json_object'` fails with a 400 response, because it has no schema, and nothing then guides the output to valid JSON.

We rejected a prompt that only asks for JSON. The small on-device model does not follow such a prompt reliably, and the caller then has to repair the output.
