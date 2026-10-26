import { existsSync } from "node:fs";
import { frameRail, frameRows } from "./frame.ts";
import { delimiter, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
	CombinedAutocompleteProvider,
	CURSOR_MARKER,
	Editor,
	type AutocompleteProvider,
	type EditorOptions,
	type EditorTheme,
	Key,
	type KeybindingsManager,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { suggestionLabel, type AskAnswer, type AskOption } from "./domain.ts";

// Pi 1.2 defers reverse video to the renderer. Keep the wire markers local so
// this adapter also loads on older hosts without the new named exports.
const FAKE_CURSOR_START = "\x1b_pi:fc\x07";
const FAKE_CURSOR_END = "\x1b_pi:/fc\x07";
const nativeCursor = /^\x1b_pi:fc\x07([\s\S]*?)\x1b_pi:\/fc\x07/;
const legacyCursor = /^\x1b\[7m([\s\S]*?)\x1b\[0m/;

export function sanitizeDisplayText(text: string): string {
	return text
		.replace(/\r\n?/g, "\n")
		.replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, "")
		.replace(/\x1B_[\s\S]*?(?:\x07|\x1B\\)/g, "")
		.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, " ");
}

export function sanitizeEditorDisplay(text: string): string {
	// SafeEditor removes untrusted markers before Editor creates this output, so
	// any marker here has provenance as the focused editor's IME cursor.
	const markerIndex = text.lastIndexOf(CURSOR_MARKER);
	if (markerIndex < 0) return sanitizeDisplayText(text);
	const before = sanitizeDisplayText(text.slice(0, markerIndex));
	const after = text.slice(markerIndex + CURSOR_MARKER.length);
	// Preserve only the editor-owned cursor immediately after its IME marker.
	// Pi 1.2 resolves this wrapper according to the hardware-cursor setting;
	// converting it to ANSI here would reintroduce a competing software cursor.
	const modern = nativeCursor.exec(after);
	const cursor = modern ?? legacyCursor.exec(after);
	if (!cursor) return `${before}${CURSOR_MARKER}${sanitizeDisplayText(after)}`;
	const cell = sanitizeDisplayText(cursor[1]);
	const visual = modern ? `${FAKE_CURSOR_START}${cell}${FAKE_CURSOR_END}` : `\x1b[7m${cell}\x1b[0m`;
	return `${before}${CURSOR_MARKER}${visual}${sanitizeDisplayText(after.slice(cursor[0].length))}`;
}

export function renderOptionalNote(
	lines: string[],
	width: number,
	theme: any,
	noteEditor: Editor,
	noteFocused: boolean,
	indent: number,
	noteActionFocused = false,
): void {
	const safeIndent = Math.max(2, Math.min(indent, Math.max(2, width - 1)));
	const labelPrefix = " ".repeat(Math.max(0, safeIndent - 2));
	const note = sanitizeDisplayText(noteEditor.getExpandedText());
	if (!noteFocused) {
		const action = note ? `+ Note: ${note.replace(/\n/g, " / ")}` : "+ Note";
		lines.push(truncateToWidth(`${labelPrefix}${theme.fg(noteActionFocused ? "accent" : "muted", `${noteActionFocused ? "› " : ""}${action}`)}${noteActionFocused ? theme.fg("dim", " · Enter/+ to edit") : ""}`, width));
		return;
	}

	// The + Note control stays put; an active note gets the same accent-outlined
	// SafeEditor as an answer or clarification. At narrow widths give the box
	// priority over indentation, without replacing the note's editor instance.
	lines.push(truncateToWidth(`${labelPrefix}${theme.fg("accent", theme.bold("+ Note"))}`, width));
	const editorPrefix = width - visibleWidth(labelPrefix) >= 7 ? labelPrefix : "";
	const editorWidth = Math.max(1, width - visibleWidth(editorPrefix));
	for (const editorLine of noteEditor.render(editorWidth)) {
		const safe = sanitizeEditorDisplay(editorLine);
		// Sanitization removes the editor's trusted SGR too. Restyle only its
		// perimeter after sanitizing, leaving input, cursor and interior neutral.
		const framed = editorWidth >= 7 && /^[╭╰].*[╮╯]$/.test(safe) ? theme.fg("accent", safe)
			: editorWidth >= 7 && /^│.*│$/.test(safe) ? safe.replace(/^│/, (edge: string) => theme.fg("accent", edge))
				.replace(/│$/, (edge: string) => theme.fg("accent", edge)) : safe;
		lines.push(truncateToWidth(`${editorPrefix}${framed}`, width));
	}
}

function scrubCursorMarkers(text: string): string {
	return text.replaceAll(CURSOR_MARKER, "").replaceAll(FAKE_CURSOR_START, "").replaceAll(FAKE_CURSOR_END, "");
}

/** Keep marker provenance at the shared editable-input boundary. */
export class SafeEditor extends Editor {
	protected boxed = true;
	/** Optional bound on visible content rows; the cursor row is always kept. */
	maxContentLines?: number;
	private topLabel = "";
	private bottomLabel = "";
	private bottomRail = "";
	private framed = false;
	private hiddenTop = 0;
	private hiddenBottom = 0;
	protected override renderTopBorder(width: number, hidden: number): string {
		this.hiddenTop = hidden;
		this.topLabel = hidden ? ` ↑ ${hidden} more ` : "";
		return this.roundedRail(width, this.topLabel, true);
	}
	protected override renderBottomBorder(width: number, hidden: number): string {
		this.hiddenBottom = hidden;
		this.bottomLabel = hidden ? ` ↓ ${hidden} more ` : "";
		return this.bottomRail = this.roundedRail(width, this.bottomLabel, false);
	}
	private roundedRail(width: number, label: string, top: boolean): string {
		if (width < 4) return this.borderColor("─".repeat(Math.max(0, width)));
		return frameRail({ width, left: label, side: top ? "top" : "bottom",
			surface: (text: string) => this.borderColor(text) });
	}
	override render(width: number): string[] {
		// Pi reserves one column for the cursor. A two-column grapheme cannot
		// wrap into the remaining single column at widths <= 2 (Pi 1.0.0).
		this.framed = this.boxed && width >= 7;
		const renderWidth = Math.max(1, this.framed ? width - 4 : width);
		const lines = super.render(Math.max(3, renderWidth));
		if (this.framed) {
			const bottom = lines.lastIndexOf(this.bottomRail);
			if (bottom < 1) return lines; // Unknown editor shape: do not discard input.
			const capped = this.capContent(lines.slice(1, bottom));
			const framed = frameRows({ width, rows: capped.rows, inset: 1, color: "accent",
				theme: { style: (text: string) => this.borderColor(text) },
				corners: { topLeft: capped.top, bottomLeft: capped.bottom } });
			// Suggestions follow the bottom rail and remain outside the input box.
			return [...framed, ...lines.slice(bottom + 1).map(line => `  ${line}  `)];
		}
		if (renderWidth >= 3) return lines;
		return lines.map((line) => {
			const markerIndex = line.indexOf(CURSOR_MARKER);
			if (markerIndex < 0) return truncateToWidth(line, renderWidth, "");
			const after = line.slice(markerIndex + CURSOR_MARKER.length);
			const modern = nativeCursor.exec(after);
			const cursor = modern ?? legacyCursor.exec(after);
			const cell = cursor && visibleWidth(cursor[1]) <= renderWidth ? cursor[1] : " ";
			return modern ? `${CURSOR_MARKER}${FAKE_CURSOR_START}${cell}${FAKE_CURSOR_END}` : `${CURSOR_MARKER}\x1b[7m${cell}\x1b[0m`;
		});
	}

	/** A bounded inline editor keeps the cursor's row and reports every hidden row. */
	private capContent(content: string[]): { rows: string[]; top: string; bottom: string } {
		const limit = this.maxContentLines;
		if (!limit || limit < 1 || content.length <= limit) return { rows: content, top: this.topLabel, bottom: this.bottomLabel };
		const cursorRow = content.findIndex((line) => line.includes(CURSOR_MARKER));
		const anchor = cursorRow >= 0 ? cursorRow : content.length - 1;
		const start = Math.max(0, Math.min(anchor - limit + 1, content.length - limit));
		const hiddenAbove = this.hiddenTop + start;
		const hiddenBelow = this.hiddenBottom + (content.length - start - limit);
		return {
			rows: content.slice(start, start + limit),
			top: hiddenAbove ? ` ↑ ${hiddenAbove} more ` : "",
			bottom: hiddenBelow ? ` ↓ ${hiddenBelow} more ` : "",
		};
	}

	override handleMouse(event: Parameters<Editor["handleMouse"]>[0]) {
		return super.handleMouse(this.framed ? { ...event, x: event.x - 2, width: Math.max(1, event.width - 4) } : event);
	}

	override setText(text: string): void {
		super.setText(scrubCursorMarkers(text));
	}

	override insertTextAtCursor(text: string): void {
		super.insertTextAtCursor(scrubCursorMarkers(text));
	}

	override handleInput(data: string): void {
		super.handleInput(scrubCursorMarkers(data));
	}
}

/** Build the complete editor palette from the active question UI theme. */
export function questionEditorTheme(theme: any): EditorTheme {
	return {
		borderColor: (text) => theme.fg("accent", text),
		selectList: {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		},
	};
}

function fileProvider(cwd: string): AutocompleteProvider {
	const binary = process.platform === "win32" ? "fd.exe" : "fd";
	const fdPath = [join(getAgentDir(), "bin", binary), ...(process.env.PATH ?? "").split(delimiter).map((dir) => join(dir, binary))]
		.find((path) => existsSync(path));
	const provider = new CombinedAutocompleteProvider([], cwd, fdPath);
	// Question fields are not command prompts. Only @ references trigger suggestions.
	return {
		triggerCharacters: ["@"],
		getSuggestions: (lines, row, col, options) =>
			/(?:^|\s)@(?:"[^"]*|[^\s"]*)$/.test(lines[row].slice(0, col))
				? provider.getSuggestions(lines, row, col, options)
				: Promise.resolve(null),
		applyCompletion: provider.applyCompletion.bind(provider),
	};
}

/** Give the open completion menu priority over form navigation and submission. */
export function handleFileCompletion(editor: Editor | undefined, data: string): boolean {
	if (!editor?.isShowingAutocomplete()) return false;
	if (![Key.tab, Key.enter, Key.escape, Key.up, Key.down].some((key) => matchesKey(data, key))) return false;
	editor.handleInput(data);
	return true;
}

export function createQuestionEditor(tui: any, theme: any, options: EditorOptions = { paddingX: 0 }, cwd = process.cwd()): SafeEditor {
	const editor = new SafeEditor(tui, questionEditorTheme(theme), options);
	editor.setAutocompleteProvider(fileProvider(cwd));
	return editor;
}

/** Note edits are committed or discarded by the owning form, not by Editor. */
export function createNoteEditor(tui: any, theme: any, cwd = process.cwd()): Editor {
	const editor = new SafeEditor(tui, questionEditorTheme(theme), { paddingX: 0 });
	editor.setAutocompleteProvider(fileProvider(cwd));
	// Enter/Tab save a note; Ctrl+C/Esc discard an edit. Shift+Enter/Ctrl+J
	// insert new lines; Ctrl/Alt+Enter submits the question form.
	editor.disableSubmit = true;
	return editor;
}

/** Familiar key glyphs only; keep action words and Ctrl/Esc readable. */
export function actionHint(token: string): string {
	return token.replace(/Shift\+Enter/g, "⇧↵").replace(/Enter/g, "↵");
}

/** Hints are one vocabulary: a destructive close is never the same tone as a plain navigation key. */
export type HintTone = "default" | "accent" | "error";
export type HintToken = string | { label: string; tone?: HintTone };

/** Only the two theme facts a hint row reads; keeps this helper independent of the host theme type. */
export interface HintTheme {
	fg(role: string, text: string): string;
	askAppearance?: { hints?: "dim" | "muted" };
}

function hintStyle(theme: HintTheme, tone: HintTone = "default"): (text: string) => string {
	if (tone === "error") return (text: string) => theme.fg("error", text);
	if (tone === "accent") return (text: string) => theme.fg("accent", text);
	return (text: string) => theme.fg(theme.askAppearance?.hints === "muted" ? "muted" : "dim", text);
}

/** Pack complete action tokens instead of silently clipping footer controls. */
export function addActionHints(lines: string[], width: number, theme: any, tokens: HintToken[]): void {
	const budget = Math.max(1, width);
	const separator = hintStyle(theme, "default")(" · ");
	const separatorCells = visibleWidth(" · ");
	let styled: string[] = [];
	let cells = 0;
	const flush = () => {
		if (!styled.length) return;
		const pad = " ".repeat(Math.max(0, Math.floor((width - cells) / 2)));
		lines.push(truncateToWidth(`${pad}${styled.join(separator)}`, width));
		styled = [];
		cells = 0;
	};
	for (const entry of tokens) {
		const label = typeof entry === "string" ? entry : entry.label;
		const text = truncateLabel(actionHint(label), budget);
		const tokenCells = visibleWidth(text);
		if (!tokenCells) continue;
		// A token that cannot share a row keeps its own truncated row.
		if (styled.length && cells + separatorCells + tokenCells > budget) flush();
		if (styled.length) cells += separatorCells;
		styled.push(hintStyle(theme, typeof entry === "string" ? "default" : entry.tone)(text));
		cells += tokenCells;
	}
	flush();
}

/** Say what is about to be lost, in counts, instead of a generic "unsaved work". */
export function countSummary(counts: Array<{ count: number; one: string; many: string }>): string {
	const parts = counts.filter((entry) => entry.count > 0).map((entry) => `${entry.count} ${entry.count === 1 ? entry.one : entry.many}`);
	return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
}

/**
 * One close-confirmation banner for every Ask surface. The word "Discard" and the
 * ⚠ mark carry the meaning; the error tone only reinforces it.
 */
export function renderDismissBanner(lines: string[], width: number, theme: HintTheme, summary: string, keepDraft = false): void {
	addWrapped(lines, theme.fg("error", keepDraft ? "⚠ Close this question and keep your draft?" : `⚠ Discard ${summary} and close?`), width);
	addActionHints(lines, width, theme, [
		{ label: keepDraft ? "Enter/Esc Close and keep draft" : "Enter/Esc Discard and close", tone: "error" },
		"N Keep editing",
	]);
}

export function normalizeFocusCycleKey(data: string): string {
	return matchesKey(data, Key.shift("tab")) ? "\t" : data;
}

export function isSubmitEnter(data: string): boolean {
	return matchesKey(data, Key.enter) && !matchesKey(data, Key.ctrl("j"));
}

/** Ctrl+? with Ctrl+/ as an equivalent enhanced-terminal encoding. */
export function isAskAgentKey(data: string): boolean {
	return matchesKey(data, Key.ctrl("?"))
		|| matchesKey(data, Key.ctrl("/"));
}

/** A multiline free-text question with an inline optional note. */
export function addWrappedWithPrefix(
	lines: string[],
	prefix: string,
	text: string,
	width: number,
	continuationPrefix = " ".repeat(visibleWidth(prefix)),
): void {
	const renderWidth = Math.max(1, width);
	const prefixWidth = visibleWidth(prefix);

	// Extremely narrow terminals cannot reserve the prefix separately. Wrapping
	// the combined content still honors the component's hard width contract.
	if (prefixWidth >= renderWidth) {
		for (const line of wrapTextWithAnsi(`${prefix}${text}`, renderWidth)) {
			lines.push(truncateToWidth(line, renderWidth));
		}
		return;
	}

	const wrapped = wrapTextWithAnsi(text, renderWidth - prefixWidth);
	for (let i = 0; i < wrapped.length; i++) {
		const linePrefix = i === 0 ? prefix : continuationPrefix;
		lines.push(truncateToWidth(`${linePrefix}${wrapped[i]}`, renderWidth));
	}
}

/** Render a label and its optional paragraph with the same hanging geometry. */
export function addWrappedOption(
	lines: string[],
	prefix: string,
	label: string,
	description: string | undefined,
	width: number,
	descriptionPrefix = " ".repeat(visibleWidth(prefix)),
	continuationPrefix = " ".repeat(visibleWidth(prefix)),
): void {
	addWrappedWithPrefix(lines, prefix, label, width, continuationPrefix);
	if (description) {
		addWrappedWithPrefix(lines, descriptionPrefix, description, width, descriptionPrefix);
	}
}

export type ChoiceListAction = "changed" | "confirm" | "cancel" | "unhandled";

export interface WrappedChoiceItem {
	/** Stable cursor identity; option values are allowed to collide. */
	id: string;
	index: number;
	label: string;
	description?: string;
	option?: AskOption;
	isOther: boolean;
}

export interface ChoiceListRenderOptions {
	/** Presence of this map enables checkbox rendering, even when it is empty. */
	selectedAnswers?: ReadonlyMap<string, AskAnswer>;
	/** Render the native multiline editor directly beneath the Other choice. */
	inlineOtherEditor?: Editor;
	/** Single-select lists show an explicit radio independently of the cursor. */
	showRadio?: boolean;
	/** Host-computed line budget after all surrounding chrome is reserved. */
	availableLines?: number;
}

/** Line counts for one list at one width; the host reserves the difference from its panel. */
export interface ChoiceListMeasure {
	/** Every item with its description and suggestion rationale. */
	full: number;
	/** Focused item in full, every other item as one label row. */
	compressed: number;
	/** Pinned inline-editor block, which is chrome rather than a row inside the window. */
	tail: number;
}

/** Tallest "focused in full, everything else one label row" arrangement. */
function compressedHeight(full: string[][], label: string[][]): number {
	const labelTotal = label.reduce((sum, rows) => sum + rows.length, 0);
	return full.reduce((best, rows, focused) => Math.max(best, labelTotal - label[focused].length + rows.length), 0);
}

/**
 * Owns every coupled piece of option-list behavior: cursor movement, the
 * item-count window, and ANSI-aware multiline rendering. Keeping those rules
 * behind one interface prevents navigation and presentation from drifting.
 *
 * Answer persistence and the custom-answer Input deliberately remain with the
 * host question flow; they have different submit semantics in each mode.
 */
export class WrappedChoiceList {
	private readonly items: WrappedChoiceItem[];
	private readonly maxVisible: number;
	private readonly keybindings: KeybindingsManager;
	private readonly theme: any;
	private selectedIndex = 0;
	/** First visible choice row while the pinned custom-answer editor is open. */
	private optionScroll = 0;

	constructor(
		options: AskOption[],
		otherLabel: string,
		maxVisible: number,
		keybindings: KeybindingsManager,
		theme: any,
	) {
		this.keybindings = keybindings;
		this.theme = theme;
		this.items = options.map((option, index) => ({
			id: `option:${index}`,
			index: index + 1,
			label: sanitizeDisplayText(option.label),
			description: option.description ? sanitizeDisplayText(option.description) : undefined,
			option,
			isOther: false,
		}));
		this.items.push({
			id: "other",
			index: options.length + 1,
			label: otherLabel,
			description: "Write your own answer.",
			isOther: true,
		});

		this.maxVisible = Math.max(1, Math.min(maxVisible, this.items.length));
	}

	get length(): number {
		return this.items.length;
	}

	get selectedItem(): WrappedChoiceItem {
		return this.items[this.selectedIndex];
	}

	setSelectedIndex(index: number): void {
		this.selectedIndex = Math.max(0, Math.min(index, this.items.length - 1));
	}

	selectOther(): void {
		this.selectedIndex = this.items.findIndex((item) => item.isOther);
	}

	/** Apply only list-level bindings; hosts retain mode-specific key precedence. */
	handleInput(data: string): ChoiceListAction {
		if (this.keybindings.matches(data, "tui.select.up")) {
			this.selectedIndex = this.selectedIndex === 0 ? this.items.length - 1 : this.selectedIndex - 1;
			return "changed";
		}
		if (this.keybindings.matches(data, "tui.select.down")) {
			this.selectedIndex = this.selectedIndex === this.items.length - 1 ? 0 : this.selectedIndex + 1;
			return "changed";
		}
		if (this.keybindings.matches(data, "tui.select.confirm")) return "confirm";
		if (this.keybindings.matches(data, "tui.select.cancel")) return "cancel";
		return "unhandled";
	}

	/** The height-driven choice window used while a custom answer is being typed. */
	scrollOptions(lines: number): boolean {
		const next = Math.max(0, this.optionScroll + lines);
		if (next === this.optionScroll) return false;
		this.optionScroll = next;
		return true;
	}

	resetOptionScroll(): void {
		this.optionScroll = 0;
	}

	/** Prefix cells for one row; the editor indent reuses the Other row's geometry. */
	private prefixFor(item: WrappedChoiceItem, hasCursor: boolean, visiblySelected: boolean, showCheckboxes: boolean, showRadio: boolean): string {
		// Radios communicate single-select state; checkboxes remain reserved
		// for actual multi-select semantics.
		const color = visiblySelected ? "success" : hasCursor ? "accent" : "text";
		const cursorPrefix = hasCursor ? this.theme.fg(visiblySelected ? "success" : "accent", "→ ") : "  ";
		const selectionPrefix = showCheckboxes
			? `${visiblySelected ? "☑" : "☐"} `
			: showRadio ? `${visiblySelected ? "●" : "○"} ` : "";
		return `${cursorPrefix}${this.theme.fg(color, `${selectionPrefix}${item.index}. `)}`;
	}

	/**
	 * One row group. `full` keeps the description and the suggestion rationale;
	 * `label` is the single-row-per-item form used when the region is tight.
	 */
	private renderItem(itemIndex: number, width: number, selectedAnswers: ReadonlyMap<string, AskAnswer> | undefined, showCheckboxes: boolean, showRadio: boolean, customActive: boolean, detail: "full" | "label" = "full"): string[] {
		const lines: string[] = [];
		const item = this.items[itemIndex];
		const hasCursor = itemIndex === this.selectedIndex;
		const visiblySelected = (selectedAnswers?.has(item.id) ?? false) || (customActive && !showRadio);
		const prefix = this.prefixFor(item, hasCursor, visiblySelected, showCheckboxes, showRadio);
		let label = this.theme.fg(visiblySelected ? "success" : hasCursor ? "accent" : "text", item.label);
		const suggestion = item.option?.suggestion;
		if (suggestion?.basis?.trim()) label += this.theme.fg("muted", `  ${suggestionLabel(suggestion.kind)}`);

		if (item.isOther) {
			const otherAnswer = selectedAnswers?.get("other");
			if (otherAnswer?.type === "other") label += this.theme.fg("muted", ` — ${sanitizeDisplayText(otherAnswer.label)}`);
			addWrappedWithPrefix(lines, prefix, label, width);
			// The inline editor replaces the generic description line beneath this row.
			if (customActive || detail === "label") return lines;
			const descriptionPrefix = " ".repeat(Math.min(visibleWidth(prefix), Math.max(0, width - 4)));
			const descriptionWidth = Math.max(0, width - visibleWidth(descriptionPrefix));
			lines.push(truncateToWidth(
				`${descriptionPrefix}${truncateToWidth(this.theme.fg("muted", item.description ?? ""), descriptionWidth)}`,
				width,
			));
			return lines;
		}

		if (detail === "label") {
			addWrappedWithPrefix(lines, prefix, label, width);
			return lines;
		}

		const wrappedPrefix = " ".repeat(visibleWidth(prefix));
		addWrappedOption(
			lines, prefix, label,
			item.description ? this.theme.fg("muted", item.description) : undefined,
			width, wrappedPrefix, wrappedPrefix,
		);
		if (suggestion?.basis?.trim()) {
			addWrappedWithPrefix(lines, wrappedPrefix, this.theme.fg("muted", `Why: ${sanitizeDisplayText(suggestion.basis)}`), width, wrappedPrefix);
			if (suggestion.caveat) addWrappedWithPrefix(lines, wrappedPrefix, this.theme.fg("muted", `Caveat: ${sanitizeDisplayText(suggestion.caveat)}`), width, wrappedPrefix);
		}
		return lines;
	}

	/** Both renderings of every item, computed once so counts and output agree. */
	private blocks(width: number, options: ChoiceListRenderOptions): { full: string[][]; label: string[][] } {
		const { selectedAnswers, showRadio = false } = options;
		const showCheckboxes = selectedAnswers !== undefined && !showRadio;
		return {
			full: this.items.map((_item, index) => this.renderItem(index, width, selectedAnswers, showCheckboxes, showRadio, false, "full")),
			label: this.items.map((_item, index) => this.renderItem(index, width, selectedAnswers, showCheckboxes, showRadio, false, "label")),
		};
	}

	/** The custom answer's editor is pinned chrome, not a row inside the choice window. */
	private renderInlineEditor(editor: Editor, width: number, showCheckboxes: boolean, showRadio: boolean, selectedAnswers: ReadonlyMap<string, AskAnswer> | undefined): string[] {
		const lines: string[] = [];
		const other = this.items[this.items.length - 1];
		const prefix = this.prefixFor(other, other === this.selectedItem, true, showCheckboxes, showRadio);
		// Keep the whole input frame, including its closed top/bottom edges.
		// At extreme widths, reduce the indent rather than hiding input.
		const editorIndent = " ".repeat(Math.min(visibleWidth(prefix), Math.max(0, width - 4)));
		const editorWidth = Math.max(1, width - visibleWidth(editorIndent));
		for (const editorLine of editor.render(editorWidth)) {
			const safe = sanitizeEditorDisplay(editorLine);
			// Sanitization removes the editor palette. Restore only trusted frame
			// glyphs, keeping answer text and native cursor markers untouched.
			const framed = editorWidth >= 7 && /^[╭╰].*[╮╯]$/.test(safe) ? this.theme.fg("accent", safe)
				: editorWidth >= 7 && /^│.*│$/.test(safe) ? safe.replace(/^│|│$/g, (edge: string) => this.theme.fg("accent", edge))
				: safe;
			lines.push(truncateToWidth(`${editorIndent}${framed}`, width));
		}
		// The answer's own label sits directly above the pinned editor.
		return [...this.renderItem(this.items.length - 1, width, selectedAnswers, showCheckboxes, showRadio, true), ...lines];
	}

	/**
	 * Line counts for each rendering, so a host can reserve chrome before it renders.
	 * Pure: unlike `render` it never clamps `optionScroll`.
	 */
	measure(width: number, options: ChoiceListRenderOptions = {}): ChoiceListMeasure {
		const { full, label } = this.blocks(width, options);
		const inlineOtherEditor = options.inlineOtherEditor;
		if (inlineOtherEditor) {
			// The Other row lives in the pinned tail, so only the options above it count.
			const { selectedAnswers, showRadio = false } = options;
			const showCheckboxes = selectedAnswers !== undefined && !showRadio;
			const tail = this.renderInlineEditor(inlineOtherEditor, width, showCheckboxes, showRadio, selectedAnswers).length;
			return {
				full: full.slice(0, -1).reduce((sum, rows) => sum + rows.length, 0),
				compressed: label.slice(0, -1).reduce((sum, rows) => sum + rows.length, 0),
				tail,
			};
		}
		const fullTotal = full.reduce((sum, rows) => sum + rows.length, 0);
		return { full: fullTotal, compressed: compressedHeight(full, label), tail: 0 };
	}

	/**
	 * Render inside a host-computed row budget:
	 * 1. every item in full;
	 * 2. the focused item in full and the rest as label rows;
	 * 3. a block window that keeps the focused item whole;
	 * 4. a line window when the focused item alone exceeds the region.
	 */
	render(width: number, options: ChoiceListRenderOptions = {}): string[] {
		const { selectedAnswers, inlineOtherEditor, showRadio = false } = options;
		const showCheckboxes = selectedAnswers !== undefined && !showRadio;
		const maxRenderedLines = options.availableLines === undefined
			? Number.POSITIVE_INFINITY
			: Math.max(0, Math.floor(options.availableLines));

		// Reserve the Other row and the editor first: a window anchored at the editor
		// cursor hides the first options exactly when the user needs to reach them.
		if (inlineOtherEditor) {
			const tail = this.renderInlineEditor(inlineOtherEditor, width, showCheckboxes, showRadio, selectedAnswers);
			const budget = Math.max(0, maxRenderedLines - tail.length);
			const choices = this.items.slice(0, -1);
			const full = choices.flatMap((_item, index) => this.renderItem(index, width, selectedAnswers, showCheckboxes, showRadio, false, "full"));
			// Roomy: the options keep their descriptions and rationale above the editor.
			if (full.length <= budget) return [...full, ...tail];
			const optionLines = choices.flatMap((_item, index) => this.renderItem(index, width, selectedAnswers, showCheckboxes, showRadio, false, "label"));
			const window = fitLineWindow(optionLines.length, budget, this.optionScroll);
			this.optionScroll = window.start;
			const rows = optionLines.slice(window.start, window.start + window.count);
			if (window.above) rows.unshift(truncateToWidth(this.theme.fg("dim", `  ↑ ${window.start} more · Alt+↑`), width));
			if (window.below) rows.push(truncateToWidth(this.theme.fg("dim", `  ↓ ${optionLines.length - window.start - window.count} more · Alt+↓`), width));
			return [...rows, ...tail];
		}

		if (maxRenderedLines !== Number.POSITIVE_INFINITY) {
			if (maxRenderedLines === 0) return [];
			const { full, label } = this.blocks(width, options);
			const fullTotal = full.reduce((sum, rows) => sum + rows.length, 0);
			if (fullTotal <= maxRenderedLines) return full.flat();
			const compressed = compressedHeight(full, label);
			const rows = compressed <= maxRenderedLines
				? this.promoteToFull(full, label, maxRenderedLines)
				: this.windowBlocks(full, label, width, maxRenderedLines);
			while (rows.length < maxRenderedLines) rows.push("");
			return rows;
		}

		const lines: string[] = [];
		const startIndex = Math.max(
			0,
			Math.min(
				this.selectedIndex - Math.floor(this.maxVisible / 2),
				this.items.length - this.maxVisible,
			),
		);
		const endIndex = Math.min(startIndex + this.maxVisible, this.items.length);

		for (let itemIndex = startIndex; itemIndex < endIndex; itemIndex++) {
			lines.push(...this.renderItem(itemIndex, width, selectedAnswers, showCheckboxes, showRadio, false));
		}

		if (startIndex > 0 || endIndex < this.items.length) {
			addWrappedWithPrefix(lines, "  ", this.theme.fg("dim", `(${this.selectedIndex + 1}/${this.items.length})`), width);
		}

		return lines;
	}

	/** Focused item in full, the rest as label rows, plus neighbours promoted while they fit. */
	private promoteToFull(full: string[][], label: string[][], budget: number): string[] {
		const detailed = this.items.map((_item, index) => index === this.selectedIndex);
		const assemble = () => detailed.flatMap((isFull, index) => (isFull ? full[index] : label[index]));
		let rows = assemble();
		// Nearest to the cursor first, below before above: the next choice is the likelier target.
		for (let distance = 1; distance < this.items.length; distance++) {
			for (const index of [this.selectedIndex + distance, this.selectedIndex - distance]) {
				if (index < 0 || index >= this.items.length || detailed[index]) continue;
				const gain = full[index].length - label[index].length;
				if (gain <= 0 || rows.length + gain > budget) continue;
				detailed[index] = true;
				rows = assemble();
			}
		}
		return rows;
	}

	/** Keep the focused block whole; count every hidden item with a marker on its own side. */
	private windowBlocks(full: string[][], label: string[][], width: number, budget: number): string[] {
		const marker = (text: string) => truncateToWidth(this.theme.fg("dim", text), width);
		for (let markers = 0; markers <= 2; markers++) {
			const visible = budget - markers;
			if (visible <= 0) break;
			let start = this.selectedIndex, end = this.selectedIndex + 1;
			let used = full[this.selectedIndex].length;
			if (used > visible) break;
			while (end < this.items.length && used + full[end].length <= visible) { used += full[end].length; end++; }
			while (start > 0 && used + full[start - 1].length <= visible) { used += full[start - 1].length; start--; }
			const fullStart = start, fullEnd = end;
			// A row a neighbouring full block cannot use still fits that choice's label:
			// spend it there instead of padding, nearest to the cursor first.
			while (end < this.items.length && used + label[end].length <= visible) { used += label[end].length; end++; }
			while (start > 0 && used + label[start - 1].length <= visible) { used += label[start - 1].length; start--; }
			const above = start > 0, below = end < this.items.length;
			if ((above ? 1 : 0) + (below ? 1 : 0) !== markers) continue;
			const rows: string[] = [];
			if (above) rows.push(marker(`  ↑ ${start} more`));
			for (let index = start; index < fullStart; index++) rows.push(...label[index]);
			for (let index = fullStart; index < fullEnd; index++) rows.push(...full[index]);
			for (let index = fullEnd; index < end; index++) rows.push(...label[index]);
			if (below) rows.push(marker(`  ↓ ${this.items.length - end} more`));
			return rows;
		}
		// One block taller than the region: head the region with the focused block so the
		// cursor stays readable, and count the lines it cannot show.
		const ordered = [
			...full[this.selectedIndex],
			...this.items.flatMap((_item, index) => (index === this.selectedIndex ? [] : label[index])),
		];
		const window = fitLineWindow(ordered.length, budget, 0);
		const rows = ordered.slice(window.start, window.start + window.count);
		if (window.above) rows.unshift(marker(`  ↑ ${window.start} more lines`));
		if (window.below) rows.push(marker(`  ↓ ${ordered.length - window.start - window.count} more lines`));
		return rows;
	}
}

export interface LineWindow {
	/** Index of the first content row shown. */
	start: number;
	/** Content rows shown; a marker never replaces one of these. */
	count: number;
	/** The caller prints one marker row above the content. */
	above: boolean;
	/** The caller prints one marker row below the content. */
	below: boolean;
}

/**
 * Fit `total` content rows into a region `rows` tall, where every clipped side is
 * named by a marker that spends one of the region's own rows.
 *
 * `requested` is the caller's scroll offset. The largest window whose hidden sides
 * are all accounted for wins, so `count + markers <= rows` always holds and no
 * content row is ever overwritten. A region too short for a marker beside content
 * (`rows` <= 2 with rows hidden on both sides) slides without markers; the host's
 * own key hints name those rows.
 */
export function fitLineWindow(total: number, rows: number, requested: number): LineWindow {
	const content = Math.max(0, Math.floor(total));
	const region = Math.max(0, Math.floor(rows));
	const offset = Math.max(0, Math.floor(requested));
	if (region === 0 || content === 0) return { start: 0, count: 0, above: false, below: false };
	if (content <= region) return { start: 0, count: content, above: false, below: false };
	const slide = (count: number) => Math.min(offset, Math.max(0, content - count));
	for (let markers = 0; markers <= 2; markers++) {
		const visible = region - markers;
		if (visible <= 0) continue;
		const start = slide(visible);
		const above = start > 0;
		const below = start + visible < content;
		if ((above ? 1 : 0) + (below ? 1 : 0) === markers) return { start, count: visible, above, below };
	}
	const count = Math.min(content, region);
	return { start: slide(count), count, above: false, below: false };
}

export function constrainFrameHeight(lines: string[], terminalRows: number | undefined, tailLines = 2): void {
	if (terminalRows === undefined || lines.length <= terminalRows) return;
	const keepTail = Math.min(Math.max(0, tailLines), terminalRows);
	const cursorLine = lines.findIndex((line) => line.includes(CURSOR_MARKER));
	const bodyEnd = lines.length - keepTail;

	if (cursorLine >= 0 && cursorLine < bodyEnd) {
		const bodyBudget = terminalRows - keepTail;
		const start = Math.max(0, Math.min(cursorLine - bodyBudget + 1, bodyEnd - bodyBudget));
		lines.splice(0, lines.length, ...lines.slice(start, start + bodyBudget), ...lines.slice(bodyEnd));
		return;
	}

	const removeAt = Math.max(0, terminalRows - keepTail);
	lines.splice(removeAt, lines.length - terminalRows);
}

export function addWrapped(lines: string[], text: string, width: number, indent = ""): void {
	addWrappedWithPrefix(lines, indent, text, width, indent);
}

/** Keep model-provided progress labels compact as well as terminal-safe. */
export function sanitizeProgressLabel(text: string): string {
	return sanitizeDisplayText(text).replace(/[\t\n]/g, " ");
}

/** Truncate semantic labels by grapheme without pi-tui's three-dot suffix. */
export function truncateLabel(text: string, width: number): string {
	if (width <= 0) return "";
	if (visibleWidth(text) <= width) return text;
	if (width === 1) return "…";

	let result = "";
	const Segmenter = (Intl as any).Segmenter;
	const graphemes: string[] = Segmenter
		? Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(text), (part: any) => part.segment)
		: Array.from(text);
	for (const grapheme of graphemes) {
		if (visibleWidth(result + grapheme) > width - 1) break;
		result += grapheme;
	}
	return `${result}…`;
}
