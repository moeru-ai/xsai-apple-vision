---
status: accepted
---

# Accept images as data URLs

An Image Attachment is an `image_url` content part whose URL is a `data:` URL with base64 content. The first release accepts PNG, JPEG, HEIC, and WebP.

The TypeScript Provider decodes the base64 content and passes the bytes to the Swift module. The Swift module creates the image with Image I/O and attaches it to the prompt.

An image that Image I/O cannot decode fails with a 400 response. The error code is `invalid_image`, and the message gives the number of the image in the request.

The Provider rejects an `http:` or `https:` URL with a 400 response. It does not download images. A download adds network access, timeouts, and privacy questions to a library whose value is that it runs offline.

The Provider does not resize images. Foundation Models accepts any size and aspect ratio, and a larger image uses more tokens. The caller decides the trade-off between detail and latency.
