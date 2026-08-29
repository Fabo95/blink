/** Pull a display string out of a rejected IPC call. Tauri rejects a command's `Err`
 *  with the serialized `AppError` (`{ kind, message }`), so prefer `message`. */
export function errorText(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}
