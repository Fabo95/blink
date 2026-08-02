import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Best-effort human message from an unknown thrown value, falling back to `fallback`. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  // Tauri rejects a command's Err with our AppError object `{ kind, message }`, which
  // isn't an Error instance — pull the message out of it.
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return fallback;
}
