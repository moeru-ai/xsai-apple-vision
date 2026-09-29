---
status: accepted
---

# Prepare the OCR models before the first request

The native Provider has a `prepare()` method. With the OCR tool on, it compiles the OCR models for the app. The host calls it in the background, for example when the app starts:

```ts
const provider = createAppleVisionProvider({ builtInTools: { ocr: true } })
void provider.prepare()
```

The first OCR call in an app takes 60 to 80 seconds, because the Neural Engine runtime compiles three OCR models for that app. ADR-0009 describes this cost. A host that sends its first image within its request timeout then fails, such as AIRI with 60 seconds.

`prepare()` runs Vision text recognition on a blank 16×16 image. This compiles the same three models as the OCR tool, so a request after it does not wait. After the models are compiled, `prepare()` returns in less than a second. Without the OCR tool, it does nothing.

Measured on macOS 27.2 with an app that had never used OCR:

| Step              | Time                 |
| ----------------- | -------------------- |
| `prepare()`       | 59.6 s               |
| First OCR request | 7.1 s, all text read |
| `prepare()` again | 0.1 s                |

The Provider does not prepare on its own when it is created. ADR-0001 loads the addon only on the first Provider operation, and a host decides when a minute of background work is acceptable.

We rejected a timeout-free first request, which waits for the compilation. It moves the wait to the user's first image. We also rejected a periodic warm-up call. The compiled models stay in the app's cache, so one call is enough.
