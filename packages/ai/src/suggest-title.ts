/** The minimal input suggestTitle needs — decoupled from any specific task model. */
export interface Snippet {
  text: string;
  source: { appId: string; windowTitle: string };
}

export interface TitleSuggestion {
  title: string;
  context: string;
}

/**
 * Suggest a task title from a captured snippet.
 *
 * Today this is a dead-simple heuristic: the first few words of the first line.
 * There is no real AI yet — when a model (on-device ONNX or a cloud model) is
 * added, this one function is where it plugs in.
 */
export function suggestTitle(draft: Snippet): TitleSuggestion {
  const firstLine = draft.text.trim().split('\n', 1)[0] ?? '';
  const words = firstLine.split(/\s+/).filter(Boolean).slice(0, 8);
  const title = words.join(' ') || 'Captured snippet';
  return {
    title: title.length > 72 ? `${title.slice(0, 69)}…` : title,
    context: `From ${draft.source.appId} — ${draft.source.windowTitle}`,
  };
}
