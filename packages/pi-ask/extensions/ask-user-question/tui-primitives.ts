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
	private topLabel = "";
	private bottomLabel = "";
	private bottomRail = "";
	private framed = false;
	protected override renderTopBorder(width: number, hidden: number): string {
		this.topLabel = hidden ? ` ↑ ${hidden} more ` : "";
		return this.roundedRail(width, this.topLabel, true);
	}
	protected override renderBottomBorder(width: number, hidden: number): string {
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
			const framed = frameRows({ width, rows: lines.slice(1, bottom), inset: 1, color: "accent",
				theme: { style: (text: string) => this.borderColor(text) },
				corners: { topLeft: this.topLabel, bottomLeft: this.bottomLabel } });
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

/** Pack complete action tokens instead of silently clipping footer controls. */
export function addActionHints(lines: string[], width: number, theme: any, tokens: string[], _color = "dim"): void {
	const budget = Math.max(1, width);
	let packed = "";
	const flush = () => {
		if (packed) lines.push(truncateToWidth(theme.fg(theme.askAppearance?.hints === "muted" ? "muted" : "dim", " ".repeat(Math.max(0, Math.floor((width - visibleWidth(packed)) / 2))) + packed), width));
		packed = "";
	};
	for (const raw of tokens) {
		const token = truncateLabel(actionHint(raw), budget);
		if (packed && visibleWidth(`${packed} · ${token}`) > budget) flush();
		packed = packed ? `${packed} · ${token}` : token;
	}
	flush();
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

	render(width: number, options: ChoiceListRenderOptions = {}): string[] {
		const lines: string[] = [];
		const {
			selectedAnswers,
			inlineOtherEditor,
			showRadio = false,
		} = options;
		const showCheckboxes = selectedAnswers !== undefined && !showRadio;
		const startIndex = Math.max(
			0,
			Math.min(
				this.selectedIndex - Math.floor(this.maxVisible / 2),
				this.items.length - this.maxVisible,
			),
		);
		const endIndex = Math.min(startIndex + this.maxVisible, this.items.length);
		const maxRenderedLines = options.availableLines === undefined
			? Number.POSITIVE_INFINITY
			: Math.max(0, Math.floor(options.availableLines));

		for (let itemIndex = startIndex; itemIndex < endIndex; itemIndex++) {
			const item = this.items[itemIndex];
			const hasCursor = itemIndex === this.selectedIndex;
			const answerKey = item.id;
			const checked = selectedAnswers?.has(answerKey) ?? false;
			const customActive = item.isOther && inlineOtherEditor !== undefined;
			const visiblySelected = checked || (customActive && !showRadio);
			// Radios communicate single-select state; checkboxes remain reserved
			// for actual multi-select semantics.
			const color = visiblySelected ? "success" : hasCursor ? "accent" : "text";
			const cursorPrefix = hasCursor
				? this.theme.fg(visiblySelected ? "success" : "accent", "→ ")
				: "  ";
			const selectionPrefix = showCheckboxes
				? `${visiblySelected ? "☑" : "☐"} `
				: showRadio ? `${visiblySelected ? "●" : "○"} ` : "";
			const prefix = `${cursorPrefix}${this.theme.fg(color, `${selectionPrefix}${item.index}. `)}`;
			let label = this.theme.fg(color, item.label);
			const suggestion = item.option?.suggestion;
			if (suggestion?.basis?.trim()) label += this.theme.fg("muted", `  ${suggestionLabel(suggestion.kind)}`);

			if (item.isOther && inlineOtherEditor) {
				addWrappedWithPrefix(lines, prefix, label, width);
				// Keep the whole input frame, including its closed top/bottom edges.
				// At extreme widths, reduce the indent rather than hiding input.
				const editorIndent = " ".repeat(Math.min(visibleWidth(prefix), Math.max(0, width - 4)));
				const editorWidth = Math.max(1, width - visibleWidth(editorIndent));
				const editorLines = inlineOtherEditor.render(editorWidth);
				for (const editorLine of editorLines) {
					const safe = sanitizeEditorDisplay(editorLine);
					// Sanitization removes the editor palette. Restore only trusted frame
					// glyphs, keeping answer text and native cursor markers untouched.
					const framed = editorWidth >= 7 && /^[╭╰].*[╮╯]$/.test(safe) ? this.theme.fg("accent", safe)
						: editorWidth >= 7 && /^│.*│$/.test(safe) ? safe.replace(/^│|│$/g, (edge: string) => this.theme.fg("accent", edge))
						: safe;
					lines.push(truncateToWidth(`${editorIndent}${framed}`, width));
				}
				continue;
			}

			if (item.isOther) {
				const otherAnswer = selectedAnswers?.get("other");
				if (otherAnswer?.type === "other") {
					label += this.theme.fg("muted", ` — ${sanitizeDisplayText(otherAnswer.label)}`);
				}
			}

			if (item.isOther) {
				addWrappedWithPrefix(lines, prefix, label, width);
				const descriptionPrefix = " ".repeat(Math.min(visibleWidth(prefix), Math.max(0, width - 4)));
				const descriptionWidth = Math.max(0, width - visibleWidth(descriptionPrefix));
				lines.push(truncateToWidth(
					`${descriptionPrefix}${truncateToWidth(this.theme.fg("muted", item.description ?? ""), descriptionWidth)}`,
					width,
				));
				continue;
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
		}

		if (startIndex > 0 || endIndex < this.items.length) {
			addWrappedWithPrefix(lines, "  ", this.theme.fg("dim", `(${this.selectedIndex + 1}/${this.items.length})`), width);
		}

		if (lines.length > maxRenderedLines) {
			if (maxRenderedLines === 0) return [];
			const editorCursorLine = lines.findIndex((line) => line.includes(CURSOR_MARKER));
			const selectedLine = lines.findIndex((line) => line.includes("→"));
			const cursorLine = Math.max(0, editorCursorLine >= 0 ? editorCursorLine : selectedLine);
			const start = Math.max(0, Math.min(cursorLine - Math.floor(maxRenderedLines / 2), lines.length - maxRenderedLines));
			const visible = lines.slice(start, start + maxRenderedLines);
			if (start > 0 && start !== cursorLine) {
				visible[0] = truncateToWidth(this.theme.fg("dim", "  ↑ more"), width);
			}
			if (start + maxRenderedLines < lines.length && start + maxRenderedLines - 1 !== cursorLine) {
				visible[visible.length - 1] = truncateToWidth(this.theme.fg("dim", "  ↓ more"), width);
			}
			return visible;
		}

		return lines;
	}
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
