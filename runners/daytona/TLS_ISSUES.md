# Daytona Sandbox TLS Issues

## Problem

Node.js v25.4.0 (the default in Daytona's sandbox image) has a broken TLS stack that causes `ECONNRESET` on all outbound HTTPS connections. This affects:

- `fetch()` (undici)
- `node:https` module
- Raw `tls.connect()`

`curl` works fine from the same sandbox, confirming it's a Node-level issue, not a network/firewall problem.

## Symptoms

```
TypeError: fetch failed
  [cause]: Error: read ECONNRESET
      at TLSWrap.onStreamRead (node:internal/stream_base_commons:216:20) {
    errno: -104,
    code: 'ECONNRESET',
    syscall: 'read'
  }
```

This consistently breaks the `CloudExporter` in `@mastra/observability` — spans are batched but every upload to `https://api.mastra.ai/ai/spans/publish` fails and gets dropped.

## Diagnosis Steps

From inside the sandbox terminal:

```bash
# Confirm curl works
curl -v -X POST https://api.mastra.ai/ai/spans/publish \
  -H "Authorization: Bearer $MASTRA_CLOUD_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"spans":[]}'
# Expected: 200 {"ok":true,"data":{"spanCount":0}}

# Confirm Node TLS is broken
node -e "const tls = require('tls'); const s = tls.connect(443, 'api.mastra.ai', {}, () => { console.log('connected', s.getProtocol()); s.end(); }); s.on('error', e => console.error('TLS error:', e.message));"
# Expected failure: TLS error: read ECONNRESET

# Check Node version
node -v
# v25.4.0 — this is the problematic version
```

## Scope

This is a **blanket failure** — ALL outbound HTTPS from Node fails, not just specific hosts:

```bash
node -e "fetch('https://httpbin.org/get').then(() => console.log('OK')).catch(e => console.error('FAIL', e.cause?.message))"
# FAIL read ECONNRESET

node -e "fetch('https://google.com').then(() => console.log('OK')).catch(e => console.error('FAIL', e.cause?.message))"
# FAIL read ECONNRESET
```

No proxy is configured (`env | grep -i proxy` returns nothing). This is not a whitelisting or firewall issue.

## Curl TLS Details (working)

```
SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384 / x25519 / RSASSA-PSS
```

Curl uses the system's OpenSSL, which works. Node v25.4.0 uses its own bundled OpenSSL, which does not. The mismatch is likely between Node's compiled OpenSSL version and the sandbox kernel/libraries.

## Workarounds

### Option 1: Custom Daytona Snapshot with Node 22 (recommended)

Add a Node 22 LTS snapshot through the Daytona Dashboard, then reference it:

```typescript
const runner = new DaytonaRunner({
  apiKey: process.env.DAYTONA_API_KEY,
  public: true,
  image: 'your-node22-snapshot-name',
});
```

Daytona uses "snapshots" not raw Docker images — `node:22` won't work directly.

### Option 2: nvm Inside the Sandbox

Prepend nvm commands to the start command to downgrade Node at runtime:

```typescript
const startCommand = 'nvm install 22 && nvm use 22 && npm start';
```

Adds ~10-20s to cold start. May not work if nvm isn't installed in the base image.

### Option 3: Shell Out to Curl for Uploads

Modify `CloudExporter.batchUpload()` in `@mastra/observability` to detect the TLS failure and fall back to spawning `curl` as a child process. This is hacky but would work in any environment where curl is available.

### Option 4: Wait for Daytona to Update Their Base Image

If Daytona updates their default image to a Node version with a working TLS stack, the issue resolves itself. Not actionable on our side.

## Affected Components

- `@mastra/observability` — `CloudExporter` uses `fetchWithRetry()` which calls `fetch()`
- `@mastra/core` — `fetchWithRetry()` in `packages/core/src/utils/fetchWithRetry.ts`
- Any code in the sandbox that makes outbound HTTPS requests from Node

## Not Affected

- Inbound requests to the sandbox (the Daytona proxy handles TLS termination)
- `curl` commands executed via `runner.exec()`
- The Mastra API server itself (it listens on HTTP localhost, proxied by Daytona)

## Date Discovered

2026-02-24
