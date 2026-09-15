import type { On } from 'claude-code';
import { getContextCache } from './context-cache';
import { state } from './session-state';

function contextLine(): string | undefined {
  const ctx = getContextCache();
  if (!ctx) return undefined;
  const { project } = ctx;
  const coverage = project.graph_evidence?.status === 'available' ? 'complete' : 'partial';
  return `codemap: ${project.file_count} files, ${project.hub_count} hubs, coverage ${coverage}. /codemap for detail.`;
}

/** One line, read from the session.start cache only (spec: "Less context,
 *  not more" - `prompt.context` contributes one line, never a fetch of its
 *  own). */
export function registerContextLine(on: On): void {
  on('prompt.context', async ($, e, next) => {
    const result = await next(e);
    if (state.notGitRepo || state.codemapMissing) return result;
    const line = contextLine();
    if (!line) return result;
    return { blocks: [...result.blocks, { name: 'codemap', text: line }] };
  });
}
