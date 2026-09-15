import { describe, expect, test, beforeEach } from 'bun:test';
import * as cache from '../hooks/cache';
import type { ImportersResult } from '../hooks/types';

const HUB: ImportersResult = {
  root: '/repo',
  mode: 'importers',
  file: 'config/config.go',
  importers: ['a.go', 'b.go', 'c.go'],
  importer_count: 40,
  is_hub: true,
  coverage_status: 'complete',
};

beforeEach(() => {
  cache.clear();
});

describe('cache', () => {
  test('a fresh set is fresh for the same HEAD', () => {
    const entry = cache.set('config/config.go', HUB, 'head1');
    expect(cache.isFresh(entry, 'head1')).toBe(true);
  });

  test('an entry is stale once HEAD moves', () => {
    const entry = cache.set('config/config.go', HUB, 'head1');
    expect(cache.isFresh(entry, 'head2')).toBe(false);
  });

  test('invalidate drops the entry entirely (not just marks it stale)', () => {
    cache.set('config/config.go', HUB, 'head1');
    cache.invalidate('config/config.go');
    expect(cache.get('config/config.go')).toBeUndefined();
  });

  test('a stale entry is still readable for the "keep the last good cache" fallback', () => {
    const entry = cache.set('config/config.go', HUB, 'head1');
    expect(cache.get('config/config.go')).toBe(entry);
    expect(cache.isFresh(entry, 'head2')).toBe(false);
    // The caller decides whether to show it - cache.get still returns it.
    expect(cache.get('config/config.go')?.data.importer_count).toBe(40);
  });

  test('ageMs reflects elapsed time since fetchedAt', () => {
    const entry = cache.set('x.go', HUB, 'head1', 1000);
    expect(cache.ageMs(entry, 6000)).toBe(5000);
  });

  test('size reports the number of cached paths', () => {
    cache.set('a.go', HUB, 'head1');
    cache.set('b.go', HUB, 'head1');
    expect(cache.size()).toBe(2);
  });
});
