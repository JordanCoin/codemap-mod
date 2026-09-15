import type { EngineInterface } from 'claude-code';

// Never run more than 2 codemap/git child processes at once (spec: "Cap
// concurrent processes at 2"). One shared semaphore for every process this
// mod spawns, codemap and git alike.
const MAX_CONCURRENT = 2;
let inFlight = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    const next = waiting.shift();
    if (next) next();
  }
}

export type RunOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; kind: 'missing'; error: string }
  | { ok: false; kind: 'error'; error: string };

/**
 * Runs `argv` with a shared 2-process cap and a timeout, parsing stdout as
 * JSON on a clean exit. Never throws: every failure comes back as a tagged
 * outcome so callers can tell "codemap isn't installed" from "this run
 * failed" (spec section 7, Failure paths).
 */
export async function runJSON<T>(
  $: EngineInterface,
  argv: readonly string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<RunOutcome<T>> {
  return withSlot(async () => {
    let result: { exitCode: number; stdout: string; stderr: string };
    try {
      result = await $.process.run(argv, {
        cwd: opts.cwd,
        timeoutMs: opts.timeoutMs ?? 10_000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const kind = /enoent|not found|no such file/i.test(message) ? 'missing' : 'error';
      return { ok: false, kind, error: message };
    }
    if (result.exitCode !== 0) {
      return { ok: false, kind: 'error', error: result.stderr.trim() || `exit ${result.exitCode}` };
    }
    try {
      return { ok: true, data: JSON.parse(result.stdout) as T };
    } catch {
      return { ok: false, kind: 'error', error: 'invalid JSON output' };
    }
  });
}

/** Runs `argv` and returns trimmed stdout on a clean exit, or undefined on
 *  any failure (missing binary, non-zero exit, timeout). For plain-text
 *  output (`codemap --version`, `git diff --numstat`) where there is no
 *  JSON to parse and callers only need a best-effort string. */
export async function runText($: EngineInterface, argv: readonly string[], cwd: string, timeoutMs = 5000): Promise<string | undefined> {
  const r = await withSlot(() => $.process.run(argv, { cwd, timeoutMs }).catch(() => undefined));
  if (!r || r.exitCode !== 0) return undefined;
  return r.stdout.trim();
}

export async function gitHead($: EngineInterface, cwd: string): Promise<string | undefined> {
  const r = await withSlot(() => $.process.run(['git', 'rev-parse', 'HEAD'], { cwd, timeoutMs: 5000 }).catch(() => undefined));
  if (!r || r.exitCode !== 0) return undefined;
  return r.stdout.trim();
}

export async function isGitRepo($: EngineInterface, cwd: string): Promise<boolean> {
  const r = await withSlot(() =>
    $.process.run(['git', 'rev-parse', '--is-inside-work-tree'], { cwd, timeoutMs: 5000 }).catch(() => undefined),
  );
  return !!r && r.exitCode === 0 && r.stdout.trim() === 'true';
}
