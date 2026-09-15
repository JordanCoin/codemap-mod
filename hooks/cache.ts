import type { ImportersResult } from './types';

export interface CacheEntry {
  data: ImportersResult;
  head: string;
  fetchedAt: number;
}

// Per-file cache keyed by path, invalidated on edits to that file and on
// HEAD change (spec section 8). One process per session, so a module-level
// Map is the whole cache: no cross-session persistence is required or
// wanted (codemap's answer for a path is only ever as fresh as the HEAD it
// was measured against).
const entries = new Map<string, CacheEntry>();

export function get(path: string): CacheEntry | undefined {
  return entries.get(path);
}

export function isFresh(entry: CacheEntry, currentHead: string): boolean {
  return entry.head === currentHead;
}

export function ageMs(entry: CacheEntry, now = Date.now()): number {
  return now - entry.fetchedAt;
}

export function set(path: string, data: ImportersResult, head: string, now = Date.now()): CacheEntry {
  const entry: CacheEntry = { data, head, fetchedAt: now };
  entries.set(path, entry);
  return entry;
}

export function invalidate(path: string): void {
  entries.delete(path);
}

export function clear(): void {
  entries.clear();
}

export function size(): number {
  return entries.size;
}
