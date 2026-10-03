/** The arguments a command was invoked with, as the Tauri IPC would pass them. */
export type MockArgs = Record<string, unknown> | undefined;

/** One in-memory stand-in per Tauri command, keyed by the command name. */
export type MockHandlers = Record<string, (args: MockArgs) => Promise<unknown>>;
