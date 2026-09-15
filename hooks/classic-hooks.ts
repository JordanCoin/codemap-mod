import type { EngineInterface } from 'claude-code';
import { state } from './session-state';

/** Detects codemap's classic shell hooks (a settings file whose hook
 *  commands mention "codemap hook") so the pane can tell the person they
 *  are redundant once this mod is doing the same job. Runs once per
 *  session; a read failure just leaves the notice off, never blocks
 *  anything (spec section 5: "Do not rewrite classic hook output in v1"
 *  - detect and point at it, nothing more). */
export async function scanForClassicHooks($: EngineInterface): Promise<boolean> {
  if (state.classicHookScanned) return state.classicHookDetected;
  state.classicHookScanned = true;
  try {
    const settings = await $.settings.read();
    state.classicHookDetected = JSON.stringify(settings).includes('codemap hook');
  } catch {
    state.classicHookDetected = false;
  }
  return state.classicHookDetected;
}
