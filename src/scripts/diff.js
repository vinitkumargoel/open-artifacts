/**
 * Dependency-free diff engine for comparing two artifact versions in the
 * browser.
 *
 * This runs client-side on purpose: the Worker would otherwise spend CPU on an
 * O(ND) diff of files up to 1.5 MB, and both version bodies are already sitting
 * in the browser cache behind immutable /raw URLs.
 *
 * The repo has zero runtime dependencies and this keeps it that way.
 */

/** Myers is capped so a pathological pair degrades instead of hanging the tab. */
const MAX_EDIT_DISTANCE = 4000;

/**
 * Myers' O(ND) greedy diff over two token arrays.
 *
 * @param {string[]} a
 * @param {string[]} b
 * @param {number} maxD
 * @returns {Array<{type:'equal'|'del'|'ins', a?:string, b?:string}>|null}
 *          null when the edit distance exceeds maxD.
 */
function myers(a, b, maxD = MAX_EDIT_DISTANCE) {
  const N = a.length;
  const M = b.length;
  const max = Math.min(maxD, N + M);
  const trace = [];
  let v = new Int32Array(2 * max + 3);
  const off = max + 1;

  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) {
        x = v[off + k + 1];
      } else {
        x = v[off + k - 1] + 1;
      }
      let y = x - k;
      while (x < N && y < M && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= N && y >= M) return backtrack(trace, a, b, d, off);
    }
    v = v.slice();
  }
  return null;
}

/** Walks the saved V-arrays backwards to recover the edit script. */
function backtrack(trace, a, b, d, off) {
  const ops = [];
  let x = a.length;
  let y = b.length;

  for (let depth = d; depth > 0; depth--) {
    const v = trace[depth];
    const k = x - y;
    let prevK;
    if (k === -depth || (k !== depth && v[off + k - 1] < v[off + k + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    // trace[depth] is the V array as it stood *before* round `depth` ran, i.e.
    // the endpoints at edit distance depth-1 — so the predecessor is read from
    // this same snapshot, not from trace[depth - 1].
    const prevX = v[off + prevK];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      ops.push({ type: 'equal', a: a[x - 1], b: b[y - 1] });
      x--; y--;
    }
    if (x === prevX) {
      ops.push({ type: 'ins', b: b[y - 1] });
      y--;
    } else {
      ops.push({ type: 'del', a: a[x - 1] });
      x--;
    }
    x = prevX; y = prevY;
  }
  while (x > 0 && y > 0) {
    ops.push({ type: 'equal', a: a[x - 1], b: b[y - 1] });
    x--; y--;
  }
  while (x > 0) { ops.push({ type: 'del', a: a[--x] }); }
  while (y > 0) { ops.push({ type: 'ins', b: b[--y] }); }

  ops.reverse();
  return ops;
}

/**
 * Diffs two token arrays, trimming the common prefix and suffix first so Myers
 * only sees the region that actually changed. Falls back to a whole-block
 * replace when the two are too dissimilar to diff cheaply.
 *
 * @returns {{ops: Array, truncated: boolean}}
 */
export function diffTokens(a, b, maxD = MAX_EDIT_DISTANCE) {
  let start = 0;
  const maxStart = Math.min(a.length, b.length);
  while (start < maxStart && a[start] === b[start]) start++;

  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }

  const head = a.slice(0, start).map(line => ({ type: 'equal', a: line, b: line }));
  const tailA = a.slice(endA);
  const tail = tailA.map(line => ({ type: 'equal', a: line, b: line }));

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  let mid;
  let truncated = false;
  if (midA.length === 0 && midB.length === 0) {
    mid = [];
  } else if (midA.length === 0) {
    mid = midB.map(line => ({ type: 'ins', b: line }));
  } else if (midB.length === 0) {
    mid = midA.map(line => ({ type: 'del', a: line }));
  } else {
    mid = myers(midA, midB, maxD);
    if (mid === null) {
      truncated = true;
      mid = [
        ...midA.map(line => ({ type: 'del', a: line })),
        ...midB.map(line => ({ type: 'ins', b: line }))
      ];
    }
  }

  return { ops: [...head, ...mid, ...tail], truncated };
}

/** Splits text into lines, dropping a single trailing newline's empty tail. */
export function toLines(text) {
  const lines = String(text ?? '').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Line-level diff. @returns {{ops: Array, truncated: boolean}} */
export function diffLines(aText, bText) {
  return diffTokens(toLines(aText), toLines(bText));
}

/**
 * Splits a line into word-ish tokens, keeping whitespace and punctuation as
 * their own tokens so the reassembled string is byte-identical to the input.
 */
export function toWords(line) {
  return String(line ?? '').match(/\s+|[A-Za-z0-9_-]+|[^\s A-Za-z0-9_-]/g) || [];
}

/**
 * Word-level diff of two single lines, for highlighting what changed inside a
 * modified line rather than painting the whole line red and green.
 */
export function diffWords(aLine, bLine) {
  return diffTokens(toWords(aLine), toWords(bLine), 600).ops;
}

/**
 * Pairs up del/ins runs so the renderer can show a modified line as one row
 * with intra-line highlighting, instead of a separate delete and insert.
 *
 * @param {Array} ops - output of diffLines().ops
 * @returns {Array<{type:'equal'|'del'|'ins'|'mod', ...}>}
 */
export function pairChanges(ops) {
  const out = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].type === 'equal') { out.push(ops[i]); i++; continue; }

    const dels = [];
    const inss = [];
    while (i < ops.length && ops[i].type === 'del') dels.push(ops[i++]);
    while (i < ops.length && ops[i].type === 'ins') inss.push(ops[i++]);

    const paired = Math.min(dels.length, inss.length);
    for (let n = 0; n < paired; n++) {
      out.push({ type: 'mod', a: dels[n].a, b: inss[n].b, words: diffWords(dels[n].a, inss[n].b) });
    }
    for (let n = paired; n < dels.length; n++) out.push(dels[n]);
    for (let n = paired; n < inss.length; n++) out.push(inss[n]);
  }
  return out;
}

