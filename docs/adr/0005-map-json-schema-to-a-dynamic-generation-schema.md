---
status: accepted
---

# Map JSON Schema to a dynamic generation schema

A request with `response_format: { type: 'json_schema' }` returns structured output. This is the Visual Context that a host gives to its own conversation or agent.

The TypeScript Provider sends the JSON Schema to the Swift module. The Swift module builds a Foundation Models dynamic generation schema from it and uses guided generation. The model then cannot return output that does not match the schema.

The first release supports this subset of JSON Schema:

- `object` with `properties`, `required`, and `description`.
- `array` with `items`, `minItems`, and `maxItems`.
- `string`, with `enum`.
- `number`, `integer`, and `boolean`.

A schema with other keywords, such as `oneOf`, `$ref`, or `pattern`, fails with a 400 response that names the keyword. The Provider does not drop a keyword, because the output then does not match what the caller asked for.

We rejected a prompt that only asks for JSON. The small on-device model does not follow such a prompt reliably, and the caller then has to repair the output.
