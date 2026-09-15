import type { EngineInterface, On } from 'claude-code';
import { fetchBlastRadius, fetchCollide } from './codemap';
import { gitHead } from './process';
import { buildRequest, requestReview, summaryLine } from './review-gate';
import { state } from './session-state';
import { getCurrentSettings } from './settings';

const MIN_INTERVAL_MS = 5000;

let ghAvailable: boolean | undefined;
let refreshInFlight = false;

async function isGhAvailable($: EngineInterface, cwd: string): Promise<boolean> {
  if (ghAvailable !== undefined) return ghAvailable;
  try {
    const r = await $.process.run(['gh', '--version'], { cwd, timeoutMs: 5000 });
    ghAvailable = r.exitCode === 0;
  } catch {
    ghAvailable = false;
  }
  return ghAvailable;
}

/** Refreshes blast-radius (against the session's starting HEAD) and, when
 *  `gh` is available, PR collisions, then invalidates the band so its next
 *  draw shows the result. Debounced: skips a run already in flight and
 *  won't start another within MIN_INTERVAL_MS of the last one landing. */
export async function refresh($: EngineInterface): Promise<void> {
  if (state.notGitRepo || state.codemapMissing || refreshInFlight) return;
  if (state.lastRefreshAt && Date.now() - state.lastRefreshAt < MIN_INTERVAL_MS) return;
  refreshInFlight = true;
  try {
    const cwd = await $.session.cwd();
    if (!state.sessionStartHead) state.sessionStartHead = await gitHead($, cwd);
    const ref = state.sessionStartHead;
    if (!ref) return;

    const ghOn = await isGhAvailable($, cwd);
    const [blastRadius, collide] = await Promise.all([
      fetchBlastRadius($, cwd, ref),
      ghOn ? fetchCollide($, cwd) : undefined,
    ]);

    if (blastRadius?.ok) {
      state.lastBlastRadius = blastRadius.data;
      state.lastRefreshError = undefined;
    } else if (blastRadius) {
      state.lastRefreshError = blastRadius.error;
    }
    if (collide?.ok) state.lastCollide = collide.data;

    const licenseKey = getCurrentSettings().licenseKey;
    if (licenseKey) {
      const repo = cwd.split('/').filter(Boolean).pop() ?? cwd;
      const head = (await gitHead($, cwd)) ?? ref;
      const body = await buildRequest($, cwd, repo, ref, head);
      const outcome = await requestReview($, licenseKey, body);
      state.lastReviewOutcome = outcome;
      $.ui.log(summaryLine(outcome));
    }

    state.lastRefreshAt = Date.now();
    $.ui.invalidate('ui.render');
  } finally {
    refreshInFlight = false;
  }
}

export function registerTurnRefresh(on: On): void {
  on('turn.complete', async ($, e, next) => {
    const result = await next(e);
    void refresh($); // fire-and-forget: the band redraws once this resolves
    return result;
  });
}

/** Test-only: clears the module-level gh probe cache between tests. */
export function resetTurnRefreshState(): void {
  ghAvailable = undefined;
  refreshInFlight = false;
}
