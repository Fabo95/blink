/** Pull the human message out of a rejected Tauri command (`AppError { kind, message }`). */
export function errorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}
