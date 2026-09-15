import { describe, expect, test } from 'bun:test';
import type { EngineInterface } from 'claude-code';
import { runJSON, gitHead, isGitRepo } from '../hooks/process';
import contextFixture from '../fixtures/context.json';

function mockEngine(run: EngineInterface['process']['run']): EngineInterface {
  return { process: { run } } as unknown as EngineInterface;
}

describe('runJSON', () => {
  test('parses stdout as JSON on a clean exit, from a real fixture', async () => {
    const $ = mockEngine(async () => ({ exitCode: 0, stdout: JSON.stringify(contextFixture), stderr: '' }));
    const outcome = await runJSON<typeof contextFixture>($, ['codemap', 'context']);
    expect(outcome).toEqual({ ok: true, data: contextFixture });
  });

  test('a thrown ENOENT-shaped error is tagged "missing", not a generic error', async () => {
    const $ = mockEngine(async () => {
      throw new Error('spawn codemap ENOENT');
    });
    const outcome = await runJSON($, ['codemap', 'context']);
    expect(outcome).toEqual({ ok: false, kind: 'missing', error: 'spawn codemap ENOENT' });
  });

  test('a non-zero exit is a plain error, using stderr as the message', async () => {
    const $ = mockEngine(async () => ({ exitCode: 1, stdout: '', stderr: 'not a git repo' }));
    const outcome = await runJSON($, ['codemap', 'context']);
    expect(outcome).toEqual({ ok: false, kind: 'error', error: 'not a git repo' });
  });

  test('unparseable stdout on a clean exit is a plain error, not a throw', async () => {
    const $ = mockEngine(async () => ({ exitCode: 0, stdout: 'not json', stderr: '' }));
    const outcome = await runJSON($, ['codemap', 'context']);
    expect(outcome.ok).toBe(false);
  });

  test('never runs more than 2 processes at once', async () => {
    let current = 0;
    let max = 0;
    const $ = mockEngine(async () => {
      current++;
      max = Math.max(max, current);
      await new Promise((r) => setTimeout(r, 20));
      current--;
      return { exitCode: 0, stdout: '{}', stderr: '' };
    });
    await Promise.all([
      runJSON($, ['codemap', 'a']),
      runJSON($, ['codemap', 'b']),
      runJSON($, ['codemap', 'c']),
      runJSON($, ['codemap', 'd']),
    ]);
    expect(max).toBeLessThanOrEqual(2);
  });
});

describe('gitHead / isGitRepo', () => {
  test('gitHead trims the SHA from stdout', async () => {
    const $ = mockEngine(async () => ({ exitCode: 0, stdout: 'abc123\n', stderr: '' }));
    expect(await gitHead($, '/repo')).toBe('abc123');
  });

  test('gitHead is undefined on a failing git', async () => {
    const $ = mockEngine(async () => ({ exitCode: 128, stdout: '', stderr: 'not a repo' }));
    expect(await gitHead($, '/repo')).toBeUndefined();
  });

  test('isGitRepo reads the "true"/exit-0 pair, nothing else', async () => {
    const $ = mockEngine(async () => ({ exitCode: 0, stdout: 'true\n', stderr: '' }));
    expect(await isGitRepo($, '/repo')).toBe(true);
  });

  test('isGitRepo is false on a non-git directory', async () => {
    const $ = mockEngine(async () => ({ exitCode: 128, stdout: '', stderr: 'not a git repository' }));
    expect(await isGitRepo($, '/repo')).toBe(false);
  });
});
