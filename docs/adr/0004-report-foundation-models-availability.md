---
status: accepted
---

# Report Foundation Models availability

`isAvailable()` returns a discriminated availability result, like xsai-apple-speech:

```ts
type AppleVisionAvailability
  = | { available: true }
    | {
      available: false
      reason: AppleVisionUnavailableReason
    }
```

The reason codes come from the Foundation Models availability of the default model, plus one code for an older system:

```ts
type AppleVisionUnavailableCode
  = | 'framework-unavailable'
    | 'device-not-eligible'
    | 'apple-intelligence-not-enabled'
    | 'model-not-ready'

interface AppleVisionUnavailableReason {
  code: AppleVisionUnavailableCode
  message: string
}
```

- `framework-unavailable`: the system is older than macOS 27.
- `device-not-eligible`: the Mac cannot run Apple Intelligence.
- `apple-intelligence-not-enabled`: the user has not turned on Apple Intelligence.
- `model-not-ready`: the model is still downloading or preparing.

A host uses the code to show one status for each capability, for example "Model downloading…". It does not guess availability from the CPU architecture.

The `fetch` answers an unavailable Provider with a 503 response that carries the reason. `isAvailable()` never throws for these four reasons.

A new Foundation Models reason that this release does not know maps to `framework-unavailable` with the native description as its message.
