---
'@mastra/dynamodb': patch
---

Added atomic `updateWorkflowResults` and `updateWorkflowState` using optimistic locking with conditional writes and automatic retries (compare-and-swap on `updatedAt`) to safely merge concurrent step results into workflow snapshots.
