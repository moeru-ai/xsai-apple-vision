---
status: accepted
---

# Leave text-to-speech to xsai-apple-speech

This repository does not provide text-to-speech. On-device speech with `AVSpeechSynthesizer` belongs in xsai-apple-speech, as new packages beside its transcription packages.

xsai-apple-speech already owns Apple speech: its name, its native build, and its release flow cover speech. A second place for speech splits one capability across two repositories, and a host registers two plugins for it.

Each repository keeps one capability. This repository keeps image understanding.
