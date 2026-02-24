# Sandbox Runner vs Knative: Architecture Comparison

## Overview

| | Sandbox Runner (Daytona/E2B) | Knative |
|---|---|---|
| **Model** | Ephemeral VM/container per session | Kubernetes-native serverless pods |
| **Scaling unit** | Whole sandbox (OS + runtime + app) | Pod (container with app only) |
| **Orchestrator** | Vendor SDK (Daytona API) | Kubernetes + Knative Serving |
| **Networking** | Vendor proxy URL per sandbox | Kubernetes Service + Ingress/Istio |

---

## Cold Start

### Sandbox Runner

Each session is a full cold start:

1. Provision sandbox VM/container (~5-15s depending on provider)
2. Upload tarball of bundled application
3. Extract bundle
4. `npm install --omit=dev` (30-120s depending on dependency tree)
5. Start server process
6. Poll health endpoint (up to 60s)

**Total cold start: ~1-3 minutes.** No warm pool, no caching between sessions. Every `prepare()` call repeats the full cycle.

### Knative

1. Schedule pod on existing node (~1-5s)
2. Pull container image (cached on node after first pull)
3. Start container process (~1-5s)

**Total cold start: ~2-10s** (after first image pull). Knative supports:

- **Scale-to-zero with warm-up**: configurable `minScale` to keep warm pods
- **Container image caching**: images cached on nodes, subsequent starts are near-instant
- **Concurrency-based autoscaling**: new pods created based on in-flight request count, not per-session

**Verdict**: Knative is dramatically faster for cold starts. The sandbox approach pays the full npm install cost on every session because there's no shared image layer.

---

## Resource Efficiency

### Sandbox Runner

- Each session gets a dedicated sandbox regardless of utilization
- No sharing of compute between sessions
- Idle sandboxes consume full resource allocation
- No autoscaling — sessions are manually created and destroyed
- Dependencies installed per-sandbox (disk + bandwidth cost repeated)

### Knative

- Pods share underlying Kubernetes nodes
- Scale-to-zero eliminates idle resource cost
- Autoscaler matches pod count to actual load
- Container images are shared layers — dependencies baked into the image once
- Kubernetes resource quotas and limits provide fine-grained control

**Verdict**: Knative is significantly more resource-efficient at scale. Sandbox runner trades efficiency for simplicity.

---

## Isolation

### Sandbox Runner

- **Strong isolation**: each sandbox is a full VM or heavyweight container
- Process, filesystem, and network are completely isolated
- Users can run arbitrary code (`exec()`) safely
- No risk of noisy-neighbor effects on CPU/memory
- Suitable for untrusted code execution

### Knative

- **Container-level isolation**: Linux namespaces and cgroups
- Weaker than VM isolation — shared kernel with other pods
- Noisy-neighbor risk on shared nodes (mitigated by resource limits)
- Not ideal for running arbitrary untrusted user code without additional sandboxing (gVisor, Kata Containers)

**Verdict**: Sandbox runner provides stronger isolation out of the box. This matters when running user-provided code. Knative can match it with gVisor/Kata, but that adds complexity and latency.

---

## Developer Experience

### Sandbox Runner

- Simple lifecycle: `prepare()` → `start()` → `exec()` → `stop()`
- Upload a tarball, get a URL — no container registry, no Dockerfiles
- `exec()` gives shell access for debugging
- `getLogs()` for log retrieval
- Preview URLs work immediately (vendor-provided proxy)
- No infrastructure to manage — fully managed by provider

### Knative

- Requires container image build pipeline (Dockerfile, CI/CD, registry)
- Requires Kubernetes cluster (managed or self-hosted)
- Requires Knative installation and configuration
- Networking requires Istio or Kourier gateway
- Debugging requires `kubectl exec` / log aggregation
- More moving parts, steeper learning curve

**Verdict**: Sandbox runner is dramatically simpler to operate. Knative requires significant infrastructure investment.

---

## Scaling Characteristics

### Sandbox Runner

| Aspect | Behavior |
|---|---|
| Scale up | Create new sandbox (1-3 min cold start) |
| Scale down | Manually call `stop()` |
| Scale to zero | Must explicitly destroy sandbox |
| Concurrent sessions | Limited by provider quotas |
| Cost model | Pay per sandbox-minute (always-on while running) |

No built-in autoscaling. The application code must manage session lifecycle.

### Knative

| Aspect | Behavior |
|---|---|
| Scale up | New pod in 2-10s (with image cache) |
| Scale down | Automatic based on request concurrency |
| Scale to zero | Built-in (configurable grace period) |
| Concurrent requests | Configurable per-pod concurrency target |
| Cost model | Pay for actual compute (zero cost at zero traffic) |

Automatic scaling based on request volume with configurable concurrency targets.

**Verdict**: Knative scales better in every dimension. The sandbox model doesn't scale — each session is a fixed-cost resource.

---

## Reliability & State

### Sandbox Runner

- Sessions are ephemeral — sandbox failure = session lost
- No built-in health recovery or restart logic
- Server process errors set `status: 'error'` but no auto-recovery
- No persistent state between sessions
- Provider-dependent availability SLA

### Knative

- Kubernetes handles pod restarts and rescheduling automatically
- Health checks (liveness/readiness probes) trigger automatic recovery
- Rolling updates with zero-downtime deployments
- Revision-based traffic splitting for canary/blue-green deploys
- Kubernetes HA with multi-node clusters

**Verdict**: Knative provides production-grade reliability out of the box. Sandbox runner has no self-healing.

---

## Cost at Scale

### Sandbox Runner

```
10 concurrent sessions × $0.10/hr each = $1.00/hr
Even if 8 of 10 are idle — still $1.00/hr
npm install bandwidth repeated per session
```

Cost is linear with session count regardless of utilization.

### Knative

```
Scale-to-zero during idle periods = $0/hr
Burst to 10 pods under load = ~$0.30/hr (shared node resources)
Container images cached — minimal bandwidth
```

Cost tracks actual usage, not provisioned capacity.

**Verdict**: Knative is cheaper at scale. Sandbox runner is cheaper for low-volume, occasional use (no infrastructure overhead).

---

## When to Use Each

### Sandbox Runner is better when:

- Running **untrusted user code** that needs strong VM-level isolation
- Building **dev/preview environments** where each user gets a full sandbox
- Prototyping — **no infrastructure setup** required
- Session count is low (< 10 concurrent) and cold start latency is acceptable
- You need `exec()` — **interactive shell access** to the running environment

### Knative is better when:

- Running a **production service** that needs autoscaling and reliability
- **Cost efficiency** matters — scale-to-zero eliminates idle cost
- **Low latency** startup is required (seconds, not minutes)
- You have existing **Kubernetes infrastructure**
- You need **traffic management** (canary deploys, revision routing)
- **High concurrency** — hundreds or thousands of concurrent requests

---

## Hybrid Approach

These aren't mutually exclusive. A practical architecture could use:

- **Knative** for the main Mastra API server (production traffic, autoscaling, low latency)
- **Sandbox runner** for on-demand preview/dev environments (isolation, exec access, ephemeral)

The Mastra runner interface (`IRunner`) abstracts the execution environment, so a Knative runner implementation could coexist alongside the Daytona runner with the same lifecycle API.
