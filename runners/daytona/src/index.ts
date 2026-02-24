import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Daytona } from '@daytonaio/sdk';
import type { DaytonaConfig, Sandbox } from '@daytonaio/sdk';
import { MastraRunner } from '@mastra/core/runner';
import type { RunnerExecResult, RunnerSession, RunnerStartOptions } from '@mastra/core/runner';

import type { DaytonaRunnerOptions } from './types';

export class DaytonaRunner extends MastraRunner {
  #client: Daytona | null = null;
  #options: DaytonaRunnerOptions;
  #sessions = new Map<string, { session: RunnerSession; sandbox: Sandbox }>();

  constructor(options: DaytonaRunnerOptions = {}) {
    super({ name: 'daytona' });
    this.#options = options;
  }

  #getClient(): Daytona {
    if (!this.#client) {
      const apiKey = this.#options.apiKey ?? process.env.DAYTONA_API_KEY;
      const apiUrl = this.#options.serverUrl ?? process.env.DAYTONA_SERVER_URL;
      const target = this.#options.target ?? process.env.DAYTONA_TARGET;

      const config: DaytonaConfig = { apiKey, apiUrl };
      if (target) {
        config.target = target as DaytonaConfig['target'];
      }

      this.#client = new Daytona(config);
    }
    return this.#client;
  }

  /**
   * Execute a command in a Daytona sandbox using a session for reliable shell behavior.
   * Sessions provide a proper shell environment where pipes, redirects, and chained
   * commands work correctly (unlike executeCommand which can return -1 for some operations).
   */
  async #execInSession(sandbox: Sandbox, command: string, timeout = 60): Promise<{ output: string; exitCode: number }> {
    const sessionId = `mastra-${Date.now()}`;
    await sandbox.process.createSession(sessionId);
    try {
      const result = await sandbox.process.executeSessionCommand(sessionId, { command }, timeout);
      return { output: result.output ?? '', exitCode: result.exitCode ?? 0 };
    } finally {
      await sandbox.process.deleteSession(sessionId).catch(() => {});
    }
  }

  async prepare(options: RunnerStartOptions): Promise<RunnerSession> {
    const client = this.#getClient();
    const port = options.port ?? this.#options.defaultPort ?? 3000;

    this.logger.info(`Creating Daytona sandbox...`);

    const createParams = {
      ...(this.#options.image ? { image: this.#options.image } : {}),
      public: this.#options.public,
      envVars: options.envVars,
      networkAllowList: this.#options.networkAllowList,
    };
    const sandbox = await client.create(createParams);

    const session: RunnerSession = {
      id: sandbox.id,
      port,
      status: 'preparing',
    };

    this.#sessions.set(sandbox.id, { session, sandbox });

    const rootDir = (await sandbox.getUserHomeDir()) ?? '/home/daytona';
    const remoteTarPath = `${rootDir}/bundle.tar.gz`;

    this.logger.info(`Uploading bundle to sandbox ${sandbox.id}...`);

    // Create a tarball of the output directory locally, excluding node_modules
    // (dependencies will be installed inside the sandbox via npm install)
    const tarPath = join(tmpdir(), `mastra-bundle-${sandbox.id}.tar.gz`);
    execSync(`tar -czf ${tarPath} --exclude='node_modules' -C ${options.outputDirectory} .`);

    await sandbox.fs.uploadFile(tarPath, remoteTarPath);

    // Clean up local temp file
    execSync(`rm -f ${tarPath}`);

    this.logger.info(`Extracting bundle...`);
    const extract = await this.#execInSession(sandbox, `cd ${rootDir} && tar -xzf bundle.tar.gz && rm bundle.tar.gz`);
    if (extract.exitCode !== 0) {
      throw new Error(`Bundle extraction failed (exit ${extract.exitCode}): ${extract.output}`);
    }

    this.logger.info(`Installing dependencies...`);
    await this.#execInSession(sandbox, `cd ${rootDir} && npm install --omit=dev`, 120);

    session.status = 'pending';
    this.logger.info(`Sandbox ${sandbox.id} prepared`);

    return { ...session };
  }

  async start(options: RunnerStartOptions): Promise<RunnerSession> {
    const port = options.port ?? this.#options.defaultPort ?? 3000;
    const startCommand = options.startCommand ?? this.#options.defaultStartCommand ?? 'npm start';
    const timeout = options.timeout ?? this.#options.defaultTimeout ?? 60;

    let entry = [...this.#sessions.values()].find(e => e.session.status === 'pending' && e.session.port === port);

    if (!entry) {
      await this.prepare(options);
      entry = [...this.#sessions.values()].find(e => e.session.status === 'pending' && e.session.port === port);
    }

    if (!entry) {
      throw new Error('Failed to find a prepared session');
    }

    const { session, sandbox } = entry;

    this.logger.info(`Starting server in sandbox ${session.id}...`);

    const rootDir = (await sandbox.getUserHomeDir()) ?? '/home/daytona';

    // Get the preview URL before starting the server so we can inject host/port/protocol
    // as env vars for Studio to construct API URLs correctly
    const previewLink = await sandbox.getPreviewLink(port);
    session.url = previewLink.url;
    const previewUrl = new URL(previewLink.url);

    // Start the server as a background process using a persistent session
    const serverSessionId = `mastra-server-${session.id}`;
    await sandbox.process.createSession(serverSessionId);
    sandbox.process
      .executeSessionCommand(
        serverSessionId,
        {
          command: `cd ${rootDir} && PORT=${port} MASTRA_SERVER_HOST=${previewUrl.hostname} MASTRA_SERVER_PORT=${previewUrl.port || (previewUrl.protocol === 'https:' ? '443' : '80')} MASTRA_SERVER_PROTOCOL=${previewUrl.protocol.replace(':', '')} ${startCommand} 2>&1 | tee /tmp/server.log`,
        },
        0,
      )
      .catch(err => {
        this.logger.error(`Server process in sandbox ${session.id} exited: ${err}`);
        session.status = 'error';
      });

    // Wait for the server to be reachable
    const startTime = Date.now();
    const timeoutMs = timeout * 1000;
    let ready = false;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const check = await this.#execInSession(sandbox, `curl -sf http://localhost:${port}/ -o /dev/null`, 5);
        if (check.exitCode === 0) {
          ready = true;
          break;
        }
      } catch {
        // Server not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!ready) {
      this.logger.warn(`Server readiness check timed out after ${timeout}s — proceeding anyway`);
    }

    session.status = 'running';
    session.startedAt = new Date();

    this.logger.info(`Sandbox ${session.id} running at ${session.url}`);

    return { ...session };
  }

  async stop(sessionId: string): Promise<void> {
    const entry = this.#sessions.get(sessionId);
    if (!entry) {
      throw new Error(`Session ${sessionId} not found`);
    }

    this.logger.info(`Stopping sandbox ${sessionId}...`);

    await entry.sandbox.delete();
    entry.session.status = 'stopped';
    this.#sessions.delete(sessionId);

    this.logger.info(`Sandbox ${sessionId} stopped and deleted`);
  }

  async getStatus(sessionId: string): Promise<RunnerSession | null> {
    const entry = this.#sessions.get(sessionId);
    if (!entry) {
      return null;
    }
    return { ...entry.session };
  }

  async exec(sessionId: string, command: string, options?: { timeout?: number }): Promise<RunnerExecResult> {
    const entry = this.#sessions.get(sessionId);
    if (!entry) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const result = await this.#execInSession(entry.sandbox, command, options?.timeout ?? 60);

    return {
      exitCode: result.exitCode,
      stdout: result.output,
      stderr: '',
    };
  }

  async getLogs(sessionId: string, options?: { tail?: number }): Promise<string> {
    const entry = this.#sessions.get(sessionId);
    if (!entry) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const lines = options?.tail ?? 100;
    const result = await this.#execInSession(entry.sandbox, `tail -n ${lines} /tmp/server.log 2>/dev/null || echo ""`);

    return result.output;
  }
}

export type { DaytonaRunnerOptions } from './types';
