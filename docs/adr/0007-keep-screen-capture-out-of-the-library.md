---
status: accepted
---

# Keep screen capture out of the library

The library does not capture the screen. The caller passes images.

A host such as AIRI already captures the screen, and it owns the permission prompt, the choice of display, and the capture rate. A second capture path in the library asks for the same permission from another place.

The library therefore does not link ScreenCaptureKit, and it needs no screen-recording entitlement.
