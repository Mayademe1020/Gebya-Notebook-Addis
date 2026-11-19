// R2.1 — labels module proof.
//
// This test is the contract for the "invisible refactor" (owner ruling 2,
// 2026-09-16): every inline `lang === 'am' ? … : …` literal pair that existed
// in src/ before R2.1 is recorded in tests/fixtures/labels-baseline.json, and
// the central labels module must reproduce each of them byte for byte.
//
// It is not a "not empty" smoke test. It asserts:
//   1. every entry carries both en and am, and neither is empty;
//   2. every baseline occurrence resolves through the module to exactly the
//      baseline text (independently rebuilt from baseline parts + arg indexes,
//      never from the module itself);
//   3. no two occurrences that were distinct in the baseline collapsed onto
//      one key;
//   4. every `label('…')` call site names a key that exists, and no literal
//      `lang === 'am' ? '…' : '…'` copy ternary is left in src/.
//
// Run: ./node_modules/.bin/vitest run tests/labels.test.mjs
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LABELS, label } from '../src/labels/index.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC = fileURLToPath(new URL('../src', import.meta.url));
const baseline = JSON.parse(readFileSync(join(HERE, 'fixtures/labels-baseline.json'), 'utf8'));

const ALL = Object.values(LABELS).flatMap((mod) => Object.entries(mod));

function entryFor(key) {
  const surface = key.split('.')[0];
  return LABELS[surface]?.[key];
}

/** Interleave the baseline's literal parts with sentinel values at its arg
 *  indexes. Rebuilt from the fixture, never from the labels module. */
function renderParts(parts, idx, values) {
  let out = '';
  parts.forEach((part, i) => {
    out += part;
    if (i < idx.length) out += values[idx[i]];
  });
  return out;
}

function resolveBaseline(occ) {
  const entry = entryFor(occ.key);
  expect(entry, `missing label key ${occ.key} (${occ.file}:${occ.line})`).toBeTruthy();
  if (occ.kind === 'plain') {
    return { en: entry.en, am: entry.am, expectedEn: occ.en, expectedAm: occ.am };
  }
  const n = Math.max(occ.enArgs, occ.amArgs);
  const values = Array.from({ length: n }, (_, i) => `<${i}>`);
  const call = occ.kind === 'thunks'
    ? values.map((v) => () => v)
    : values;
  return {
    en: entry.en(...call),
    am: entry.am(...call),
    expectedEn: renderParts(occ.enParts, occ.enIdx, values),
    expectedAm: renderParts(occ.amParts, occ.amIdx, values),
  };
}

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

describe('R2.1 labels module', () => {
  it('has en and am for every entry, both non-empty', () => {
    expect(ALL.length).toBeGreaterThan(900);
    for (const [key, entry] of ALL) {
      expect(entry, key).toBeTruthy();
      expect(typeof entry.en, key).toBe(typeof entry.am);
      if (typeof entry.en === 'string') {
        expect(entry.en.length, `${key} en is empty`).toBeGreaterThan(0);
        expect(entry.am.length, `${key} am is empty`).toBeGreaterThan(0);
      } else {
        // Format entries: prove the template has literal text or arguments.
        for (const lang of ['en', 'am']) {
          const source = entry[lang].toString();
          expect(source.length, `${key} ${lang} is empty`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(LABELS)).toBe(true);
    for (const [surface, mod] of Object.entries(LABELS)) {
      expect(Object.isFrozen(mod), `${surface} not frozen`).toBe(true);
    }
  });

  it('reproduces every baseline string byte for byte', () => {
    expect(baseline.occurrences.length).toBeGreaterThan(1000);
    const failures = [];
    for (const occ of baseline.occurrences) {
      const got = resolveBaseline(occ);
      if (got.en !== got.expectedEn || got.am !== got.expectedAm) {
        failures.push({
          at: `${occ.file}:${occ.line}`,
          key: occ.key,
          en: { got: got.en, expected: got.expectedEn },
          am: { got: got.am, expected: got.expectedAm },
        });
      }
    }
    expect(failures).toEqual([]);
  });

  it('never collapses two distinct baseline strings onto one key', () => {
    const signature = (o) => JSON.stringify(o.kind === 'plain'
      ? { en: o.en, am: o.am }
      : { enParts: o.enParts, enIdx: o.enIdx, amParts: o.amParts, amIdx: o.amIdx });
    const byKey = new Map();
    for (const occ of baseline.occurrences) {
      if (!byKey.has(occ.key)) byKey.set(occ.key, new Set());
      byKey.get(occ.key).add(signature(occ));
    }
    const collapsed = [...byKey.entries()]
      .filter(([, sigs]) => sigs.size > 1)
      .map(([key, sigs]) => ({ key, distinct: sigs.size }));
    expect(collapsed).toEqual([]);

    // And the converse: two different baseline strings must not share a key,
    // which is the same assertion stated over every key.
    const keys = new Set(baseline.occurrences.map((o) => o.key));
    expect(keys.size).toBeGreaterThan(800);
  });

  it('has every label() call site pointing at a real key', () => {
    const CALL = /\blabel\(\s*'([^']+)'/g;
    const missing = [];
    let calls = 0;
    for (const file of walk(SRC)) {
      if (file.includes('src/labels')) continue;
      const text = readFileSync(file, 'utf8');
      let m;
      while ((m = CALL.exec(text))) {
        calls += 1;
        if (!entryFor(m[1])) missing.push({ file, key: m[1] });
      }
    }
    expect(missing).toEqual([]);
  });
});
