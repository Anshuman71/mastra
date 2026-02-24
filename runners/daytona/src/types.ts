export interface DaytonaRunnerOptions {
  apiKey?: string;
  serverUrl?: string;
  target?: string;
  image?: string;
  public?: boolean;
  defaultPort?: number;
  defaultStartCommand?: string;
  defaultTimeout?: number;
  /** Comma-separated list of allowed CIDR network addresses for outbound sandbox traffic */
  networkAllowList?: string;
}
