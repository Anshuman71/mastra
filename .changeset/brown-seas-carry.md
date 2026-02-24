---
'@mastra/core': minor
---

Sandbox tool results sent to the model now omit ANSI color codes while streamed output keeps colors. This reduces token usage and improves model readability.

Commands ending with `| tail -N` now stream output live and still return only the last N lines in the final result, preventing long commands from blocking streaming.

```ts
// Before:
await execute_command({ command: "npm test | tail -20" });
// Output does not stream until the command finishes.

// After:
await execute_command({ command: "npm test | tail -20" });
// Output streams live; final result is the last 20 lines.
```