/** Counts additions and deletions for the summary bar. */
export function countChanges(ops) {
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.type === 'ins') added++;
    else if (op.type === 'del') removed++;
    else if (op.type === 'mod') { added++; removed++; }
  }
  return { added, removed };
}

// --- HTML pretty-printing -------------------------------------------------

/** Elements whose text content must survive re-indentation byte-for-byte. */
const RAW_TEXT = new Set(['pre', 'textarea', 'script', 'style']);
/** Void elements never open a block, so they must not increase indent depth. */
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

/**
 * Re-indents tag soup so a line diff has something to anchor on. Artifacts are
 * frequently emitted as one enormous line, which makes an unformatted line diff
 * useless.
 *
 * Both sides of a comparison go through this identically, so formatting itself
 * never registers as a change. Content inside pre/textarea/script/style is
 * passed through untouched — reformatting it would corrupt the artifact's
 * meaning and manufacture false diffs.
 *
 * @param {string} src
 * @param {string} [indent]
 * @returns {string}
 */
export function prettyHtml(src, indent = '  ') {
  const text = String(src ?? '');
  const out = [];
  let depth = 0;
  let i = 0;

  const push = (line) => {
    const trimmed = line.trim();
    if (trimmed) out.push(indent.repeat(Math.max(0, depth)) + trimmed);
  };

  while (i < text.length) {
    const lt = text.indexOf('<', i);

    if (lt === -1) { push(text.slice(i)); break; }
    if (lt > i) push(text.slice(i, lt));

    // Comments, CDATA and doctype are copied through as single units.
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      const stop = end === -1 ? text.length : end + 3;
      push(text.slice(lt, stop));
      i = stop;
      continue;
    }
    if (text.startsWith('<!', lt)) {
      const end = text.indexOf('>', lt);
      const stop = end === -1 ? text.length : end + 1;
      push(text.slice(lt, stop));
      i = stop;
      continue;
    }

    const gt = text.indexOf('>', lt);
    if (gt === -1) { push(text.slice(lt)); break; }

    const tag = text.slice(lt, gt + 1);
    const nameMatch = tag.match(/^<\/?\s*([A-Za-z][A-Za-z0-9:-]*)/);
    const name = nameMatch ? nameMatch[1].toLowerCase() : '';
    const isClose = tag.startsWith('</');
    const isSelfClosing = /\/>$/.test(tag) || VOID.has(name);

    if (isClose) depth--;
    push(tag);
    i = gt + 1;

    if (!isClose && !isSelfClosing) {
      if (RAW_TEXT.has(name)) {
        // Copy the raw body verbatim, then the closing tag, without touching
        // either. Indentation inside <pre> is semantic; inside <script> it can
        // change behaviour via template literals and ASI.
        const closeIdx = text.toLowerCase().indexOf(`</${name}`, i);
        const bodyEnd = closeIdx === -1 ? text.length : closeIdx;
        const body = text.slice(i, bodyEnd);
        if (body.length) out.push(body.replace(/\n$/, ''));
        i = bodyEnd;
      } else {
        depth++;
      }
    }
  }

  return out.join('\n');
}

/**
 * Extracts human-readable block text from an HTML string, for the prose tab —
 * the view that answers "what changed on the page" rather than "what changed in
 * the source". Browser-only: needs DOMParser.
 *
 * @param {string} html
 * @returns {string[]} one entry per block-level chunk of text
 */
export function extractText(html) {
  const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  doc.querySelectorAll('script, style, noscript, template, svg').forEach(el => el.remove());

  const blocks = [];
  const BLOCK = 'p,h1,h2,h3,h4,h5,h6,li,td,th,dt,dd,blockquote,pre,figcaption,caption,summary,label,button,option,legend';

  const seen = new Set();
  doc.body?.querySelectorAll(BLOCK).forEach(el => {
    // Skip a block that only wraps other blocks; its text is captured deeper.
    if (el.querySelector(BLOCK)) return;
    const t = el.textContent.replace(/\s+/g, ' ').trim();
    if (t && !seen.has(el)) { blocks.push(t); seen.add(el); }
  });

  if (blocks.length === 0) {
    const t = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
    if (t) blocks.push(t);
  }
  return blocks;
}
