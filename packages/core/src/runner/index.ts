import { MastraBase } from '../base';

export type RunnerSessionStatus = 'pending' | 'preparing' | 'running' | 'stopped' | 'error';

export interface RunnerSession {
  id: string;
  url?: string;
  port?: number;
  status: RunnerSessionStatus;
  startedAt?: Date;
}

export interface RunnerStartOptions {
  outputDirectory: string;
  envVars?: Record<string, string>;
  port?: number;
  startCommand?: string;
  timeout?: number;
}

export interface RunnerExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface IRunner {
  prepare(options: RunnerStartOptions): Promise<RunnerSession>;
  start(options: RunnerStartOptions): Promise<RunnerSession>;
  stop(sessionId: string): Promise<void>;
  getStatus(sessionId: string): Promise<RunnerSession | null>;
  exec(sessionId: string, command: string, options?: { timeout?: number }): Promise<RunnerExecResult>;
  getLogs(sessionId: string, options?: { tail?: number }): Promise<string>;
}

export abstract class MastraRunner extends MastraBase implements IRunner {
  constructor({ name }: { name: string }) {
    super({ component: 'RUNNER', name });
  }

  abstract prepare(options: RunnerStartOptions): Promise<RunnerSession>;
  abstract start(options: RunnerStartOptions): Promise<RunnerSession>;
  abstract stop(sessionId: string): Promise<void>;
  abstract getStatus(sessionId: string): Promise<RunnerSession | null>;
  abstract exec(sessionId: string, command: string, options?: { timeout?: number }): Promise<RunnerExecResult>;
  abstract getLogs(sessionId: string, options?: { tail?: number }): Promise<string>;
}
