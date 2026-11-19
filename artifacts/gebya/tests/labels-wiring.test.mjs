// R2.1 — wiring guard.
//
// tests/labels.test.mjs proves the module reproduces the baseline. This file
// proves the app actually uses it: no literal copy ternary is left in src/,
// and every call site resolves. Added with the last wiring slice, once all
// surfaces were converted.
//
// "Copy ternary" here means exactly the R2.1 target form:
//   <lang> === 'am' ? '<string>' : '<string>'
// including the member-expression spelling (params.lang === 'am'). Ternaries
// whose branches are variables, maps, objects, numbers or function calls are
// value selection, not copy, and are intentionally still in the code; they are
// listed under "skipped" in tests/fixtures/labels-baseline.json.
//
// Run: ./node_modules/.bin/vitest run tests/labels-wiring.test.mjs
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LABELS } from '../src/labels/index.js';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const STR = String.raw`('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")`;
const TERNARY = new RegExp(
  String.raw`\b[\w$.]+\s*===\s*'am'\s*\?\s*` + STR + String.raw`\s*:\s*` + STR,
  'g',
);
const CALL = /\blabel\(\s*'([^']+)'/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(js|jsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC).filter((f) => !f.includes(join('src', 'labels')));
const texts = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

function entryFor(key) {
  return LABELS[key.split('.')[0]]?.[key];
}

describe('R2.1 labels wiring', () => {
  it('leaves no literal lang === \'am\' copy ternary in src/', () => {
    const hits = [];
    for (const [file, text] of texts) {
      TERNARY.lastIndex = 0;
      let m;
      while ((m = TERNARY.exec(text))) {
        const line = text.slice(0, m.index).split('\n').length;
        hits.push(`${file.replace(SRC, 'src')}:${line}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('routes more than a thousand call sites through the module', () => {
    let calls = 0;
    const missing = [];
    for (const [file, text] of texts) {
      CALL.lastIndex = 0;
      let m;
      while ((m = CALL.exec(text))) {
        calls += 1;
        if (!entryFor(m[1])) missing.push({ file, key: m[1] });
      }
    }
    expect(missing).toEqual([]);
    expect(calls).toBeGreaterThan(1000);
  });

  it('has a baseline entry for every wired key and vice versa', () => {
    const baseline = JSON.parse(readFileSync(join(SRC, '../tests/fixtures/labels-baseline.json'), 'utf8'));
    const baselineKeys = new Set(baseline.occurrences.map((o) => o.key));
    const moduleKeys = new Set(Object.values(LABELS).flatMap((m) => Object.keys(m)));

    const wiredButNotInBaseline = [...moduleKeys].filter((k) => !baselineKeys.has(k));
    const baselineButNoEntry = [...baselineKeys].filter((k) => !moduleKeys.has(k));
    expect(wiredButNotInBaseline).toEqual([]);
    expect(baselineButNoEntry).toEqual([]);
  });
});
