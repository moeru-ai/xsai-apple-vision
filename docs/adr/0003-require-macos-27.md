---
status: accepted
---

# Require macOS 27

The first release supports macOS 27 and later. Image input to the on-device Foundation Model starts in macOS 27.

The build requires a macOS 27 SDK. The Command Line Tools provide it, so Xcode is not required. The release workflow builds the arm64 addon with this SDK. See ADR-0015.

The first release does not fall back to a Vision-only pipeline on macOS 26, such as text recognition without the model. A fallback returns a different kind of result, and the caller cannot tell the two apart.

The operating-system version alone does not guarantee availability. The Provider also reports the Foundation Models availability. See ADR-0004.
