import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getKeybindings, visibleWidth } from "@earendil-works/pi-tui";
import { askText, askSingleChoice, askMultiChoice } from "../extensions/ask-user-question/standalone-ui.ts";
import { TabbedQuestions } from "../extensions/ask-user-question/batch-ui.ts";
import { sanitizeDisplayText } from "../extensions/ask-user-question/tui-primitives.ts";

const theme = { fg: (_: string, text: string) => text, bg: (_: string, text: string) => text, bold: (text: string) => text };
const keys = { tab: "\t", enter: "\r", escape: "\x1b", down: "\x1b[B", ask: "\x1b[47;5u" };
async function waitFor(check: () => boolean) {
	for (let i = 0; i < 100; i++) {
		if (check()) return;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	assert.fail("file suggestions did not appear");
}

for (const batch of [false, true]) {
	for (const field of ["answer", "note", "single-other", "multi-other", "clarification"] as const) {
		test(`${batch ? "batch" : "standalone"}: @ completion in ${field} retains form ownership`, async () => {
			const cwd = mkdtempSync(join(tmpdir(), "pi-ask-files-"));
			try {
				mkdirSync(join(cwd, "nested"));
				writeFileSync(join(cwd, "nested", "unique-file.ts"), "fixture");
				let result: any;
				let component: any;
				const tui = { terminal: { rows: 50 }, requestRender() {} };
				const options = [{ label: "One", value: "one" }];
				const mode = field === "single-other" ? "single-select" : field === "multi-other" ? "multi-select" : "text";
				if (batch) {
					component = new TabbedQuestions([{ question: "Answer?", label: "Answer", mode, options: mode === "text" ? [] : options }], tui, theme, getKeybindings(), (value) => { result = value; }, cwd);
				} else {
					const ctx: any = { cwd, ui: { custom(factory: any) {
						component = factory(tui, theme, getKeybindings(), (value: any) => { result = value; });
						return Promise.resolve(null);
					} } };
					if (mode === "text") void askText(ctx, "Answer?", undefined);
					else if (mode === "single-select") void askSingleChoice(ctx, "Answer?", undefined, options);
					else void askMultiChoice(ctx, "Answer?", undefined, options);
				}
				component.focused = true;
				if (field === "note") { component.handleInput(keys.tab); component.handleInput(keys.enter); }
				if (field.endsWith("other")) {
					component.handleInput(keys.down);
					component.handleInput(keys.enter);
				}
				if (field === "clarification") component.handleInput(keys.ask);
				const render = () => component.render(100).map(sanitizeDisplayText).join("\n");
				component.handleInput("@nested/unique");
				render(); // Render before async results to catch stale host caches.
				await waitFor(() => render().includes("unique-file.ts"));
				component.handleInput(keys.escape);
				assert.equal(result, undefined, "Escape dismisses suggestions, not the form");
				component.handleInput("-");
				await waitFor(() => render().includes("unique-file.ts"));
				component.handleInput(field === "note" ? keys.tab : keys.enter);
				assert.equal(result, undefined, "accepting a file must not submit");
				assert.match(render(), /@nested\/unique-file\.ts/);
				component.handleInput("still-editing");
				assert.match(render(), /still-editing/, "completion keeps focus in the input");
				for (const width of [12, 40, 100]) {
					for (const line of component.render(width)) assert.ok(visibleWidth(line) <= width);
				}
			} finally { await rm(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
		});
	}
}
