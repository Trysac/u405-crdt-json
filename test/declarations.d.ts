declare module "@trysac/mcp-server-template" {
  export interface ToolDefinition {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<{
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    }>;
    timeoutMs?: number;
    maxOutputChars?: number;
  }

  export interface McpServer {
    name: string;
    version: string;
    tools: ToolDefinition[];
  }

  export function defineTool(def: ToolDefinition): ToolDefinition;

  export function createServer(opts: {
    name: string;
    version: string;
    tools: ToolDefinition[];
    clock?: () => number;
    logger?: unknown;
  }): McpServer;
}

declare module "@trysac/retry-policies" {
  export type Backoff = (attempt: number) => number;

  export interface RetryPolicy {
    maxAttempts?: number;
    backoff?: Backoff;
    maxElapsedMs?: number;
    signal?: AbortSignal;
  }

  export function constantBackoff(ms: number): Backoff;
  export function exponentialBackoff(opts: { baseMs: number; factor: number }): Backoff;
  export function capped(b: Backoff, maxMs: number): Backoff;
  export function fullJitter(b: Backoff): Backoff;
  export function decorrelatedJitter(opts: { baseMs: number; maxMs: number }): Backoff;

  export function retry<T>(
    fn: (attempt: number, signal?: AbortSignal) => Promise<T>,
    policy: RetryPolicy,
  ): Promise<T>;
}

declare module "fast-check" {
  export interface Arbitrary<T> {
    filter(predicate: (value: T) => boolean): Arbitrary<T>;
    map<U>(fn: (value: T) => U): Arbitrary<U>;
  }

  export interface Property<Ts extends unknown[]> {
    beforeEach?(hook: () => void): Property<Ts>;
    afterEach?(hook: () => void): Property<Ts>;
  }

  export interface AssertOptions {
    numRuns?: number;
    seed?: number;
    timeout?: number;
  }

  export function integer(opts?: { min?: number; max?: number }): Arbitrary<number>;
  export function array<T>(
    arb: Arbitrary<T>,
    opts?: { minLength?: number; maxLength?: number },
  ): Arbitrary<T[]>;
  export function record<T extends Record<string, Arbitrary<unknown>>>(
    recordModel: T,
  ): Arbitrary<{ [K in keyof T]: T[K] extends Arbitrary<infer U> ? U : never }>;
  export function constantFrom<T>(...values: T[]): Arbitrary<T>;

  export function property<Ts extends unknown[]>(
    ...args: [...{ [K in keyof Ts]: Arbitrary<Ts[K]> }, (...args: Ts) => boolean | undefined]
  ): Property<Ts>;

  export function assert(property: Property<unknown[]>, options?: AssertOptions): void;

  const fc: {
    integer: typeof integer;
    array: typeof array;
    record: typeof record;
    constantFrom: typeof constantFrom;
    property: typeof property;
    assert: typeof assert;
  };

  export default fc;
}
