import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CURSOR_MARKER, getKeybindings, visibleWidth } from "@earendil-works/pi-tui";
import { askAppearanceDefaults, readAskAppearance, safeAskTitle, savedAskAppearance } from "../extensions/ask-user-question/appearance.ts";
import { questionPreview } from "../extensions/ask-user-question/question-preview.ts";
import { askText } from "../extensions/ask-user-question/standalone-ui.ts";

const theme: any = { appearance: "dark", colors: { muted: "#888888", text: "#eeeeee" },
  fg: (_role: string, text: string) => text, bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
  style: (text: string) => text };

test("Ask appearance is versioned, bounded and migrates the legacy label setting only as a fallback", () => {
  assert.equal(readAskAppearance(undefined, "hierarchy")?.labels, "hierarchy");
  assert.equal(readAskAppearance({ version: 1, labels: "matched" }, "hierarchy")?.labels, "matched");
  assert.equal(readAskAppearance({ version: 2 }, "hierarchy"), undefined);
  assert.equal(readAskAppearance({ version: 1, title: "\x1b[31mAsk\u202e界面\x1b[0m" })?.title, "Ask 界面");
  assert.equal(safeAskTitle("x".repeat(100)).length, 30);
  const bad = readAskAppearance({ version: 1, titlePosition: "bottomLeft", progressPosition: "topLeft", questionText: "invisible", hints: "flash" });
  assert.deepEqual(bad, askAppearanceDefaults());
});

test("standalone Ask reads persisted visual preferences without Home and safely falls back", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-ask-style-")), previous = process.env.PI_CODING_AGENT_DIR;
  try {
    process.env.PI_CODING_AGENT_DIR = dir;
    writeFileSync(join(dir, "pi-footer.json"), JSON.stringify({ questionLabels: "hierarchy", ask: { version: 1, title: "Ask me", progressPosition: "bottomRight" } }));
    assert.equal(savedAskAppearance().title, "Ask me");
    assert.equal(savedAskAppearance().progressPosition, "bottomRight");
    writeFileSync(join(dir, "pi-footer.json"), "not json");
    assert.deepEqual(savedAskAppearance(), askAppearanceDefaults());
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("standalone question applies saved presentation without changing focus or answering the preview", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-ask-live-style-")), previous = process.env.PI_CODING_AGENT_DIR;
  try {
    process.env.PI_CODING_AGENT_DIR = dir;
    writeFileSync(join(dir, "pi-footer.json"), JSON.stringify({ ask: { version: 1, title: "My questions", titlePosition: "topCenter", progressPosition: "bottomRight", questionText: "normal", hints: "muted" } }));
    let panel: any;
    const signal = new AbortController();
    const tui: any = { terminal: { rows: 32, columns: 90 }, requestRender() {} };
    const ctx: any = { cwd: dir, ui: { custom(factory: any) { return new Promise(resolve => { panel = factory(tui, theme, getKeybindings(), resolve); panel.focused = true; }); } } };
    const pending = askText(ctx, "Real question 界面?", undefined, signal.signal);
    const rows = panel.render(90);
    assert.match(stripVTControlCharacters(rows[0]), /My questions/);
    assert.match(stripVTControlCharacters(rows.at(-1)), /1 of 1/);
    const questionRow = rows.find((row: string) => row.includes("Real question"));
    assert.ok(questionRow && !questionRow.includes("\x1b[1m"), "only emphasis changes, not the question itself");
    assert.equal(rows.join("").split(CURSOR_MARKER).length - 1, 1);
    signal.abort();
    assert.equal(await pending, null);
    panel.dispose();
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("synthetic Ask preview has bounded, visible hit targets across widths and positions", () => {
  for (const position of ["bottomLeft", "bottomCenter", "bottomRight"] as const) for (const width of [1, 9, 12, 24, 40, 90]) {
    const style = { ...askAppearanceDefaults(), title: "Questions 界面", titlePosition: "topCenter" as const, progressPosition: position, questionText: "normal" as const, hints: "muted" as const };
    const { rows, hits } = questionPreview(theme, width, style);
    assert.ok(rows.every(row => visibleWidth(row) <= width));
    assert.ok(hits.every(hit => hit.x >= 0 && hit.x + hit.width <= width && hit.y >= 0 && hit.y < rows.length));
    for (const hit of hits) assert.ok(stripVTControlCharacters(rows[hit.y]).length > 0);
    if (width < 10) assert.deepEqual(hits, []);
    if (width >= 90) assert.deepEqual(hits.map(hit => hit.id), ["title", "progress", "body", "hint"]);
  }
});
