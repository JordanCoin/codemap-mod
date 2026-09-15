import type { EngineInterface } from 'claude-code';
import { runJSON, type RunOutcome } from './process';
import type { BlastRadiusResult, CollideResult, ContextResult, DepsResult, ImportersResult } from './types';
import { state } from './session-state';

/** Every call here goes through the same 2-process cap and the same
 *  "codemap missing" latch: once a run tells us the binary is gone, later
 *  calls skip straight to the failure path instead of spawning again. */
async function run<T>($: EngineInterface, args: string[], cwd: string, timeoutMs?: number): Promise<RunOutcome<T>> {
  if (state.codemapMissing) return { ok: false, kind: 'missing', error: 'codemap not found' };
  const outcome = await runJSON<T>($, ['codemap', ...args], { cwd, timeoutMs });
  if (!outcome.ok && outcome.kind === 'missing') state.codemapMissing = true;
  return outcome;
}

export function fetchImporters($: EngineInterface, cwd: string, path: string) {
  return run<ImportersResult>($, ['--json', '--importers', path], cwd);
}

export function fetchContext($: EngineInterface, cwd: string) {
  return run<ContextResult>($, ['context'], cwd);
}

/** For the Skyline's per-language bar widths: `codemap context` names
 *  which languages a repo has but not how many files each; `--deps` does.
 *  Session-start only, never during render (spec section 8). */
export function fetchDeps($: EngineInterface, cwd: string) {
  return run<DepsResult>($, ['--deps', '--json', '.'], cwd, 20_000);
}

export function fetchBlastRadius($: EngineInterface, cwd: string, ref: string) {
  return run<BlastRadiusResult>($, ['blast-radius', '--json', '--ref', ref, '.'], cwd, 20_000);
}

export function fetchCollide($: EngineInterface, cwd: string) {
  return run<CollideResult>($, ['collide', '--json'], cwd, 20_000);
}
