---
'@mastra/core': minor
---

**Supervisor Pattern for Multi-Agent Coordination**

Add supervisor pattern for coordinating multiple agents through delegation using the existing `stream()` and `generate()` methods. A supervisor agent can delegate tasks to sub-agents, workflows, and tools with fine-grained control over execution flow, context sharing, and validation.

**Key Features:**

- **Delegation Hooks**: Control sub-agent execution with `onDelegationStart` and `onDelegationComplete` callbacks
- **Iteration Monitoring**: Track progress with `onIterationComplete` hook and provide feedback to guide the agent
- **Completion Scoring**: Automatically validate task completion with configurable scorers
- **Memory Isolation**: Sub-agents receive full conversation context but only save their delegation to memory
- **Tool Approval Propagation**: Tool approvals bubble up through the delegation chain to the supervisor level
- **Context Filtering**: Control what messages are shared with sub-agents via `contextFilter` callback
- **Bail Mechanism**: Stop execution early from `onDelegationComplete` using `context.bail()`
- **Feedback Saving**: Return `{ feedback }` from `onDelegationComplete` to save guidance to supervisor memory
- **ThreadId/ResourceId Forwarding**: Sub-agents automatically receive the supervisor's threadId and resourceId
