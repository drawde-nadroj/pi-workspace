import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { jiti, source, theme, plain, visibleWidth } from "./host.mjs";
const { parseStructured, renderStructured, structuredSummary, jsonPreview, compactLines } = await jiti.import(join(source, "output-preview.ts"));
const expanded = (input, width = 90) => renderStructured(parseStructured(input), theme, width).map(plain).join("\n");

test("compact JSON has at most two lines; expanded fields retain types and nested values", () => {
  const input = JSON.stringify({ name: "Example", ready: true, count: 12, nothing: null, rows: [{ id: 1 }, { id: 2 }], meta: { a: 1 }, empty: {}, list: [] });
  assert.deepEqual(structuredSummary(parseStructured(input)), ["JSON · 8 fields"]);
  const output = expanded(input);
  for (const pattern of [/name  "Example"/, /ready  true/, /nothing  null/, /rows  2 items/, /id  2/, /empty  \{\}/, /list  \[\]/]) assert.match(output, pattern);
});

test("bounded parser preserves exact numeric tokens, duplicate keys and dangerous-looking keys", () => {
  const input = '{"id":90071992547409931234,"decimal":1.2300,"exponent":1e+400,"negative":-0,"same":1,"same":2,"__proto__":{"polluted":true}}';
  const output = expanded(input);
  for (const value of ["90071992547409931234", "1.2300", "1e+400", "-0", "same  1", "same  2", "__proto__"]) assert.ok(output.includes(value));
  assert.equal({}.polluted, undefined);
});

test("JSONL and multiline strings become readable blocks; strings are decoded only once", () => {
  const input = JSON.stringify({ output: 'const x = "hello";\nreturn x;', literal: 'keep \\n literal', path: 'C:\\temp' }) + '\n' + JSON.stringify({ output: { output: 'finished\n', exit_code: 0 } });
  const output = expanded(input);
  assert.match(output, /Record 1/); assert.match(output, /Record 2/);
  assert.match(output, /const x = "hello"; *\n/); assert.match(output, /return x;/);
  assert.ok(output.includes('keep \\n literal')); assert.ok(output.includes('C:\\temp'));
  assert.doesNotMatch(output, /\\"hello\\"|;\\nreturn/);
  assert.deepEqual(structuredSummary(parseStructured(input)), ['2 JSON records']);
});

test("late and nested diagnostics are counted in compact output without guessing status", () => {
  const fields = Object.fromEntries(Array.from({ length: 20 }, (_, i) => ["field" + i, i]));
  const summary = structuredSummary(parseStructured(JSON.stringify({ ...fields, nested: { error: { message: "denied" }, warnings: ["slow"] } })));
  assert.match(summary[0], /2 diagnostic fields/); assert.equal(summary.length, 2);
  assert.match(summary[1], /error:/);
  assert.doesNotMatch(structuredSummary(parseStructured('{"error":null,"errors":[],"warning":false,"warnings":{}}')).join('\n'), /diagnostic/);
});

test("strict bounded grammar falls back for logs, malformed, mixed, deep and huge input", () => {
  for (const input of ['text', '42', 'true', '"value"', '{"unfinished":', '{"ok":1}\nlog', '[1,]', '{"a":1,}', '{"a":01}', '[NaN]', '[1e]', '[+1]', '["bad\nstring"]', '{"x":"\\q"}', '[1]\u00a0', '[' + ' '.repeat(256 * 1024) + ']', '['.repeat(60) + '0' + ']'.repeat(60)]) assert.equal(parseStructured(input), undefined, input.slice(0, 80));
  for (const input of ['{}', '[]', '[1,-2,0.5,1e-2,true,false,null]', '{"a":"\\u0041","b": [1,{}]}']) assert.ok(parseStructured(input), input);
});

test("controls stay inert, all widths fit, and large readable trees have an explicit cap", () => {
  const input = JSON.stringify({ ['界面'.repeat(80)]: 'long '.repeat(1000), '\u001b]52;c;secret\u0007': '\u001b[31m' });
  for (const width of [20, 36, 86]) {
    const rows = renderStructured(parseStructured(input), theme, width);
    for (const row of rows) assert.ok(visibleWidth(row) <= width);
    assert.doesNotMatch(rows.join(''), /\x1b\]52/);
    assert.ok(jsonPreview(input, theme, width).length <= 2);
  }
  const big = expanded(JSON.stringify(Array.from({ length: 4000 }, (_, i) => i)));
  assert.match(big, /Readable view capped/);
});

test("compact logs surface an explicit diagnostic before routine tail lines", () => {
  assert.deepEqual(compactLines('warning: slow\ncontext\nlast\nend', 2, true), ['warning: slow', 'end']);
  assert.deepEqual(compactLines('normal\nScript error: demo\nstack', 2), ['normal', 'Script error: demo']);
});
