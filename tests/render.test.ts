import { describe, expect, test, beforeEach } from 'bun:test';
import type { EngineInterface } from 'claude-code';
import { renderBand } from '../hooks/band';
import { renderPane } from '../hooks/pane';
import { resetState, state } from '../hooks/session-state';
import { resetContextCache, setContextCache, setLanguageCounts } from '../hooks/context-cache';
import { setCurrentSettings } from '../hooks/settings';
import { mockElements, textOf } from './jsx-shim';

function mockEngine(store: Record<string, unknown> = {}): EngineInterface {
  return {
    ui: {
      resolve: () => mockElements,
      invalidate: () => {},
      log: () => {},
    },
    store: {
      get: async (key: string) => store[key],
      set: async (key: string, value: unknown) => {
        store[key] = value;
      },
    },
    settings: { read: async () => ({}) },
  } as unknown as EngineInterface;
}

const noBelow = async () => null;
const paneEvent = { requestId: 'codemap', surface: 'terminal' };

beforeEach(() => {
  resetState();
  resetContextCache();
  setCurrentSettings({ hubEdits: 'annotate', hubImporterThreshold: 9, licenseKey: undefined });
});

describe('renderBand', () => {
  test('shows nothing (below only) when the cwd is not a git repo', async () => {
    state.notGitRepo = true;
    const tree = await renderBand(mockEngine(), {}, noBelow);
    expect(tree).toBeNull();
  });

  test('shows the "not found" line once, then nothing again', async () => {
    state.codemapMissing = true;
    const $ = mockEngine();
    const first = await renderBand($, {}, noBelow);
    expect(textOf(first)).toContain('codemap not found');
    expect(textOf(first)).toContain('brew install codemap');
    const second = await renderBand($, {}, noBelow);
    expect(second).toBeNull();
  });

  test('lists touched files ranked by importer count, with a hub mark', async () => {
    state.touched.set('a.go', { path: 'a.go', importerCount: 2, isHub: false });
    state.touched.set('config/config.go', { path: 'config/config.go', importerCount: 40, isHub: true });
    const text = textOf(await renderBand(mockEngine(), {}, noBelow));
    expect(text).toContain('config/config.go · 40 importers · hub (3+)');
    expect(text).toContain('a.go · 2 importers');
    // Ranked: the hub (40 importers) row comes before the 2-importer row.
    expect(text.indexOf('config/config.go')).toBeLessThan(text.indexOf('a.go'));
  });

  test('shows an "Attach importers" button only when a touched file is a hub', async () => {
    state.touched.set('config/config.go', { path: 'config/config.go', importerCount: 40, isHub: true });
    const text = textOf(await renderBand(mockEngine(), {}, noBelow));
    expect(text).toContain('Attach importers');
  });

  test('a collapsed band (persisted setting) shows only the expand button', async () => {
    state.touched.set('config/config.go', { path: 'config/config.go', importerCount: 40, isHub: true });
    const text = textOf(await renderBand(mockEngine({ bandCollapsed: true }), {}, noBelow));
    expect(text).toBe('codemap ▸');
  });

  test('the coverage line reports blast radius once a turn has refreshed', async () => {
    state.lastBlastRadius = {
      root: '/repo',
      ref: 'abc',
      summary: {
        changed_files: 1,
        max_direct_dependents: 40,
        highest_blast_radius: { file: 'config/config.go', importer_count: 40 },
        impacted_outside_diff_total: 12,
      },
      impacted_outside_diff: [],
    };
    const text = textOf(await renderBand(mockEngine(), {}, noBelow));
    expect(text).toContain('blast: config/config.go · 40 importers');
  });
});

describe('renderPane', () => {
  test('passes through untouched when the requestId is not this mod\'s pane', async () => {
    const result = await renderPane(mockEngine(), { requestId: 'someone-elses-pane' }, noBelow);
    expect(result).toBeNull();
  });

  test('shows an offer line when no license key is configured', async () => {
    const text = textOf(await renderPane(mockEngine(), paneEvent, noBelow));
    expect(text).toContain('codemap-site.vercel.app/offer');
  });

  test('shows top hubs from the cached codemap context', async () => {
    setContextCache({
      version: 2,
      project: { root: '/repo', branch: 'main', file_count: 291, languages: ['go'], hub_count: 3, top_hubs: ['config/config.go', 'analysis/contracts.go'] },
    });
    const text = textOf(await renderPane(mockEngine(), paneEvent, noBelow));
    expect(text).toContain('config/config.go');
    expect(text).toContain('analysis/contracts.go');
  });

  test('the Skyline lists each language with a file count', async () => {
    setContextCache({ version: 2, project: { root: '/repo', branch: 'main', file_count: 4, languages: ['go', 'bash'], hub_count: 0, top_hubs: [] } });
    setLanguageCounts({ go: 3, bash: 1 });
    const text = textOf(await renderPane(mockEngine(), paneEvent, noBelow));
    expect(text).toContain('go · 3 files');
    expect(text).toContain('bash · 1 file');
  });

  test('shows the classic-hooks notice when settings mention "codemap hook"', async () => {
    const $ = {
      ...mockEngine(),
      settings: { read: async () => ({ hooks: { PreToolUse: [{ hooks: [{ command: 'codemap hook pre-tool-use' }] }] } }) },
    } as unknown as EngineInterface;
    const text = textOf(await renderPane($, paneEvent, noBelow));
    expect(text).toContain('classic codemap shell hooks');
  });
});
