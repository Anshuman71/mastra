import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { config } from 'dotenv';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { DaytonaRunner } from './index';

// Load .env from package root
config();

const DAYTONA_API_KEY = process.env.DAYTONA_API_KEY;

describe.skipIf(!DAYTONA_API_KEY)('DaytonaRunner integration', () => {
  let runner: DaytonaRunner;
  let outputDir: string;
  let sessionId: string | undefined;

  beforeAll(() => {
    runner = new DaytonaRunner({
      apiKey: DAYTONA_API_KEY,
      defaultPort: 3000,
    });

    // Create a minimal Node.js app to deploy
    outputDir = join(tmpdir(), `mastra-runner-test-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    writeFileSync(
      join(outputDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        version: '1.0.0',
        scripts: { start: 'node server.js' },
      }),
    );

    writeFileSync(
      join(outputDir, 'server.js'),
      `
const http = require('http');
const port = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok' }));
});
server.listen(port, () => console.log('Listening on ' + port));
`.trim(),
    );
  });

  afterAll(async () => {
    // Tear down sandbox if still running
    if (sessionId) {
      try {
        await runner.stop(sessionId);
      } catch {
        // already stopped
      }
    }

    // Clean up temp dir
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('prepare → start → exec → getLogs → stop', async () => {
    // Prepare: creates sandbox, uploads bundle, installs deps
    const prepared = await runner.prepare({
      outputDirectory: outputDir,
      port: 3000,
    });

    expect(prepared.id).toBeTruthy();
    expect(prepared.status).toBe('pending');
    expect(prepared.port).toBe(3000);
    sessionId = prepared.id;

    // Start: runs the server, gets public URL
    const started = await runner.start({
      outputDirectory: outputDir,
      port: 3000,
      startCommand: 'npm start',
      timeout: 30,
    });

    expect(started.status).toBe('running');
    expect(started.url).toBeTruthy();
    expect(started.startedAt).toBeInstanceOf(Date);
    console.log(`Server running at: ${started.url}`);

    // Exec: run a command inside the sandbox
    const execResult = await runner.exec(sessionId, 'echo hello-from-sandbox');
    expect(execResult.exitCode).toBe(0);
    expect(execResult.stdout).toContain('hello-from-sandbox');

    // GetStatus: should still be running
    const status = await runner.getStatus(sessionId);
    expect(status).not.toBeNull();
    expect(status!.status).toBe('running');

    // GetLogs: fetch recent logs
    const logs = await runner.getLogs(sessionId, { tail: 50 });
    expect(typeof logs).toBe('string');

    // Stop: tear down the sandbox
    await runner.stop(sessionId);
    sessionId = undefined;

    // After stop, getStatus should return null
    const gone = await runner.getStatus(prepared.id);
    expect(gone).toBeNull();
  }, 120_000); // 2 min timeout for the full lifecycle
});
