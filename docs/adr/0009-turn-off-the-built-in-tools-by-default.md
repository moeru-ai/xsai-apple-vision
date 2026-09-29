---
status: accepted
---

# Turn off the built-in tools by default

Foundation Models has two built-in tools that use the Vision framework: `OCRTool` reads text, and `BarcodeReaderTool` reads barcodes. The Provider turns both off by default.

The caller turns them on when it creates the Provider:

```ts
const provider = createAppleVisionProvider({
  builtInTools: { ocr: true, barcode: false },
})
```

Each tool call adds a model round and uses part of the context window. A default without tools keeps the latency and the context use predictable. A host that knows its images, such as AIRI with its screen captures, turns on the tool that helps it.

A request cannot change this setting. ADR-0002 rejects the chat-completions `tools` field, and this setting is not a caller tool. It is a property of the Provider.

## Image labels

A tool finds an image by its label. With a tool on, the Swift module labels every Image Attachment in the order of the request: `image-1`, `image-2`, and so on, history images included. Without a label, the model cannot name the image, and the tool call fails. The prompt does not need to mention the labels.

Without a tool, the images have no label, so the request is the same as before.

## Measured effect

These results come from macOS 27.2 on 2026-09-29. The test image is 2880×1800 with six known lines of 18 px text.

| Measure                    | Tools off                        | OCR on               |
| -------------------------- | -------------------------------- | -------------------- |
| Lines read correctly       | 0 of 6, the model invents others | 6 of 6, in every run |
| Prompt tokens              | about 200                        | about 620            |
| Latency with a warm system | about 5 s                        | about 4.5 s          |

The model scales every image down to a fixed size of about 200 tokens. So small text in a large image is not readable without the OCR tool, and the model guesses. Large text, layout, and colors stay readable.

The model also calls the OCR tool for an image without text, such as an illustration. That call adds little latency, and the answer then says that the image has no text instead of inventing some.

## First use in each app

The first OCR call of an app takes 60 to 80 seconds. The Neural Engine runtime then compiles the three OCR models for that app, about 30 seconds each. Later calls take about 4 seconds, also in a new process and after hours of idle time.

The compiled models stay in `~/Library/Caches/<bundle identifier or executable name>/com.apple.e5rt.e5bundlecache/<system build>/`. So each app pays this cost once, and again after a system update. A copy of the same executable under another name pays it again.

A host with a request timeout under 80 seconds, such as AIRI with 60 seconds, can time out on this first call. ADR-0016 compiles the models before the first request.
