import { describe, it, expect } from 'vitest';
import {
  diffLines, diffTokens, diffWords, toLines, toWords,
  pairChanges, countChanges, prettyHtml
} from '../src/scripts/diff.js';

/** Reassembles the "before" side from an edit script. */
const rebuildA = ops => ops.filter(o => o.type === 'equal' || o.type === 'del').map(o => o.a);
/** Reassembles the "after" side from an edit script. */
const rebuildB = ops => ops.filter(o => o.type === 'equal' || o.type === 'ins').map(o => o.b);

describe('diffTokens — correctness invariant', () => {
  const cases = [
    [[], []],
    [['a'], []],
    [[], ['a']],
    [['a', 'b', 'c'], ['a', 'b', 'c']],
    [['a', 'b', 'c'], ['a', 'x', 'c']],
    [['a', 'b', 'c'], ['c', 'b', 'a']],
    [['a', 'b', 'c', 'd'], ['b', 'd']],
    [['x'], ['a', 'b', 'c', 'd', 'e']],
    [['the', 'quick', 'brown', 'fox'], ['the', 'slow', 'brown', 'dog', 'jumps']],
    [Array.from({ length: 60 }, (_, i) => `l${i}`),
     Array.from({ length: 60 }, (_, i) => (i % 7 === 0 ? `changed${i}` : `l${i}`))]
  ];

  it.each(cases.map((c, i) => [i, c[0], c[1]]))(
    'case %i reconstructs both sides exactly', (_i, a, b) => {
      const { ops } = diffTokens(a, b);
      expect(rebuildA(ops)).toEqual(a);
      expect(rebuildB(ops)).toEqual(b);
    });

  it('produces a minimal script for a single substitution', () => {
    const { ops } = diffTokens(['a', 'b', 'c'], ['a', 'x', 'c']);
    expect(countChanges(ops)).toEqual({ added: 1, removed: 1 });
  });

  it('reports no changes for identical input', () => {
    const { ops, truncated } = diffTokens(['a', 'b'], ['a', 'b']);
    expect(countChanges(ops)).toEqual({ added: 0, removed: 0 });
    expect(truncated).toBe(false);
  });

  it('degrades to a block replace instead of hanging when too dissimilar', () => {
    const a = Array.from({ length: 400 }, (_, i) => `alpha-${i}`);
    const b = Array.from({ length: 400 }, (_, i) => `beta-${i}`);
    const { ops, truncated } = diffTokens(a, b, 10);
    expect(truncated).toBe(true);
    // Even the fallback must round-trip both sides.
    expect(rebuildA(ops)).toEqual(a);
    expect(rebuildB(ops)).toEqual(b);
  });

  it('trims a shared prefix and suffix around a small middle change', () => {
    const a = [...Array(500).fill('same'), 'OLD', ...Array(500).fill('tail')];
    const b = [...Array(500).fill('same'), 'NEW', ...Array(500).fill('tail')];
    const { ops } = diffTokens(a, b);
    expect(countChanges(ops)).toEqual({ added: 1, removed: 1 });
  });
});

describe('toLines / diffLines', () => {
  it('drops only the trailing newline, not a genuine blank last line', () => {
    expect(toLines('a\nb\n')).toEqual(['a', 'b']);
    expect(toLines('a\nb\n\n')).toEqual(['a', 'b', '']);
    expect(toLines('')).toEqual(['']);
  });

  it('diffs real text', () => {
    const { ops } = diffLines('one\ntwo\nthree\n', 'one\n2\nthree\n');
    expect(countChanges(ops)).toEqual({ added: 1, removed: 1 });
  });
});

describe('toWords / diffWords', () => {
  it('tokenizes losslessly', () => {
    for (const s of ['hello world', '  a,b.c  ', 'foo_bar-baz 123', '<div class="x">', '']) {
      expect(toWords(s).join('')).toBe(s);
    }
  });

  it('isolates the changed word inside a line', () => {
    const ops = diffWords('the quick brown fox', 'the slow brown fox');
    const changed = ops.filter(o => o.type !== 'equal').map(o => o.a ?? o.b);
    expect(changed).toContain('quick');
    expect(changed).toContain('slow');
    expect(changed).not.toContain('brown');
  });
});

describe('pairChanges', () => {
  it('collapses a matching del/ins run into modified rows with word detail', () => {
    const { ops } = diffLines('alpha\nbeta\n', 'alpha\nbetta\n');
    const paired = pairChanges(ops);
    const mods = paired.filter(o => o.type === 'mod');
    expect(mods).toHaveLength(1);
    expect(mods[0].a).toBe('beta');
    expect(mods[0].b).toBe('betta');
    expect(mods[0].words.length).toBeGreaterThan(0);
  });

  it('leaves unbalanced runs as plain deletes and inserts', () => {
    const { ops } = diffLines('a\nb\nc\n', 'a\n');
    const paired = pairChanges(ops);
    expect(paired.filter(o => o.type === 'del')).toHaveLength(2);
    expect(paired.filter(o => o.type === 'mod')).toHaveLength(0);
  });

  it('counts a modified row as one addition and one removal', () => {
    const { ops } = diffLines('x\n', 'y\n');
    expect(countChanges(pairChanges(ops))).toEqual({ added: 1, removed: 1 });
  });
});

