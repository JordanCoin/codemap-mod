import { describe, expect, test } from 'bun:test';
import { isTestPath, languageOf, requestReview, summaryLine, type ReviewGateRequest } from '../hooks/review-gate';
import type { EngineInterface } from 'claude-code';

function mockEngine(fetchImpl: (url: string, init?: unknown) => Promise<{ status: number; ok: boolean; headers: Record<string, string>; text: string }>): EngineInterface {
  return { http: { fetch: fetchImpl } } as unknown as EngineInterface;
}

const BODY: ReviewGateRequest = {
  repo: 'codemap-mod',
  pr: null,
  base_sha: 'abc',
  head_sha: 'def',
  codemap_version: 'codemap dev',
  changed: [],
  coverage: { status: 'complete', notes: [] },
  collide: null,
  caps: { changed_total: 0, changed_measured: 0 },
};

describe('requestReview', () => {
  test('a 200 with review:true decides yes and carries the reason', async () => {
    const $ = mockEngine(async () => ({
      status: 200,
      ok: true,
      headers: {},
      text: JSON.stringify({ review: true, reason: 'config/config.go has 40 importers' }),
    }));
    const outcome = await requestReview($, 'key', BODY);
    expect(outcome).toEqual({ kind: 'decided', review: true, reason: 'config/config.go has 40 importers' });
    expect(summaryLine(outcome)).toBe('Review: yes · config/config.go has 40 importers');
  });

  test('a 200 with review:false decides skip', async () => {
    const $ = mockEngine(async () => ({
      status: 200,
      ok: true,
      headers: {},
      text: JSON.stringify({ review: false, reason: '3 files, highest importers 1' }),
    }));
    const outcome = await requestReview($, 'key', BODY);
    expect(summaryLine(outcome)).toBe('Review: skip · 3 files, highest importers 1');
  });

  test('401 is unauthorized, not a generic error', async () => {
    const $ = mockEngine(async () => ({ status: 401, ok: false, headers: {}, text: '{"ok":false,"error":"unauthorized"}' }));
    const outcome = await requestReview($, 'bad-key', BODY);
    expect(outcome).toEqual({ kind: 'unauthorized' });
    expect(summaryLine(outcome)).toBe('codemap Team: invalid license key');
  });

  test('402 is payment_required', async () => {
    const $ = mockEngine(async () => ({ status: 402, ok: false, headers: {}, text: '{}' }));
    const outcome = await requestReview($, 'key', BODY);
    expect(outcome).toEqual({ kind: 'payment_required' });
    expect(summaryLine(outcome)).toBe('codemap Team: payment required');
  });

  test('a thrown network error comes back as a quiet error outcome', async () => {
    const $ = mockEngine(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    });
    const outcome = await requestReview($, 'key', BODY);
    expect(outcome).toEqual({ kind: 'error', message: 'getaddrinfo ENOTFOUND' });
    expect(summaryLine(outcome)).toContain('codemap Team: unreachable');
  });

  test('an unparseable 200 body is an error, not a crash', async () => {
    const $ = mockEngine(async () => ({ status: 200, ok: true, headers: {}, text: 'not json' }));
    const outcome = await requestReview($, 'key', BODY);
    expect(outcome.kind).toBe('error');
  });
});

describe('languageOf', () => {
  test.each([
    ['src/email/emailService.ts', 'typescript'],
    ['config/config.go', 'go'],
    ['scripts/deploy.sh', 'bash'],
    ['Makefile', 'unknown'],
  ])('%s -> %s', (path: string, expected: string) => {
    expect(languageOf(path)).toBe(expected);
  });
});

describe('isTestPath', () => {
  test.each([
    ['blast_radius_fixes_test.go', true],
    ['cmd/config_test.go', true],
    ['src/email/emailService.test.ts', true],
    ['src/email/emailService.spec.ts', true],
    ['tests/collide.spec.js', true],
    ['src/email/emailService.ts', false],
    ['config/config.go', false],
  ])('%s -> %s', (path: string, expected: boolean) => {
    expect(isTestPath(path)).toBe(expected);
  });
});
