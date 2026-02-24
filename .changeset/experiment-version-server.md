---
'@mastra/server': patch
---

Added `targetVersionId` to the trigger experiment Zod schema and handler, forwarding it to core's `startExperimentAsync`.
