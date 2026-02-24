---
'@mastra/core': patch
---

Fixed Gemini API errors that occurred when a conversation included empty reasoning parts (redacted thinking) in its history.

**What changed:** Empty reasoning parts with no data or Google-only context are now filtered out before being sent to the LLM, preventing the "must include at least one parts field" error that would break entire conversation threads. Reasoning data is preserved in the database so no history is lost.

**Provider compatibility:** Reasoning data required by other providers (Anthropic extended thinking, OpenAI reasoning items) is still sent as-is — only empty Google reasoning that would have been rejected is removed. Fixes #12980.
