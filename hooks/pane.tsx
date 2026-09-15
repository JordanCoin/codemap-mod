import type { EngineInterface, On } from 'claude-code';
import { getContextCache, getLanguageCounts } from './context-cache';
import { scanForClassicHooks } from './classic-hooks';
import { COMMAND_NAME, OFFER_URL, PANE_ID, SKYLINE_COLORS } from './names';
import { summaryLine } from './review-gate';
import { getCurrentSettings } from './settings';
import { state, topTouched } from './session-state';

const MAX_LIST_ROWS = 8;
const SKYLINE_WIDTH = 24;

export async function runCommand($: EngineInterface): Promise<{ text: undefined }> {
  await $.ui.open({ id: PANE_ID, title: 'codemap', focus: true, closeOnEscape: true });
  return { text: undefined };
}

export function registerCommand(on: On): void {
  on('command.run', { command: COMMAND_NAME }, runCommand);
}

/** The Pane's render function, exported directly so tests can call it with
 *  a mocked `$` and `e` without going through `on()`. */
export async function renderPane($: EngineInterface, e: any, next: (e: any) => Promise<any>): Promise<any> {
  const below = await next(e);
  if (e.requestId !== PANE_ID) return below;

  const { Box, Text } = $.ui.resolve(e);

    if (state.notGitRepo) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text dimColor>Not a git repo - codemap has nothing to show here.</Text>
        </Box>
      );
    }
    if (state.codemapMissing) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text dimColor>codemap not found · brew install codemap</Text>
        </Box>
      );
    }

    const ctx = getContextCache();
    const touched = topTouched(MAX_LIST_ROWS);
    const impacted = state.lastBlastRadius?.impacted_outside_diff.slice(0, MAX_LIST_ROWS) ?? [];
    const collideFiles = state.lastCollide?.shared_files.slice(0, MAX_LIST_ROWS) ?? [];
    const settings = getCurrentSettings();
    const classicHooks = await scanForClassicHooks($);
    const languageCounts = getLanguageCounts();

    return (
      <Box flexDirection="column" padding={1}>
        {below}
        {classicHooks ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text color="#d8b26a">
              This project's classic codemap shell hooks are still installed. This mod does the same job from
              inside Claude Code - remove the "codemap hook" entries from your settings files once you're using
              it.
            </Text>
          </Box>
        ) : null}

        {sectionHeader(Box, Text, 'This session')}
        {touched.length === 0 ? (
          <Text dimColor>No files touched yet this session.</Text>
        ) : (
          touched.map((t) => (
            <Text>
              {t.path} · {t.importerCount} importer{t.importerCount === 1 ? '' : 's'}
              {t.isHub ? ' · hub (3+)' : ''}
            </Text>
          ))
        )}
        {impacted.length > 0 ? (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>Impacted outside the diff:</Text>
            {impacted.map((i) => (
              <Text dimColor>
                {i.path} · via {i.via} ({i.via_importer_count} importers)
              </Text>
            ))}
          </Box>
        ) : null}

        {sectionHeader(Box, Text, 'Hubs')}
        {ctx && ctx.project.top_hubs.length > 0 ? (
          ctx.project.top_hubs.map((hub) => <Text>{hub}</Text>)
        ) : (
          <Text dimColor>No hubs (3+ importers) in this project.</Text>
        )}

        {sectionHeader(Box, Text, 'Collisions')}
        {collideFiles.length > 0 ? (
          collideFiles.map((f) => (
            <Text>
              {f.path} · PR{f.prs.length === 1 ? '' : 's'} {f.prs.join(', ')} · {f.importer_count} importers
            </Text>
          ))
        ) : (
          <Text dimColor>
            {state.lastCollide ? 'No shared files across open PRs.' : 'No collision data yet - runs after a turn completes.'}
          </Text>
        )}

        {sectionHeader(Box, Text, 'codemap Team')}
        {settings.licenseKey ? (
          <Text dimColor>{state.lastReviewOutcome ? summaryLine(state.lastReviewOutcome) : 'Waiting for a turn to complete.'}</Text>
        ) : (
          <Text dimColor>
            Keyed review decisions need a license. {OFFER_URL}
          </Text>
        )}

        {sectionHeader(Box, Text, 'Skyline')}
        {ctx && languageCounts ? skyline(Box, Text, languageCounts) : <Text dimColor>No language breakdown yet.</Text>}
      </Box>
  );
}

/** Registers the render function above on `ui.render` for `Pane`. */
export function registerPane(on: On): void {
  on('ui.render', { component: 'Pane' }, renderPane);
}

function sectionHeader(Box: any, Text: any, title: string) {
  return (
    <Box marginTop={1}>
      <Text bold>{title}</Text>
    </Box>
  );
}

function skyline(Box: any, Text: any, counts: Record<string, number>) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, n]) => sum + n, 0) || 1;
  return (
    <Box flexDirection="column">
      {entries.map(([lang, count], i) => {
        const width = Math.max(1, Math.round((count / total) * SKYLINE_WIDTH));
        const color = SKYLINE_COLORS[i % SKYLINE_COLORS.length];
        return (
          <Box flexDirection="row" gap={1}>
            <Box width={width} height={1} backgroundColor={color} />
            <Text dimColor>
              {lang} · {count} file{count === 1 ? '' : 's'}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
