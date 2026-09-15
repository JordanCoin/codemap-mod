import { describe, expect, test, beforeEach } from 'bun:test';
import type { EngineInterface } from 'claude-code';
import { fetchImporters } from '../hooks/codemap';
import { resetState, state } from '../hooks/session-state';

beforeEach(() => {
  resetState();
});

describe('the "codemap missing" latch', () => {
  test('a missing binary sets state.codemapMissing', async () => {
    const $ = { process: { run: async () => { throw new Error('spawn codemap ENOENT'); } } } as unknown as EngineInterface;
    const outcome = await fetchImporters($, '/repo', 'a.go');
    expect(outcome).toEqual({ ok: false, kind: 'missing', error: 'spawn codemap ENOENT' });
    expect(state.codemapMissing).toBe(true);
  });

  test('once latched, later calls skip spawning a process entirely', async () => {
    state.codemapMissing = true;
    let called = false;
    const $ = { process: { run: async () => { called = true; return { exitCode: 0, stdout: '{}', stderr: '' }; } } } as unknown as EngineInterface;
    const outcome = await fetchImporters($, '/repo', 'a.go');
    expect(called).toBe(false);
    expect(outcome).toEqual({ ok: false, kind: 'missing', error: 'codemap not found' });
  });
});
