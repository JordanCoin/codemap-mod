import type { On } from 'claude-code';
import * as cache from './cache';
import { state } from './session-state';

const MAX_LISTED = 50;

export function arm(path: string): void {
  state.armedAttachPath = path;
}

/** The text the "Attach importers" button adds to the next prompt, or
 *  undefined when there is nothing cached to attach (the button should not
 *  have been pressable, but a stale render can still race an invalidation). */
export function buildAttachmentText(path: string): string | undefined {
  const entry = cache.get(path);
  const importers = entry?.data.importers;
  if (!importers || importers.length === 0) return undefined;
  const shown = importers.slice(0, MAX_LISTED);
  const rest = importers.length - shown.length;
  const lines = [`codemap: importers of ${path} (${entry!.data.importer_count} total)`, ...shown];
  if (rest > 0) lines.push(`… and ${rest} more`);
  return lines.join('\n');
}

/** Attaches the armed file's importer list to the next prompt, once, the
 *  diff mod's pattern: arm on a button press, consume on the next
 *  prompt.submit regardless of whether it found text to attach. */
export function registerAttach(on: On): void {
  on('prompt.submit', async ($, e, next) => {
    const path = state.armedAttachPath;
    if (!path) return next(e);
    state.armedAttachPath = undefined;
    const text = buildAttachmentText(path);
    if (!text) return next(e);
    return next({ ...e, context: [...(e.context ?? []), text] });
  });
}
