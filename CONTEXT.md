# Apple Vision

This context defines the language for on-device image understanding with Apple Foundation Models and its adapters.

## Language

**Apple Vision Provider**:
An xsAI-compatible chat provider backed by the on-device Apple Foundation Model. It accepts text and images, and returns text or structured output. Native and Electron packages provide different implementations of the same interface.
_Avoid_: Runtime, Transport, Client, Helper

**Image Attachment**:
One image in a request. The caller passes it as an OpenAI `image_url` content part with a data URL. The native package converts it to a Foundation Models attachment.
_Avoid_: Screenshot, Frame, Picture

**Visual Context**:
The structured description of an image that the model returns when the request carries a JSON Schema. It is the result that a host application gives to its own conversation or agent.
_Avoid_: Caption, Summary, Scene

**Availability**:
Whether the on-device model can answer now, with a structured reason when it cannot. The reason separates a device that is not eligible, Apple Intelligence that is turned off, and a model that is not ready yet.
_Avoid_: Support, Capability check

**Vision Session**:
One isolated request from its creation until its response completes, fails, or is cancelled. Each session owns its own Foundation Models session.
_Avoid_: Conversation, Chat, Stream
