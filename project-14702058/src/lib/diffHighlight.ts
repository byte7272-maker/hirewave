export interface DiffToken {
  text: string;
  /** True when this token exists in the proposed text but not in the current text. */
  added: boolean;
}

const TOKEN_RE = /\s+|[^\s]+/g;

function tokenize(input: string): string[] {
  return input.match(TOKEN_RE) ?? [];
}

function isWhitespace(token: string): boolean {
  return /^\s+$/.test(token);
}

/**
 * Word-level diff between the current document text and a proposed preview.
 *
 * Returns the tokens of `next` in order, flagging the ones that are new
 * (i.e. inserted by the revision) so the preview can highlight exactly what
 * changed. Whitespace-only insertions are never flagged, so we don't render
 * invisible highlights.
 */
export function diffWords(current: string, next: string): DiffToken[] {
  const a = tokenize(current);
  const b = tokenize(next);
  const n = a.length;
  const m = b.length;

  if (m === 0) return [];
  if (n === 0) {
    return b.map((text) => ({ text, added: !isWhitespace(text) }));
  }

  const width = m + 1;
  // 0 = none, 1 = skip a (deletion), 2 = insert b (addition), 3 = match
  const dir = new Int8Array((n + 1) * width);
  let prev = new Int32Array(width);
  let curr = new Int32Array(width);

  for (let i = 1; i <= n; i += 1) {
    const ai = a[i - 1];
    const rowBase = i * width;
    for (let j = 1; j <= m; j += 1) {
      if (ai === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        dir[rowBase + j] = 3;
      } else if (prev[j] >= curr[j - 1]) {
        curr[j] = prev[j];
        dir[rowBase + j] = 1;
      } else {
        curr[j] = curr[j - 1];
        dir[rowBase + j] = 2;
      }
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
    curr.fill(0);
  }

  const out: DiffToken[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const d = i > 0 && j > 0 ? dir[i * width + j] : i > 0 ? 1 : 2;
    if (d === 3) {
      out.push({ text: b[j - 1], added: false });
      i -= 1;
      j -= 1;
    } else if (d === 1) {
      i -= 1;
    } else {
      const text = b[j - 1];
      out.push({ text, added: !isWhitespace(text) });
      j -= 1;
    }
  }
  out.reverse();
  return out;
}

/* ------------------------------------------------------------------ *
 * Forward-ordered operations + grouped "changes" for selective accept *
 * ------------------------------------------------------------------ */

export interface DiffOp {
  type: "equal" | "insert" | "delete";
  text: string;
}

/**
 * Token-level diff producing forward-ordered insert / delete / equal
 * operations. Unlike {@link diffWords} (which only flags insertions in
 * `next`), this keeps both sides so a preview can rebuild either the
 * original or the proposed text from the same operation list.
 */
export function diffOps(current: string, next: string): DiffOp[] {
  const a = tokenize(current);
  const b = tokenize(next);
  const n = a.length;
  const m = b.length;

  if (n === 0 && m === 0) return [];
  if (n === 0) return b.map((text) => ({ type: "insert", text }));
  if (m === 0) return a.map((text) => ({ type: "delete", text }));

  const width = m + 1;
  // 0 = none, 1 = skip a (deletion), 2 = insert b (addition), 3 = match
  const dir = new Int8Array((n + 1) * width);
  let prev = new Int32Array(width);
  let curr = new Int32Array(width);

  for (let i = 1; i <= n; i += 1) {
    const ai = a[i - 1];
    const rowBase = i * width;
    for (let j = 1; j <= m; j += 1) {
      if (ai === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        dir[rowBase + j] = 3;
      } else if (prev[j] >= curr[j - 1]) {
        curr[j] = prev[j];
        dir[rowBase + j] = 1;
      } else {
        curr[j] = curr[j - 1];
        dir[rowBase + j] = 2;
      }
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
    curr.fill(0);
  }

  const out: DiffOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const d = i > 0 && j > 0 ? dir[i * width + j] : i > 0 ? 1 : 2;
    if (d === 3) {
      out.push({ type: "equal", text: b[j - 1] });
      i -= 1;
      j -= 1;
    } else if (d === 1) {
      out.push({ type: "delete", text: a[i - 1] });
      i -= 1;
    } else {
      out.push({ type: "insert", text: b[j - 1] });
      j -= 1;
    }
  }
  out.reverse();
  return out;
}

/** A single, independently acceptable change inside a preview. */
export interface PreviewChange {
  id: number;
  /** Text as it reads once this change is kept (the inserted/replacement words). */
  previewText: string;
  /** Text as it reads in the original (the removed/replaced words). */
  originalText: string;
  /** Count of real (non-whitespace) words this change adds. */
  addedWords: number;
  /** Count of real (non-whitespace) words this change removes. */
  removedWords: number;
}

export type PreviewSegment =
  | { kind: "equal"; text: string }
  | { kind: "change"; changeId: number };

export interface PreviewDiff {
  segments: PreviewSegment[];
  changes: PreviewChange[];
  /** Total real words added across every change (all changes kept). */
  addedWords: number;
  /** Total real words removed across every change (all changes kept). */
  removedWords: number;
}

/**
 * Turns a current/preview pair into an ordered list of segments where every
 * contiguous run of inserted/removed tokens becomes one addressable change.
 * Kept changes render `previewText`; discarded ones fall back to
 * `originalText`, so a caller can rebuild any mix of accepted revisions.
 */
export function buildPreviewDiff(current: string, next: string): PreviewDiff {
  const ops = diffOps(current, next);
  const segments: PreviewSegment[] = [];
  const changes: PreviewChange[] = [];

  let pendingEqual = "";
  let changeOps: DiffOp[] | null = null;

  const flushEqual = () => {
    if (pendingEqual) {
      segments.push({ kind: "equal", text: pendingEqual });
      pendingEqual = "";
    }
  };

  const closeChange = () => {
    if (!changeOps) return;
    const opsInChange = changeOps;
    changeOps = null;

    let addedWords = 0;
    let removedWords = 0;
    for (const op of opsInChange) {
      if (op.type === "insert" && !isWhitespace(op.text)) addedWords += 1;
      if (op.type === "delete" && !isWhitespace(op.text)) removedWords += 1;
    }

    const previewText = opsInChange
      .filter((op) => op.type !== "delete")
      .map((op) => op.text)
      .join("");

    if (addedWords === 0 && removedWords === 0) {
      // Whitespace-only noise — fold it back in as unchanged text.
      pendingEqual += previewText;
      return;
    }

    const originalText = opsInChange
      .filter((op) => op.type !== "insert")
      .map((op) => op.text)
      .join("");

    const id = changes.length;
    changes.push({ id, previewText, originalText, addedWords, removedWords });
    flushEqual();
    segments.push({ kind: "change", changeId: id });
  };

  for (const op of ops) {
    if (op.type === "equal") {
      if (changeOps) closeChange();
      pendingEqual += op.text;
    } else {
      if (!changeOps) changeOps = [];
      changeOps.push(op);
    }
  }
  if (changeOps) closeChange();
  flushEqual();

  const addedWords = changes.reduce((sum, c) => sum + c.addedWords, 0);
  const removedWords = changes.reduce((sum, c) => sum + c.removedWords, 0);

  return { segments, changes, addedWords, removedWords };
}

/**
 * Rebuilds the preview text given which changes are discarded. Kept changes
 * contribute their `previewText`; discarded ones contribute their
 * `originalText`. With nothing discarded the result equals the proposed text;
 * with everything discarded it equals the original.
 */
export function resolvePreview(
  segments: PreviewSegment[],
  changes: PreviewChange[],
  discarded: ReadonlySet<number>
): string {
  let out = "";
  for (const seg of segments) {
    if (seg.kind === "equal") {
      out += seg.text;
    } else {
      const change = changes[seg.changeId];
      if (!change) continue;
      out += discarded.has(seg.changeId) ? change.originalText : change.previewText;
    }
  }
  return out;
}