---
'@mastra/mssql': patch
---

Added atomic `updateWorkflowResults` and `updateWorkflowState` using transactions with `UPDLOCK, HOLDLOCK` hints and `MERGE` statements to safely merge concurrent step results into workflow snapshots.
