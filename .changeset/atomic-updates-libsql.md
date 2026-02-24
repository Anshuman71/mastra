---
'@mastra/libsql': patch
---

Added atomic `updateWorkflowResults` and `updateWorkflowState` using write transactions with automatic retries to safely merge concurrent step results into workflow snapshots.
