---
'@mastra/pg': patch
---

Added atomic `updateWorkflowResults` and `updateWorkflowState` using row-level locking (`SELECT ... FOR UPDATE`) within transactions to safely merge concurrent step results into workflow snapshots.
