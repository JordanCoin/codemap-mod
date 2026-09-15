import type { EngineInterface, On } from 'claude-code';
import { arm } from './attach';
import { getBandCollapsed, setBandCollapsed } from './band-state';
import { BAND_ROWS_MAX } from './names';
import { state, topTouched } from './session-state';

function coverageLine(): string {
  const parts: string[] = [];
  const br = state.lastBlastRadius;
  if (br?.summary.highest_blast_radius) {
    const { file, importer_count } = br.summary.highest_blast_radius;
    parts.push(`blast: ${file} · ${importer_count} importers`);
  }
  const shared = state.lastCollide?.shared_files[0];
  if (shared && shared.prs[0] !== undefined) {
    parts.push(`PR #${shared.prs[0]} also changes ${shared.path}`);
  }
  if (parts.length === 0) parts.push('codemap: waiting for a turn to complete');
  if (state.lastRefreshError && state.lastRefreshAt) {
    const ageS = Math.round((Date.now() - state.lastRefreshAt) / 1000);
    parts.push(`stale ${ageS}s · ${state.lastRefreshError}`);
  }
  return parts.join(' · ');
}

/** The AbovePrompt band's render function, exported directly so tests can
 *  call it with a mocked `$` and `e` without going through `on()`. At most
 *  3 rows, cache reads only, never a codemap process spawned from render
 *  (spec section 8). */
export async function renderBand($: EngineInterface, e: any, next: (e: any) => Promise<any>): Promise<any> {
  const below = await next(e);
    if (state.notGitRepo) return below;

    const { Box, Text, Button } = $.ui.resolve(e);

    if (state.codemapMissing) {
      if (state.codemapMissingNoticeShown) return below;
      state.codemapMissingNoticeShown = true;
      return (
        <Box flexDirection="column">
          {below}
          <Text dimColor>codemap not found · brew install codemap</Text>
        </Box>
      );
    }

    const collapsed = await getBandCollapsed($);
    if (collapsed) {
      return (
        <Box flexDirection="column">
          {below}
          <Button
            label="codemap ▸"
            plain
            dimColor
            onPress={async () => {
              await setBandCollapsed($, false);
              $.ui.invalidate('ui.render');
            }}
          />
        </Box>
      );
    }

    const rows = topTouched(BAND_ROWS_MAX - 1);
    const hubRow = rows.find((r) => r.isHub);

    return (
      <Box flexDirection="column">
        {below}
        {rows.map((r) => (
          <Text>
            {r.path} · {r.importerCount} importer{r.importerCount === 1 ? '' : 's'}
            {r.isHub ? ' · hub (3+)' : ''}
          </Text>
        ))}
        <Text dimColor>{coverageLine()}</Text>
        <Box flexDirection="row" gap={2}>
          {hubRow ? (
            <Button
              label="Attach importers"
              hotkey="a"
              onPress={() => {
                arm(hubRow.path);
                $.ui.invalidate('ui.render');
              }}
            />
          ) : null}
          <Button
            label="codemap ▾"
            plain
            dimColor
            onPress={async () => {
              await setBandCollapsed($, true);
              $.ui.invalidate('ui.render');
            }}
          />
        </Box>
      </Box>
  );
}

/** Registers the render function above on `ui.render` for `AbovePrompt`. */
export function registerBand(on: On): void {
  on('ui.render', { component: 'AbovePrompt' }, renderBand);
}
