declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
    function(name: string, options: { deterministic?: boolean }, fn: (...args: unknown[]) => unknown): void;
  }
  export class StatementSync {
    run(...args: unknown[]): unknown;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  }
}
