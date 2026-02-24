---
'@mastra/cloudflare': patch
'@mastra/cloudflare-d1': patch
'@mastra/clickhouse': patch
'@mastra/convex': patch
'@mastra/lance': patch
---

`updateWorkflowResults` and `updateWorkflowState` now throw a not-implemented error. These storage backends do not support atomic read-modify-write operations needed for concurrent workflow updates. Use `supportsConcurrentUpdates()` to check compatibility before calling these methods.
