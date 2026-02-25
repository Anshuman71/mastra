---
'@mastra/memory': patch
'@mastra/mongodb': patch
'@mastra/core': patch
'@mastra/libsql': patch
'@mastra/pg': patch
---

Fixed two bugs in observational memory buffered activation:

1. **Minimum retention floor under forceMaxActivation**: When `forceMaxActivation` is enabled (above `blockAfter` threshold), the system now enforces `minRemaining = Math.min(1000, retentionFloor)` tokens to prevent catastrophic context loss. Previously, `forceMaxActivation` unconditionally bypassed all safeguards, allowing context to drop to ~300 tokens even when the user configured `bufferActivation=4000`.

2. **Mid-step activation deferral**: Fixed `shouldTriggerAsyncObservation` to receive `totalPendingTokens` (total context tokens) instead of `unbufferedPendingTokens` for correct interval boundary comparison. The interval tracking compares current total tokens against `lastBufferedBoundary` (also set to total tokens), so passing unbuffered tokens broke the comparison and prevented mid-step activation when buffered chunks existed.
