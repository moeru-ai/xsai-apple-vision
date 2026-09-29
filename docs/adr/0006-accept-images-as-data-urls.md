---
status: accepted
---

# Accept images as data URLs

An Image Attachment is an `image_url` content part whose URL is a `data:` URL with base64 content. The first release accepts PNG, JPEG, HEIC, and WebP.

The TypeScript Provider decodes the base64 content and passes the bytes to the Swift module. The Swift module creates the image with Image I/O and attaches it to the prompt.

An image that Image I/O cannot decode fails with a 400 response. The error code is `invalid_image`, and the message gives the number of the image in the request.

The Provider rejects an `http:` or `https:` URL with a 400 response. It does not download images. A download adds network access, timeouts, and privacy questions to a library whose value is that it runs offline.

The Provider does not resize images. Foundation Models accepts any size and aspect ratio, and a larger image uses more tokens. The caller decides the trade-off between detail and latency.

## Choosing the image size

An image uses the same number of prompt tokens at every resolution. In the measurements below, the count changed only with the aspect ratio. So a larger image does not give the model more detail, and a smaller image does not save tokens.

Measured on macOS 27.2 with six known lines of 18 px text:

| Image                                  | Prompt tokens | Lines read correctly           |
| -------------------------------------- | ------------- | ------------------------------ |
| The whole 2880×1800 screenshot         | 197           | 0 of 6, the model invents text |
| The same screenshot at 1440×900        | 197           | 0 of 6                         |
| The same screenshot at 720×450         | 197           | 0 of 6                         |
| A 720×300 crop around the text         | 229           | 6 of 6                         |
| The same crop at 1440×600              | 229           | 6 of 6                         |
| The whole screenshot with the OCR tool | about 620     | 6 of 6                         |

So text that is small in the whole image is not readable. The model then invents text, and in one run it repeated a line until the answer filled the context window.

A caller that needs small text in a large image does one of these:

- It crops the region that holds the text. This uses the fewest tokens and adds no latency.
- It turns on the OCR tool (ADR-0009), when it does not know where the text is.

A caller that asks about a whole screen without small text, such as its layout or the open app, sends the whole image. A `max_tokens` limit keeps an invented answer from filling the context window.
