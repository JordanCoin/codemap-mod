// A hooks module's real runtime provides `h` and `Fragment` as globals (see
// the "global { const h: ... }" block in .claude/types/cc-mods.d.ts) - they
// exist only inside Claude Code's own plugin sandbox, never under `bun
// test`. This shim gives band.tsx/pane.tsx's compiled JSX (`h(tag, props,
// ...children)`) something to call so their render functions can run, and
// its output can be inspected, outside that sandbox.
//
// It does not try to replicate the real Box/Text/Button semantics beyond
// building an inspectable plain-data tree: element constructors are called
// with their props (children flattened in, nulls/false dropped) and return
// a `{ type, props }` node.

export interface MockNode {
  type: string;
  props: Record<string, unknown> & { children: unknown[] };
}

function flatten(children: unknown[]): unknown[] {
  return children.flat(Infinity as 1).filter((c) => c !== null && c !== undefined && c !== false);
}

function h(tag: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown {
  const merged = { ...(props ?? {}), children: flatten(children) };
  if (typeof tag === 'function') return tag(merged);
  return { type: String(tag), props: merged } satisfies MockNode;
}

function Fragment(props: { children?: unknown[] }): MockNode {
  return { type: 'Box', props: { children: flatten(props.children ?? []) } };
}

(globalThis as Record<string, unknown>).h = h;
(globalThis as Record<string, unknown>).Fragment = Fragment;

function makeElement(type: string) {
  return (props: Record<string, unknown>): MockNode => ({ type, props: { children: [], ...props } as MockNode['props'] });
}

/** A mock element table matching `Elements['terminal']`'s shape closely
 *  enough for band.tsx and pane.tsx: each constructor just tags its props
 *  with a `type` so tests can walk the resulting tree. */
export const mockElements = {
  Box: makeElement('Box'),
  Text: makeElement('Text'),
  Button: makeElement('Button'),
  Input: makeElement('Input'),
  Select: makeElement('Select'),
  Link: makeElement('Link'),
  Code: makeElement('Code'),
  Client: makeElement('Client'),
  Raster: makeElement('Raster'),
};

/** Concatenates every Text leaf's content and every Button's label under
 *  `node`, in tree order - what a "string-level render check" asserts
 *  against. Children *within* one Text (JSX expression pieces like
 *  `{a} · {b}`) join with no separator, since JSX already spells any space
 *  between them as its own literal string child; children *between*
 *  sibling rows (Box's own children) join with a newline. */
export function textOf(node: unknown): string {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).filter(Boolean).join('\n');
  const n = node as MockNode;
  if (n.type === 'Button') return String(n.props.label ?? '');
  if (n.type === 'Text') return textWithin(n.props.children ?? []);
  return textOf(n.props?.children ?? []);
}

function textWithin(children: unknown[]): string {
  return children
    .map((c) => (typeof c === 'string' ? c : typeof c === 'number' ? String(c) : textOf(c)))
    .join('');
}
