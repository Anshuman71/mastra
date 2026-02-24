---
'@mastra/mongodb': patch
---

Added atomic `updateWorkflowResults` and `updateWorkflowState` using MongoDB's `findOneAndUpdate` with aggregation pipelines (`$mergeObjects`) for atomic read-modify-write operations on workflow snapshots.
