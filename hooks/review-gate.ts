import type { EngineInterface } from 'claude-code';
import { REVIEW_GATE_URL } from './names';
import { runText } from './process';
import { state } from './session-state';
import type { Coverage } from './types';

export interface ChangedFile {
  path: string;
  importers: number;
  is_hub: boolean;
  is_test: boolean;
  language: string;
  added: number;
  removed: number;
}

export interface ReviewGateRequest {
  repo: string;
  /** The branch's open PR when `gh` finds one; null for a branch with no PR yet. */
  pr: number | null;
  base_sha: string;
  head_sha: string;
  codemap_version: string;
  changed: ChangedFile[];
  coverage: { status: Coverage; notes: string[] };
  collide: null;
  caps: { changed_total: number; changed_measured: number };
}

export type ReviewGateOutcome =
  /** `reason` is the first fact, for one-line surfaces; `facts` holds all of
   *  them (the fired rules on review, the skip facts otherwise). */
  | { kind: 'decided'; review: boolean; reason: string; facts: string[]; limits: string[]; policy: string }
  | { kind: 'unauthorized' }
  | { kind: 'payment_required' }
  | { kind: 'error'; message: string };

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  go: 'go',
  py: 'python',
  rb: 'ruby',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  rs: 'rust',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
};

export function languageOf(path: string): string {
  const basename = path.split('/').pop() ?? path;
  const dot = basename.lastIndexOf('.');
  if (dot <= 0) return 'unknown'; // no extension, or a dotfile with none (".gitignore")
  const ext = basename.slice(dot + 1).toLowerCase();
  return LANGUAGE_BY_EXT[ext] ?? ext;
}

const TEST_PATTERN = /(^|\/)(tests?|__tests__)\/|[._-](test|spec)\.[a-z]+$|_test\.[a-z]+$/i;

export function isTestPath(path: string): boolean {
  return TEST_PATTERN.test(path);
}

/** Posts the session's changed-file counts to the keyed review-gate
 *  endpoint. Sends only paths and counts, never file contents (spec
 *  section 6, Pro and MIT line). */
export async function requestReview(
  $: EngineInterface,
  licenseKey: string,
  body: ReviewGateRequest,
): Promise<ReviewGateOutcome> {
  let response;
  try {
    response = await $.http.fetch(REVIEW_GATE_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${licenseKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }

  if (response.status === 401) return { kind: 'unauthorized' };
  if (response.status === 402) return { kind: 'payment_required' };
  if (!response.ok) return { kind: 'error', message: `HTTP ${response.status}` };

  try {
    // The API answers {review, reasons:[{rule, fact}], skip_reasons:[{fact}],
    // policy:{name, version}, limits:[string]} (codemap-brief-webhook lib/gate.js).
    const data = JSON.parse(response.text) as {
      review?: unknown;
      reasons?: Array<{ fact?: unknown }>;
      skip_reasons?: Array<{ fact?: unknown }>;
      policy?: { name?: unknown; version?: unknown };
      limits?: unknown[];
    };
    const review = data.review === true;
    const source = review ? data.reasons : data.skip_reasons;
    const facts = (Array.isArray(source) ? source : [])
      .map((r) => (typeof r?.fact === 'string' ? r.fact : ''))
      .filter(Boolean);
    const limits = (Array.isArray(data.limits) ? data.limits : []).filter((l): l is string => typeof l === 'string');
    const policy = typeof data.policy?.name === 'string' ? `${data.policy.name} v${String(data.policy.version ?? '?')}` : 'unknown policy';
    const reason = facts[0] ?? `the ${policy} returned no facts`;
    return { kind: 'decided', review, reason, facts, limits, policy };
  } catch {
    return { kind: 'error', message: 'invalid JSON response' };
  }
}

/** Builds the review-gate request body from the session's touched-file
 *  cache: only paths and counts leave the machine, never file contents
 *  (spec section 6). Diff sizes come from one `git diff --numstat` call
 *  covering every touched path. */
export async function buildRequest(
  $: EngineInterface,
  cwd: string,
  repo: string,
  baseSha: string,
  headSha: string,
): Promise<ReviewGateRequest> {
  const touched = [...state.touched.values()];
  const version = (await runText($, ['codemap', '--version'], cwd)) ?? 'unknown';
  // The branch's open PR, when there is one. gh missing or no PR both give null.
  const prText = await runText($, ['gh', 'pr', 'view', '--json', 'number', '--jq', '.number'], cwd);
  const prNumber = Number.parseInt(prText?.trim() ?? '', 10);
  const pr = Number.isInteger(prNumber) && prNumber > 0 ? prNumber : null;
  const numstatOut = touched.length
    ? await runText($, ['git', 'diff', '--numstat', `${baseSha}..${headSha}`, '--', ...touched.map((t) => t.path)], cwd)
    : undefined;
  const diffByPath = new Map<string, { added: number; removed: number }>();
  for (const line of numstatOut?.split('\n') ?? []) {
    const [added, removed, path] = line.split('\t');
    if (path) diffByPath.set(path, { added: Number(added) || 0, removed: Number(removed) || 0 });
  }

  let measured = 0;
  const changed: ChangedFile[] = touched.map((t) => {
    const diff = diffByPath.get(t.path);
    if (t.importerCount > 0 || t.isHub) measured++;
    return {
      path: t.path,
      importers: t.importerCount,
      is_hub: t.isHub,
      is_test: isTestPath(t.path),
      language: languageOf(t.path),
      added: diff?.added ?? 0,
      removed: diff?.removed ?? 0,
    };
  });
  // A file with no cached importer data still counts toward the total but
  // not toward "measured" (spec: caps.changed_measured).
  const coverage: Coverage = touched.length === 0 || touched.length === measured ? 'complete' : 'partial';

  return {
    repo,
    pr,
    base_sha: baseSha,
    head_sha: headSha,
    codemap_version: version,
    changed,
    coverage: { status: coverage, notes: [] },
    collide: null,
    caps: { changed_total: touched.length, changed_measured: measured },
  };
}

/** The one line the pane and the turn summary show for a decision (spec:
 *  `Review: yes · config/config.go has 40 importers` / `Review: skip · 3
 *  files, highest importers 1`). */
export function summaryLine(outcome: ReviewGateOutcome): string {
  switch (outcome.kind) {
    case 'decided':
      return `Review: ${outcome.review ? 'yes' : 'skip'} · ${outcome.reason}${outcome.facts.length > 1 ? ` · +${outcome.facts.length - 1} more` : ''}`;
    case 'unauthorized':
      return 'codemap Team: invalid license key';
    case 'payment_required':
      return 'codemap Team: payment required';
    case 'error':
      return `codemap Team: unreachable · ${outcome.message}`;
  }
}
