import type { EngineInterface } from 'claude-code';

const STORE_KEY = 'bandCollapsed';

/** Whether the AbovePrompt band is collapsed, remembered across sessions
 *  via $.store (spec: "Collapsible via a setting and a button"). Falls back
 *  to false on a store error instead of throwing out of a render hook. */
export async function getBandCollapsed($: EngineInterface): Promise<boolean> {
  try {
    return (await $.store.get(STORE_KEY)) === true;
  } catch {
    return false;
  }
}

export async function setBandCollapsed($: EngineInterface, collapsed: boolean): Promise<void> {
  try {
    await $.store.set(STORE_KEY, collapsed);
  } catch {
    // Best-effort: the toggle still works for the rest of this render pass.
  }
}
