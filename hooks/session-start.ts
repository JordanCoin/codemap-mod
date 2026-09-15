import type { On, PluginOptions } from 'claude-code';
import { scanForClassicHooks } from './classic-hooks';
import { fetchContext, fetchDeps } from './codemap';
import { setContextCache, setLanguageCounts } from './context-cache';
import { COMMAND_NAME } from './names';
import { isGitRepo } from './process';
import { loadSettings, setCurrentSettings } from './settings';
import { state } from './session-state';

/** Everything that must run once, before the first render: load settings,
 *  probe for a git repo, do the one `codemap context` fetch every render
 *  reads from, register `/codemap`. session.start is not a render hook, so
 *  this is the only place codemap is allowed to run before anything is on
 *  screen (spec section 8: "Never run codemap during render"). */
export function registerSessionStart(on: On, options: PluginOptions): void {
  on('session.start', async ($, e, next) => {
    const result = await next(e);
    setCurrentSettings(await loadSettings($, options));

    const cwd = e.cwd;
    if (!(await isGitRepo($, cwd))) {
      state.notGitRepo = true;
      return result;
    }

    const outcome = await fetchContext($, cwd);
    if (outcome.ok) setContextCache(outcome.data);

    const deps = await fetchDeps($, cwd);
    if (deps.ok) {
      const counts: Record<string, number> = {};
      for (const f of deps.data.files) {
        const lang = f.language ?? 'unknown';
        counts[lang] = (counts[lang] ?? 0) + 1;
      }
      setLanguageCounts(counts);
    }

    void scanForClassicHooks($);

    await $.command.register({
      name: COMMAND_NAME,
      description: 'codemap: this session, hubs, collisions, skyline',
    });

    return result;
  });
}
