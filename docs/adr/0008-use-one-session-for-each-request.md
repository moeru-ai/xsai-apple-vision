---
status: accepted
---

# Use one session for each request

Each request creates a new Foundation Models session and discards it when the response ends. The Provider keeps no conversation state between requests.

A chat-completions request already carries the whole conversation, so a per-request session keeps the same semantics as any other chat provider. It also isolates concurrent requests.

An aborted `fetch` cancels its session. The Provider does not reuse a session after a cancellation or a failure.

## Cancellation

The `fetch` passes its `signal` to the Provider. The native Provider cancels the Swift task of the session, and the Electron Provider passes the abort to the main process through Eventa. The request then rejects with the abort reason.

On macOS 27.2, a cancelled stream ends without an error. So the Swift module checks for cancellation after the stream ends. Otherwise, a cancelled answer returns its partial text as a normal answer.

## Mapping

The Provider builds a `Transcript` from the messages and creates the session with it:

1. All `system` messages, in order, join with a blank line into one instructions entry. The entry comes first in the transcript, wherever the `system` messages are in the request.
2. Each `user` and `assistant` message before the last message becomes one entry, in the order of the request. A `user` message becomes a prompt entry. An `assistant` message becomes a response entry.
3. The text parts of a message join with a newline into one text segment. Each `image_url` part of a `user` message becomes one attachment segment after the text.
4. The last message must be a `user` message. It is not in the transcript. The session answers it as the prompt, with its text and then its images.

This request:

```json
[
  { "role": "system", "content": "Be brief." },
  {
    "role": "user",
    "content": [
      { "type": "text", "text": "What is this?" },
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,A" } }
    ]
  },
  { "role": "assistant", "content": "A menu." },
  { "role": "system", "content": "Answer in English." },
  { "role": "user", "content": "Which item is selected?" }
]
```

creates this session:

```text
Transcript
  instructions  [text "Be brief.\n\nAnswer in English."]
  prompt        [text "What is this?", attachment image A]
  response      [text "A menu."]
Prompt
  text "Which item is selected?"
```

The model sees image A through the transcript, so the last question can refer to it without sending it again.

## Rejected requests

The Provider answers these requests with a 400 response, because the transcript cannot express them:

- The last message is not a `user` message.
- A message has another role, such as `tool`.
- An `assistant` message contains an image, or has no content, such as a tool call.
