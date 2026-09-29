---
status: accepted
---

# Report usage only from the SDK

A response contains `usage` only when the macOS SDK reports token counts. Otherwise the response has no `usage` field.

The counts come from the `usage` of the last stream snapshot. A response without any snapshot has no `usage` field.

The Provider does not estimate the counts. An estimate for an image is especially wrong, and a host that plans the context window from an estimate plans it wrong.

The Provider does not return zeros. A zero count says that the request used no tokens, which is false.

The on-device model has no per-token cost, so a missing `usage` does not affect billing.
