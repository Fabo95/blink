import { useEffect, useRef } from 'react';
import { type ShortcutOptions, useShortcutContext } from './ShortcutProvider';
import type { ShortcutId } from './shortcuts';

/**
 * Enable a SHORTCUTS entry: the SHORTCUTS table owns the keys, chip, and slot; the ShortcutProvider
 * owns the binding; the component contributes only enablement and the handler. The only
 * way to make a shortcut do something.
 */
export function useShortcut(id: ShortcutId, options: ShortcutOptions) {
  const { setShortcutOptions } = useShortcutContext();
  // The handler stays fresh through a ref, so only real option changes re-register.
  const callbackRef = useRef(options.callback);
  callbackRef.current = options.callback;

  const enabled = options.enabled ?? true;
  useEffect(
    () => setShortcutOptions(id, { enabled, callback: (e) => callbackRef.current(e) }),
    [setShortcutOptions, id, enabled],
  );
}
