---
'@mastra/core': patch
---

Added optional `targetVersionId` field to `ExperimentConfig` for pinning experiments to a specific agent version. Resolves versioned agents via the editor with fallback to registry lookup.
