import type { ContextResult } from './types';

// One `codemap context` fetch (and one `--deps` fetch, for the Skyline's
// per-language file counts) per session, done at session.start, never
// during a render hook (spec section 8). Every render reads this.
let cached: ContextResult | undefined;
let languageCounts: Record<string, number> | undefined;

export function getContextCache(): ContextResult | undefined {
  return cached;
}

export function setContextCache(value: ContextResult): void {
  cached = value;
}

export function getLanguageCounts(): Record<string, number> | undefined {
  return languageCounts;
}

export function setLanguageCounts(value: Record<string, number>): void {
  languageCounts = value;
}

/** Test-only. */
export function resetContextCache(): void {
  cached = undefined;
  languageCounts = undefined;
}
