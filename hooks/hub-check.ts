import type { EngineInterface, On } from 'claude-code';
import * as cache from './cache';
import { fetchImporters } from './codemap';
import { EDIT_TOOLS } from './names';
import { getCurrentSettings } from './settings';
import { recordTouched, state } from './session-state';
import { gitHead, isGitRepo } from './process';

/** Reads the edited path off a tool event whichever shape it arrives in:
 *  spread directly on `e` (`e.file_path`) or nested under `e.input`, since
 *  MultiEdit is not a built-in tool this engine build's type declarations
 *  know about (BuiltinToolInputs is filled in per install) - a matcher
 *  literal for it would not even compile, so this hook stays untyped on
 *  purpose and checks both shapes at runtime instead. */
export function pathFromToolEvent(tool: string, e: Record<string, unknown>): string | undefined {
  const key = tool === 'NotebookEdit' ? 'notebook_path' : 'file_path';
  const direct = e[key];
  if (typeof direct === 'string') return direct;
  const input = e.input;
  if (input && typeof input === 'object') {
    const nested = (input as Record<string, unknown>)[key];
    if (typeof nested === 'string') return nested;
  }
  return undefined;
}

/** Populates the cache for `path` if it is missing or stale for the current
 *  HEAD; returns the fresh entry, or the last known one (possibly stale)
 *  when the refresh itself fails (spec: "codemap errors or timeouts: keep
 *  the last good cache, mark it stale with its age"). */
async function ensureCached($: EngineInterface, cwd: string, path: string, head: string) {
  const existing = cache.get(path);
  if (existing && cache.isFresh(existing, head)) return existing;
  const outcome = await fetchImporters($, cwd, path);
  if (outcome.ok) return cache.set(path, outcome.data, head);
  return existing; // stale entry (or undefined) - caller decides what to show
}

/** On every check for a file-editing tool: look the target up (fetching if
 *  the cache is cold), record it for the band, and only in `ask`/`deny`
 *  mode at or above the importer threshold does the decision change. The
 *  default `annotate` mode never blocks - an agent that cannot edit a hub
 *  cannot fix it. */
export function registerHubCheck(on: On): void {
  on('tool.check', async ($, e, next) => {
    if (!EDIT_TOOLS.has(e.tool) || state.codemapMissing || state.notGitRepo) return next(e);
    const path = pathFromToolEvent(e.tool, e as unknown as Record<string, unknown>);
    if (!path) return next(e);

    const cwd = await $.session.cwd();
    if (!(await isGitRepo($, cwd))) {
      state.notGitRepo = true;
      return next(e);
    }
    const head = await gitHead($, cwd);
    if (!head) return next(e);

    const entry = await ensureCached($, cwd, path, head);
    if (!entry) return next(e);
    recordTouched(path, entry.data.importer_count, entry.data.is_hub);
    if (!entry.data.is_hub) return next(e);

    const settings = getCurrentSettings();
    if (settings.hubEdits === 'annotate') return next(e);
    if (entry.data.importer_count < settings.hubImporterThreshold) return next(e);
    const reason = `${path} · ${entry.data.importer_count} importers · hub (${settings.hubImporterThreshold}+)`;
    return { decision: settings.hubEdits, reason };
  });

  // Invalidate this file's cache once the edit actually lands, so the next
  // check (or the band's next draw) re-measures instead of showing a
  // pre-edit importer count.
  on('tool.call', async ($, e, next) => {
    const result = await next(e);
    if (EDIT_TOOLS.has(e.tool) && result.deny === undefined) {
      const path = pathFromToolEvent(e.tool, e as unknown as Record<string, unknown>);
      if (path) cache.invalidate(path);
    }
    return result;
  });
}
