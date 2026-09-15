import type { EngineInterface, PluginOptions } from 'claude-code';
import { DEFAULT_HUB_IMPORTER_THRESHOLD } from './names';

export type HubEditsMode = 'annotate' | 'ask' | 'deny';

export interface Settings {
  hubEdits: HubEditsMode;
  hubImporterThreshold: number;
  licenseKey: string | undefined;
}

function isHubEditsMode(value: unknown): value is HubEditsMode {
  return value === 'annotate' || value === 'ask' || value === 'deny';
}

/** Reads the plugin's settings out of PluginOptions (`.claude-plugin/plugin.json`'s
 *  `userConfig` defaults, overridden by whatever the person set in `/config`)
 *  and, for the license key only, falls back to an environment variable. */
export async function loadSettings($: EngineInterface, options: PluginOptions): Promise<Settings> {
  const hubEdits = isHubEditsMode(options.hubEdits) ? options.hubEdits : 'annotate';
  const threshold = Number(options.hubImporterThreshold);
  const envKey = await $.env.get('CODEMAP_LICENSE_KEY');
  const licenseKey = (typeof options.licenseKey === 'string' && options.licenseKey) || envKey || undefined;
  return {
    hubEdits,
    hubImporterThreshold: Number.isFinite(threshold) && threshold > 0 ? threshold : DEFAULT_HUB_IMPORTER_THRESHOLD,
    licenseKey,
  };
}

// Settings are read once at session.start (spec gives no live-reload
// requirement); every hook reads this module-level snapshot instead of
// threading Settings through every handler signature.
let current: Settings = { hubEdits: 'annotate', hubImporterThreshold: DEFAULT_HUB_IMPORTER_THRESHOLD, licenseKey: undefined };

export function setCurrentSettings(next: Settings): void {
  current = next;
}

export function getCurrentSettings(): Settings {
  return current;
}
