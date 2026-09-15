import { describe, expect, test, beforeEach } from 'bun:test';
import type { EngineInterface } from 'claude-code';
import * as cache from '../hooks/cache';
import { pathFromToolEvent, registerHubCheck } from '../hooks/hub-check';
import { resetState, state } from '../hooks/session-state';
import { setCurrentSettings } from '../hooks/settings';
import type { ImportersResult } from '../hooks/types';
import { fakeOn } from './fake-on';

const HUB_40: ImportersResult = {
  root: '/repo',
  mode: 'importers',
  file: 'config/config.go',
  importers: Array.from({ length: 40 }, (_, i) => `f${i}.go`),
  importer_count: 40,
  is_hub: true,
  coverage_status: 'complete',
};

const NOT_HUB: ImportersResult = {
  root: '/repo',
  mode: 'importers',
  file: 'scripts/one_off.go',
  importers: [],
  importer_count: 0,
  is_hub: false,
  coverage_status: 'complete',
};

function mockEngine(importers: ImportersResult, head = 'head1'): EngineInterface {
  return {
    session: { cwd: async () => '/repo' },
    process: {
      run: async (argv: readonly string[]) => {
        if (argv[0] === 'git' && argv[2] === '--is-inside-work-tree') return { exitCode: 0, stdout: 'true\n', stderr: '' };
        if (argv[0] === 'git' && argv[2] === 'HEAD') return { exitCode: 0, stdout: `${head}\n`, stderr: '' };
        if (argv[0] === 'codemap') return { exitCode: 0, stdout: JSON.stringify(importers), stderr: '' };
        return { exitCode: 1, stdout: '', stderr: 'unexpected argv' };
      },
    },
  } as unknown as EngineInterface;
}

const next = async (e: unknown) => ({ __passthrough: true, e });

beforeEach(() => {
  cache.clear();
  resetState();
  setCurrentSettings({ hubEdits: 'annotate', hubImporterThreshold: 9, licenseKey: undefined });
});

describe('pathFromToolEvent', () => {
  test('reads file_path spread directly on the event', () => {
    expect(pathFromToolEvent('Edit', { file_path: 'a.go' })).toBe('a.go');
  });
  test('reads file_path nested under input', () => {
    expect(pathFromToolEvent('Write', { input: { file_path: 'b.go' } })).toBe('b.go');
  });
  test('reads notebook_path for NotebookEdit', () => {
    expect(pathFromToolEvent('NotebookEdit', { notebook_path: 'nb.ipynb' })).toBe('nb.ipynb');
  });
  test('returns undefined when neither shape has a path', () => {
    expect(pathFromToolEvent('Edit', {})).toBeUndefined();
  });
});

describe('tool.check hub gating', () => {
  test('annotate mode (default) never blocks a hub edit', async () => {
    const { on, handlers } = fakeOn();
    registerHubCheck(on);
    const $ = mockEngine(HUB_40);
    const result = await handlers['tool.check']![0]!($, { tool: 'Edit', file_path: 'config/config.go' }, next);
    expect(result).toEqual({ __passthrough: true, e: { tool: 'Edit', file_path: 'config/config.go' } });
    expect(state.touched.get('config/config.go')?.isHub).toBe(true);
  });

  test('ask mode at or above the threshold asks, with a sourced reason', async () => {
    setCurrentSettings({ hubEdits: 'ask', hubImporterThreshold: 9, licenseKey: undefined });
    const { on, handlers } = fakeOn();
    registerHubCheck(on);
    const $ = mockEngine(HUB_40);
    const result = await handlers['tool.check']![0]!($, { tool: 'Edit', file_path: 'config/config.go' }, next);
    expect(result).toEqual({ decision: 'ask', reason: 'config/config.go · 40 importers · hub (9+)' });
  });

  test('deny mode at or above the threshold denies', async () => {
    setCurrentSettings({ hubEdits: 'deny', hubImporterThreshold: 9, licenseKey: undefined });
    const { on, handlers } = fakeOn();
    registerHubCheck(on);
    const $ = mockEngine(HUB_40);
    const result: any = await handlers['tool.check']![0]!($, { tool: 'Write', file_path: 'config/config.go' }, next);
    expect(result.decision).toBe('deny');
  });

  test('ask mode below the threshold still passes through', async () => {
    setCurrentSettings({ hubEdits: 'ask', hubImporterThreshold: 41, licenseKey: undefined });
    const { on, handlers } = fakeOn();
    registerHubCheck(on);
    const $ = mockEngine(HUB_40);
    const result = await handlers['tool.check']![0]!($, { tool: 'Edit', file_path: 'config/config.go' }, next);
    expect(result).toEqual({ __passthrough: true, e: { tool: 'Edit', file_path: 'config/config.go' } });
  });

  test('a non-hub file never triggers ask/deny even at low thresholds', async () => {
    setCurrentSettings({ hubEdits: 'deny', hubImporterThreshold: 1, licenseKey: undefined });
    const { on, handlers } = fakeOn();
    registerHubCheck(on);
    const $ = mockEngine(NOT_HUB);
    const result = await handlers['tool.check']![0]!($, { tool: 'Edit', file_path: 'scripts/one_off.go' }, next);
    expect(result).toEqual({ __passthrough: true, e: { tool: 'Edit', file_path: 'scripts/one_off.go' } });
  });

  test('a tool this mod does not watch passes straight through, untouched', async () => {
    const { on, handlers } = fakeOn();
    registerHubCheck(on);
    const $ = mockEngine(HUB_40);
    const result = await handlers['tool.check']![0]!($, { tool: 'Read', file_path: 'config/config.go' }, next);
    expect(result).toEqual({ __passthrough: true, e: { tool: 'Read', file_path: 'config/config.go' } });
    expect(state.touched.size).toBe(0);
  });
});

describe('tool.call cache invalidation', () => {
  test('a successful edit invalidates that path so the next check re-measures', async () => {
    const { on, handlers } = fakeOn();
    registerHubCheck(on);
    cache.set('config/config.go', HUB_40, 'head1');
    const callNext = async () => ({ result: {}, text: 'ok' });
    await handlers['tool.call']![0]!(mockEngine(HUB_40), { tool: 'Edit', file_path: 'config/config.go' }, callNext);
    expect(cache.get('config/config.go')).toBeUndefined();
  });

  test('a denied edit does not invalidate the cache', async () => {
    const { on, handlers } = fakeOn();
    registerHubCheck(on);
    cache.set('config/config.go', HUB_40, 'head1');
    const callNext = async () => ({ deny: 'blocked' });
    await handlers['tool.call']![0]!(mockEngine(HUB_40), { tool: 'Edit', file_path: 'config/config.go' }, callNext);
    expect(cache.get('config/config.go')).toBeDefined();
  });
});
