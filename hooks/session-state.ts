import type { BlastRadiusResult, CollideResult } from './types';
import type { ReviewGateOutcome } from './review-gate';

export interface TouchedFile {
  path: string;
  importerCount: number;
  isHub: boolean;
}

export interface SessionState {
  /** Set once codemap is confirmed missing; stops further spawn attempts. */
  codemapMissing: boolean;
  /** True once the band has shown its one "codemap not found" line
   *  (spec: "then silence"). */
  codemapMissingNoticeShown: boolean;
  /** Set once the cwd is confirmed not a git repo; hides the band. */
  notGitRepo: boolean;
  /** Files this mod has seen an Edit/Write/MultiEdit/NotebookEdit tool.check
   *  for this session, keyed by path (spec: "files touched this session"). */
  touched: Map<string, TouchedFile>;
  /** The one file whose importer list "Attach importers" will add to the
   *  next prompt, consumed once (spec: diff mod's attach-once pattern). */
  armedAttachPath: string | undefined;
  /** HEAD at session start, the ref blast-radius diffs against. */
  sessionStartHead: string | undefined;
  lastBlastRadius: BlastRadiusResult | undefined;
  lastCollide: CollideResult | undefined;
  lastRefreshError: string | undefined;
  lastRefreshAt: number | undefined;
  lastReviewOutcome: ReviewGateOutcome | undefined;
  /** True once the settings-file scan for classic "codemap hook" shell
   *  hooks has run, so it only runs once per session. */
  classicHookScanned: boolean;
  classicHookDetected: boolean;
}

function fresh(): SessionState {
  return {
    codemapMissing: false,
    codemapMissingNoticeShown: false,
    notGitRepo: false,
    touched: new Map(),
    armedAttachPath: undefined,
    sessionStartHead: undefined,
    lastBlastRadius: undefined,
    lastCollide: undefined,
    lastRefreshError: undefined,
    lastRefreshAt: undefined,
    lastReviewOutcome: undefined,
    classicHookScanned: false,
    classicHookDetected: false,
  };
}

export let state: SessionState = fresh();

/** Test-only: give each test its own state instead of sharing the module
 *  singleton (a session's hooks module is loaded once per session, so
 *  production code never needs this). */
export function resetState(): void {
  state = fresh();
}

export function recordTouched(path: string, importerCount: number, isHub: boolean): void {
  state.touched.set(path, { path, importerCount, isHub });
}

export function topTouched(limit: number): TouchedFile[] {
  return [...state.touched.values()].sort((a, b) => b.importerCount - a.importerCount).slice(0, limit);
}
