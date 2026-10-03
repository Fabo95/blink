/**
 * Keep `⇥` / `⇧⇥` inside a popover form: native Tab moves between the fields marked by
 * `selector` (e.g. `[data-note-field]`); only at the ends is it intercepted to wrap around.
 * Radix Popover doesn't trap focus itself.
 */
export function wrapFocus(e: KeyboardEvent, selector: string) {
  const fields = Array.from(document.querySelectorAll<HTMLElement>(selector));
  const first = fields[0];
  const last = fields[fields.length - 1];
  if (fields.length < 2 || first === undefined || last === undefined) return;
  if (!e.shiftKey && e.target === last) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && e.target === first) {
    e.preventDefault();
    last.focus();
  }
}
