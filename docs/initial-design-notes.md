# Initial design notes

These notes record the plan before the first package exists. The architecture decisions are in [adr](adr). This file keeps the parts that are not decisions: the host integration, and the facts checked against the SDK.

## Goal

A host application sends an image and a prompt to the on-device Apple Foundation Model, and gets back text or a structured Visual Context. The host then gives that result to its own conversation model.

```text
Screen capture or a user image      (host)
          |
          v
Apple Vision Provider               (this repository)
  Foundation Models, on-device, image input
          |
          v
Visual Context, text or JSON        (host)
          |
          v
Conversation or agent model         (host)
```

The on-device model is the eyes, and the host's own model is the brain. The on-device context window is 8,192 tokens, which is enough to describe one image but too small for a long conversation. So the library does not try to replace the conversation model.

## Integration in AIRI

AIRI keeps its application-specific parts, as it does for xsai-apple-speech:

- **stage-tamagotchi main process**: a service registers the Electron plugin with the native Provider, like `apple-speech-transcription`. A non-macOS host returns an inactive service and does not load the native package.
- **stage-ui provider registry**: a new `apple-vision` provider creates the renderer Provider from the Electron plugin. Its availability decides whether the provider shows as ready.
- **Vision module**: `use-vision-inference` already sends a prompt and an image to a chat provider. The Apple Vision Provider is one more choice there. It needs no change in the vision module.
- **Settings**: each Apple capability shows its own status from its availability code, for example "Apple Vision: Available" and "Apple Intelligence: Model downloading…".
- **Screen capture**: AIRI keeps its own capture. See ADR-0007.

## Facts checked against the macOS 27.0 SDK

These facts come from the WWDC26 session "What's new in the Foundation Models framework". Each one was checked on 2026-09-29 against `FoundationModels.swiftinterface` in the macOS 27.0 SDK:

| Fact                                                              | Result                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A prompt accepts an image attachment.                             | Yes. `Attachment<ImageAttachmentContent>` takes a `CGImage`, a `CIImage`, a `CVPixelBuffer`, or an image file URL. It starts in macOS 27. The core framework has no `NSImage` initializer, and ADR-0006 does not need one.                                                       |
| `SystemLanguageModel.Availability` gives the unavailable reasons. | Yes. The reasons are `deviceNotEligible`, `appleIntelligenceNotEnabled`, and `modelNotReady`, as ADR-0004 lists.                                                                                                                                                                 |
| The model reports its context size and languages.                 | Yes. `contextSize`, `supportedLanguages`, and `supportsLocale(_:)`.                                                                                                                                                                                                              |
| A dynamic schema describes JSON Schema at run time.               | Yes. `DynamicGenerationSchema` has objects, string choices, arrays with a minimum and a maximum count, and references. See ADR-0005.                                                                                                                                             |
| The failures are separate errors.                                 | Yes. `LanguageModelError` has `contextSizeExceeded` with the sizes, `guardrailViolation`, `refusal`, and `unsupportedLanguageOrLocale`. It replaces the deprecated `GenerationError`, but the macOS 27.2 runtime still throws `GenerationError`. ADR-0011 and ADR-0012 map both. |
| The SDK counts tokens.                                            | Yes. Each response and each stream snapshot has `usage`, and ADR-0013 reports it. `tokenCount(for:)` also counts a prompt or transcript entries, but it fails for an image attachment on macOS 27.2.                                                                             |
| Built-in Vision tools exist.                                      | Yes. `_Vision_FoundationModels` has `OCRTool` (`getText`) and `BarcodeReaderTool` (`readBarcodes`). Each finds an image by its attachment label. See ADR-0009.                                                                                                                   |

`guardrailViolation` is one error for both cases of ADR-0012. The Provider tells them apart by whether the model already produced output.

A third-party article reports a `/usr/bin/fm` command-line tool in macOS 27. It can help a quick prototype, but the library does not depend on it.

## Decisions after the first review

The first review decided the open questions of the first draft:

| Question                       | Decision                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| Built-in OCR and barcode tools | Off by default. The caller turns them on when it creates the Provider. ADR-0009.    |
| Streaming structured output    | The stream sends the complete value once. ADR-0010.                                 |
| Context overflow               | 400 with `context_length_exceeded`. ADR-0011.                                       |
| Refusals and languages         | `content_policy_violation`, `content_filter`, and `unsupported_language`. ADR-0012. |
| Usage                          | Only from the SDK. No estimate. ADR-0013.                                           |
| Text-to-speech                 | In xsai-apple-speech, not here. ADR-0014.                                           |
