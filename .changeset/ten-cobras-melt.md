---
'@mastra/memory': patch
'@mastra/mongodb': patch
'@mastra/core': patch
'@mastra/libsql': patch
'@mastra/pg': patch
'mastracode': patch
---

Fixed two bugs in observational memory buffered activation:

1. **Minimum retention floor under forceMaxActivation**: When `forceMaxActivation` is enabled (above `blockAfter` threshold), the system now enforces `minRemaining = Math.min(1000, retentionFloor)` tokens to prevent catastrophic context loss. Previously, `forceMaxActivation` unconditionally bypassed all safeguards, allowing context to drop to ~300 tokens even when the user configured `bufferActivation=4000`.

2. **Mid-step activation deferral**: Fixed `shouldTriggerAsyncObservation` to receive `totalPendingTokens` (total context tokens) instead of `unbufferedPendingTokens` for correct interval boundary comparison. The interval tracking compares current total tokens against `lastBufferedBoundary` (also set to total tokens), so passing unbuffered tokens broke the comparison and prevented mid-step activation when buffered chunks existed.

3. **blockAfter parsing**: `blockAfter` values under 100 are now treated as multipliers of the threshold (e.g., 1.2 = 1.2x), while values >= 100 are treated as absolute token counts.

4. **mastracode defaults**: Updated default OM settings in mastracode to use `bufferTokens: 1/5`, `bufferActivation: 2000`, and `blockAfter: 2` (multiplier).

5. **Under-boundary minimum retention safeguard**: When the best under-boundary chunk selection would leave fewer than `minRemaining` tokens, activation now avoids that path and falls back to safer boundaries. This prevents under-boundary selection from collapsing context below the minimum retention floor.

6. **Skip incomplete activation when projected remaining is too high**: Activation now checks if the projected remaining tokens after chunk activation would still be far above the retention floor target (`projectedRemaining > retentionFloor + bufferTokens`). If activation cannot get close enough to the target and `blockAfter` hasn't been reached, the activation is skipped (returns `success: false`), allowing fallback to sync observation for additional compression instead of accepting incomplete buffered activation.
