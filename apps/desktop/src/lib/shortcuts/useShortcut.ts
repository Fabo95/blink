import { useEffect, useRef } from 'react';
import { KEYMAP, type ShortcutDef, type ShortcutId } from './keymap';
import { type ShortcutOptions, useShortcutContext } from './ShortcutProvider';

/**
 * Enable a keymap entry: the KEYMAP owns the keys, chip, and slot; the ShortcutProvider
 * owns the binding; the component contributes only enablement and the handler. The only
 * way to make a shortcut do something.
 */
export function useShortcut(id: ShortcutId, options: ShortcutOptions) {
  const { setShortcutOptions } = useShortcutContext();
  // The handler stays fresh through a ref, so only real option changes re-register.
  const callbackRef = useRef(options.callback);
  callbackRef.current = options.callback;

  const def: ShortcutDef = KEYMAP[id];
  const enabled = options.enabled ?? true;
  const hint = options.hint === undefined ? def.hint : options.hint;
  const hintKeys = hint?.keys;
  const hintVim = hint?.vim;
  const hintLabel = hint?.label;

  useEffect(
    () =>
      setShortcutOptions(id, {
        enabled,
        callback: (e) => callbackRef.current(e),
        hint:
          hintKeys !== undefined && hintLabel !== undefined
            ? { keys: hintKeys, vim: hintVim, label: hintLabel }
            : null,
      }),
    [setShortcutOptions, id, enabled, hintKeys, hintVim, hintLabel],
  );
}