describe('prettyHtml', () => {
  it('breaks a single-line document into indented lines', () => {
    const out = prettyHtml('<html><body><div><p>hi</p></div></body></html>');
    expect(out.split('\n').length).toBeGreaterThan(4);
    expect(out).toContain('    <div>');
  });

  it('is idempotent — formatting never shows up as a diff', () => {
    const src = '<div><p>one</p><p>two</p></div>';
    expect(prettyHtml(prettyHtml(src))).toBe(prettyHtml(src));
  });

  it('leaves script bodies byte-for-byte intact', () => {
    // Reindenting inside a template literal would change what the page renders.
    const src = '<script>const t = `line1\nline2`;\nif (a)\n  b();</script>';
    const out = prettyHtml(src);
    expect(out).toContain('const t = `line1\nline2`;');
    expect(out).toContain('if (a)\n  b();');
  });

  it('leaves pre and textarea content intact', () => {
    const out = prettyHtml('<pre>  indented\n    more</pre>');
    expect(out).toContain('  indented\n    more');
  });

  it('does not indent after void elements', () => {
    const out = prettyHtml('<div><br><img src="x"><span>a</span></div>');
    const span = out.split('\n').find(l => l.includes('<span>'));
    const br = out.split('\n').find(l => l.includes('<br>'));
    expect(span.match(/^\s*/)[0]).toBe(br.match(/^\s*/)[0]);
  });

  it('passes comments and doctype through as single units', () => {
    const out = prettyHtml('<!DOCTYPE html><!-- a\nmulti line --><p>x</p>');
    expect(out).toContain('<!DOCTYPE html>');
    expect(out).toContain('<!-- a\nmulti line -->');
  });

  it('survives malformed markup without throwing', () => {
    for (const bad of ['<div', '<!-- unclosed', 'plain text', '<<>>', '</orphan>', '']) {
      expect(() => prettyHtml(bad)).not.toThrow();
    }
  });

  it('makes a minified change diffable', () => {
    const v1 = '<html><body><h1>Title</h1><p>alpha</p></body></html>';
    const v2 = '<html><body><h1>Title</h1><p>beta</p></body></html>';
    const raw = diffLines(v1, v2);
    const pretty = diffLines(prettyHtml(v1), prettyHtml(v2));
    // Unformatted: the whole document is one line, so the diff says "everything".
    expect(countChanges(raw.ops)).toEqual({ added: 1, removed: 1 });
    expect(toLines(v1)).toHaveLength(1);
    // Formatted: only the paragraph moves.
    expect(countChanges(pretty.ops)).toEqual({ added: 1, removed: 1 });
    expect(prettyHtml(v1).split('\n').length).toBeGreaterThan(4);
  });
});

describe('diffTokens — randomized round-trip', () => {
  // Deterministic PRNG so a failure is reproducible from the seed.
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  it('reconstructs both sides for 300 random token pairs', () => {
    const rand = rng(20260906);
    const alphabet = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (let trial = 0; trial < 300; trial++) {
      const len = Math.floor(rand() * 40);
      const a = Array.from({ length: len }, () => alphabet[Math.floor(rand() * alphabet.length)]);
      // Mutate a into b with random inserts, deletes and substitutions.
      const b = [];
      for (const tok of a) {
        const r = rand();
        if (r < 0.15) continue;                                       // delete
        if (r < 0.30) b.push(alphabet[Math.floor(rand() * alphabet.length)]); // substitute
        else b.push(tok);
        if (rand() < 0.12) b.push(alphabet[Math.floor(rand() * alphabet.length)]); // insert
      }
      const { ops } = diffTokens(a, b);
      const ra = ops.filter(o => o.type !== 'ins').map(o => o.a);
      const rb = ops.filter(o => o.type !== 'del').map(o => o.b);
      expect({ trial, a: ra }).toEqual({ trial, a });
      expect({ trial, b: rb }).toEqual({ trial, b });
    }
  });

  it('pairChanges preserves the reconstruction too', () => {
    const rand = rng(7);
    for (let trial = 0; trial < 100; trial++) {
      const a = Array.from({ length: Math.floor(rand() * 30) }, () => String(Math.floor(rand() * 5)));
      const b = Array.from({ length: Math.floor(rand() * 30) }, () => String(Math.floor(rand() * 5)));
      const paired = pairChanges(diffTokens(a, b).ops);
      const ra = paired.filter(o => o.type !== 'ins').map(o => o.a);
      const rb = paired.filter(o => o.type !== 'del').map(o => o.b);
      expect({ trial, v: ra }).toEqual({ trial, v: a });
      expect({ trial, v: rb }).toEqual({ trial, v: b });
    }
  });
});
