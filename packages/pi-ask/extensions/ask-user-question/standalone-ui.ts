import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, type KeybindingsManager, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { AskAnswer, AskOption, AnswerWithNote, ClarificationRequest, RegenerateRequest, SkipRequest } from "./domain.ts";
import { frameQuestion, questionViewport, questionTheme } from "./question-surface.ts";
import { savedAskAppearance } from "./appearance.ts";
import { answerSelectionKey, getOtherLabel, sortAnswers } from "./domain.ts";
import { handleFileCompletion, addActionHints, countSummary, renderDismissBanner, addWrapped, constrainFrameHeight, createNoteEditor, createQuestionEditor, isAskAgentKey, isSubmitEnter, normalizeFocusCycleKey, renderOptionalNote, sanitizeDisplayText, sanitizeEditorDisplay, WrappedChoiceList, type HintToken, type WrappedChoiceItem } from "./tui-primitives.ts";

export function customWithAbort<T>(ctx: ExtensionContext, signal: AbortSignal | undefined, factory: (tui: any, theme: any, keybindings: KeybindingsManager, done: (value: T) => void) => any): Promise<T> {
	let removeAbort = () => {};
	return ctx.ui.custom<T>((tui: any, theme: any, keybindings: KeybindingsManager, done) => {
		let settled = false;
		const finish = (value: T) => {
			if (settled) return;
			settled = true;
			removeAbort();
			done(value);
		};
		const abort = () => finish(null as T);
		removeAbort = () => signal?.removeEventListener("abort", abort);
		signal?.addEventListener("abort", abort, { once: true });
		const palette = questionTheme(theme, savedAskAppearance());
		const component = factory(questionViewport(tui), palette, keybindings, finish);
		if (signal?.aborted) abort();
		return frameQuestion(component, palette, tui);
	}, { overlay: false }).finally(() => removeAbort());
}

function createClarificationEditor(tui: any, theme: any, done: (result: ClarificationRequest) => void, setUnderlyingFocus: (focused: boolean) => void, cwd: string) {
	const editor = createQuestionEditor(tui, theme, undefined, cwd);
	let active = false;
	let feedback = "";
	return {
		get active() { return active; },
		/** Text typed and then left with Escape; it reappears on reopen, so closing may lose it. */
		text() { return editor.getExpandedText().trim(); },
		setFocused(focused: boolean) { editor.focused = focused && active; },
		open() { active = true; feedback = ""; setUnderlyingFocus(false); editor.focused = true; tui.requestRender(); },
		render(width: number) {
			const lines: string[] = [];
			addWrapped(lines, theme.fg("text", "What are you wondering about?"), width, " ");
			for (const line of editor.render(Math.max(1, width - 2))) lines.push(truncateToWidth(` ${sanitizeEditorDisplay(line)}`, width));
			if (feedback) lines.push(truncateToWidth(theme.fg("warning", ` ${feedback}`), width));
			lines.push(truncateToWidth(theme.fg("dim", " Enter ask • Esc back"), width));
			return lines;
		},
		handle(data: string) {
			if (handleFileCompletion(editor, data)) { tui.requestRender(); return; }
			if (matchesKey(data, Key.escape)) { active = false; editor.focused = false; feedback = ""; setUnderlyingFocus(true); tui.requestRender(); return; }
			if (isSubmitEnter(data)) {
				const value = editor.getExpandedText().trim();
				if (!value) { feedback = "Question required."; tui.requestRender(); return; }
				done({ action: "clarification", clarification: value }); return;
			}
			editor.handleInput(data); feedback = ""; tui.requestRender();
		},
	};
}

export function askText(
	ctx: ExtensionContext,
	question: string,
	context: string | undefined,
	signal?: AbortSignal,
): Promise<AnswerWithNote<string> | ClarificationRequest | RegenerateRequest | SkipRequest | null> {
	return customWithAbort<AnswerWithNote<string> | ClarificationRequest | RegenerateRequest | SkipRequest | null>(ctx, signal, (tui: any, theme: any, _keybindings: KeybindingsManager, done) => {
		let cachedWidth: number | undefined;
		let cachedRows: number | undefined;
		let cachedLines: string[] | undefined;
		let noteFocused = false;
		let noteActionFocused = false;
		let savedNote = "";
		let feedback = "";
		let dismissConfirm = false;
		let _focused = false;
		const answerEditor = createQuestionEditor(tui, theme, undefined, ctx.cwd);
		const noteEditor = createNoteEditor(tui, theme, ctx.cwd);
		const clarification = createClarificationEditor(tui, theme, done, (focused) => {
			answerEditor.focused = focused && _focused && !noteFocused;
			noteEditor.focused = focused && _focused && noteFocused;
		}, ctx.cwd);

		function invalidate(): void {
			cachedLines = undefined;
		}

		/** Nothing typed means nothing to lose: that close is immediate. */
		function hasWork(): boolean {
			return Boolean(answerEditor.getExpandedText().trim() || noteEditor.getExpandedText().trim() || clarification.text());
		}

		function requestDismiss(): void {
			if (!hasWork()) return done(null);
			dismissConfirm = true;
			feedback = "";
			invalidate();
			tui.requestRender();
		}

		function finish(): void {
			if (!answerEditor.getExpandedText().trim()) {
				feedback = "Answer required.";
				invalidate();
				tui.requestRender();
				return;
			}
			done({ answer: answerEditor.getExpandedText(), note: noteEditor.getExpandedText() });
		}

		function focusNote(): void {
			noteFocused = false;
			noteActionFocused = true;
			answerEditor.focused = false;
			noteEditor.focused = false;
			invalidate();
			tui.requestRender();
		}

		function openNote(): void {
			savedNote = noteEditor.getExpandedText();
			noteActionFocused = false;
			noteFocused = true;
			noteEditor.focused = _focused;
			invalidate(); tui.requestRender();
		}

		function focusPrimary(): void {
			noteFocused = false;
			noteActionFocused = false;
			noteEditor.focused = false;
			answerEditor.focused = _focused;
			invalidate();
			tui.requestRender();
		}
		function discardNote(): void {
			noteEditor.setText(savedNote);
			focusPrimary();
		}

		return {
			render(width: number): string[] {
				// Completion results arrive asynchronously; render the live editor state.
				const lines: string[] = [];
				const add = (text: string) => lines.push(truncateToWidth(text, width));
				add(theme.fg("accent", "─".repeat(width)));
				addWrapped(lines, theme.fg("text", theme.askAppearance?.questionText === "normal" ? sanitizeDisplayText(question) : theme.bold(sanitizeDisplayText(question))), width, " ");
				if (context) {
					lines.push("");
					addWrapped(lines, theme.fg("muted", sanitizeDisplayText(context)), width, " ");
				}
				lines.push("");
				const editorPadding = width > 2 ? 1 : 0;
				const editorIndent = " ".repeat(editorPadding);
				for (const line of answerEditor.render(Math.max(1, width - editorPadding * 2))) add(`${editorIndent}${sanitizeEditorDisplay(line)}`);
				if (feedback) add(theme.fg("warning", ` ${feedback}`));
				lines.push("");
				renderOptionalNote(lines, width, theme, noteEditor, noteFocused, 2, noteActionFocused);
				lines.push("");
				if (clarification.active) {
					lines.push(...clarification.render(width));
				} else if (dismissConfirm) {
					renderDismissBanner(lines, width, theme, countSummary([
						{ count: answerEditor.getExpandedText().trim() ? 1 : 0, one: "answer", many: "answers" },
						{ count: noteEditor.getExpandedText().trim() ? 1 : 0, one: "note", many: "notes" },
						{ count: clarification.text() ? 1 : 0, one: "clarification draft", many: "clarification drafts" },
					]));
				} else {
					const tokens: HintToken[] = noteFocused
						? ["Enter/Tab Save note", { label: "Ctrl+C/Esc Discard note", tone: "error" }, "F2 More"]
						: noteActionFocused
							? ["Enter/+ Edit note", "Tab/Esc Back", "F2 More"]
							: [answerEditor.getExpandedText().trim() ? "Enter Submit" : "Write answer",
								{ label: "Tab Note", tone: "accent" }, "Ctrl+S Skip", "Ctrl+R Regenerate",
								{ label: "Esc Close", tone: "error" }, "F2 More"];
					addActionHints(lines, width, theme, tokens);
				}
				add(theme.fg("accent", "─".repeat(width)));
				constrainFrameHeight(lines, tui.terminal?.rows, 3);
				cachedWidth = width;
				cachedRows = tui.terminal?.rows;
				cachedLines = lines;
				return lines;
			},
			invalidate,
			handleInput(data: string): void {
				// The confirmation owns the keyboard: no other key may reach an editor.
				if (dismissConfirm) {
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) return done(null);
					if (data === "n" || data === "N") { dismissConfirm = false; invalidate(); tui.requestRender(); }
					return;
				}
				if (clarification.active) { clarification.handle(data); invalidate(); return; }
				if (matchesKey(data, Key.ctrl("r"))) return done({ action: "regenerate", note: noteEditor.getExpandedText() });
				if (matchesKey(data, Key.ctrl("s"))) return done({ action: "skip" });
				if (handleFileCompletion(noteFocused ? noteEditor : noteActionFocused ? undefined : answerEditor, data)) { invalidate(); tui.requestRender(); return; }
				if (isAskAgentKey(data)) { feedback = ""; clarification.open(); invalidate(); return; }
				data = normalizeFocusCycleKey(data);
				if (!matchesKey(data, Key.escape)) feedback = "";
				if (noteActionFocused) {
					if (isSubmitEnter(data) || matchesKey(data, Key.space) || data === "+") return openNote();
					if (matchesKey(data, Key.tab) || matchesKey(data, Key.escape)) return focusPrimary();
					return;
				}
				if (noteFocused) {
					if (matchesKey(data, Key.ctrl("enter")) || matchesKey(data, Key.alt("enter"))) return finish();
					if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) return discardNote();
					if (matchesKey(data, Key.tab) || isSubmitEnter(data)) return focusPrimary();
					noteEditor.handleInput(data);
				} else {
					if (matchesKey(data, Key.tab)) return focusNote();
					if (matchesKey(data, Key.ctrl("c"))) answerEditor.setText("");
					else if (matchesKey(data, Key.ctrl("enter")) || matchesKey(data, Key.alt("enter")) || isSubmitEnter(data)) return finish();
					else if (matchesKey(data, Key.escape)) return requestDismiss();
					else answerEditor.handleInput(data);
				}
				invalidate();
				tui.requestRender();
			},
			get focused(): boolean { return _focused; },
			set focused(value: boolean) {
				_focused = value;
				invalidate();
				clarification.setFocused(value);
				if (clarification.active) { answerEditor.focused = false; noteEditor.focused = false; return; }
				answerEditor.focused = value && !noteFocused && !noteActionFocused;
				noteEditor.focused = value && noteFocused;
			},
			isConfirmingDismiss() { return dismissConfirm; },
			getMoreActions() { return [
				{ label: "Add or edit note", run: () => { focusNote(); openNote(); } },
				{ label: "Regenerate question", key: "\x12", hint: "Ctrl+R" },
				{ label: "Skip question", key: "\x13", hint: "Ctrl+S" },
				{ label: "Ask for clarification", key: "\x1b[47;5u", hint: "Ctrl+?" },
				{ label: "Clear this field", key: "\x03", hint: "Ctrl+C" },
				{ label: "Discard and close", danger: true, run: () => requestDismiss() },
			]; },
		};
	});
}

/** Single-choice question with inline Other and an optional inline note. */
export function askSingleChoice(
	ctx: ExtensionContext,
	question: string,
	context: string | undefined,
	options: AskOption[],
	signal?: AbortSignal,
): Promise<AnswerWithNote<AskAnswer> | ClarificationRequest | RegenerateRequest | SkipRequest | null> {
	const otherLabel = getOtherLabel(options);
	return customWithAbort<AnswerWithNote<AskAnswer> | ClarificationRequest | RegenerateRequest | SkipRequest | null>(ctx, signal, (tui: any, theme: any, keybindings: KeybindingsManager, done) => {
		let editMode = false;
		let noteFocused = false;
		let noteActionFocused = false;
		let cachedWidth: number | undefined;
		let cachedRows: number | undefined;
		let cachedLines: string[] | undefined;
		let otherEditorValue = "";
		let savedNote = "";
		let feedback = "";
		let dismissConfirm = false;
		let stagedAnswer: AskAnswer | null = null;
		let _focused = false;
		const editor = createQuestionEditor(tui, theme, undefined, ctx.cwd);
		// The custom answer is capped so the choices above it stay visible.
		editor.maxContentLines = 3;
		const noteEditor = createNoteEditor(tui, theme, ctx.cwd);
		const clarification = createClarificationEditor(tui, theme, done, (focused) => {
			editor.focused = focused && _focused && editMode;
			noteEditor.focused = focused && _focused && noteFocused;
		}, ctx.cwd);
		const choiceList = new WrappedChoiceList(
			options,
			otherLabel,
			Math.min(options.length + 1, 10, Math.max(1, Math.floor((tui.terminal?.rows ?? 24) / 4))),
			keybindings,
			theme,
		);

		function invalidate(): void { cachedLines = undefined; }
		function finish(answer: AskAnswer): void { done({ answer, note: noteEditor.getExpandedText() }); }
		/** Any staged choice, custom draft, note or clarification is real work worth confirming. */
		function hasWork(): boolean {
			return Boolean(stagedAnswer || otherEditorValue.trim() || editor.getExpandedText().trim() || noteEditor.getExpandedText().trim() || clarification.text());
		}
		function requestDismiss(): void {
			if (!hasWork()) return done(null);
			dismissConfirm = true;
			feedback = "";
			invalidate();
			tui.requestRender();
		}
		/** Unselecting is Ctrl+C, so Escape stays a single, predictable close gesture. */
		function clearSelection(): void {
			stagedAnswer = null;
			otherEditorValue = "";
			editor.setText("");
			invalidate();
			tui.requestRender();
		}
		function dismissSummary(): string {
			const custom = otherEditorValue.trim() || editor.getExpandedText().trim();
			return countSummary([
				{ count: stagedAnswer ? 1 : 0, one: "answer", many: "answers" },
				{ count: custom ? 1 : 0, one: "custom answer", many: "custom answers" },
				{ count: noteEditor.getExpandedText().trim() ? 1 : 0, one: "note", many: "notes" },
				{ count: clarification.text() ? 1 : 0, one: "clarification draft", many: "clarification drafts" },
			]);
		}
		function focusNote(): void {
			if (editMode) {
				otherEditorValue = editor.getText();
				const customAnswer = otherEditorValue.trim();
				if (customAnswer) stagedAnswer = { type: "other", label: customAnswer, value: customAnswer };
			}
			editMode = false;
			editor.focused = false;
			noteFocused = false;
			noteActionFocused = true;
			noteEditor.focused = false;
			invalidate();
			tui.requestRender();
		}
		function openNote(): void {
			savedNote = noteEditor.getExpandedText();
			noteActionFocused = false;
			noteFocused = true;
			noteEditor.focused = _focused;
			invalidate(); tui.requestRender();
		}
		function focusPrimary(): void {
			noteFocused = false;
			noteActionFocused = false;
			noteEditor.focused = false;
			invalidate();
			tui.requestRender();
		}
		function discardNote(): void { noteEditor.setText(savedNote); focusPrimary(); }
		function openOtherEditor(): void {
			stagedAnswer = null;
			choiceList.selectOther();
			noteFocused = false;
			noteEditor.focused = false;
			editMode = true;
			editor.setText(otherEditorValue);
			editor.focused = _focused;
			invalidate();
			tui.requestRender();
		}
		function answerForItem(item: WrappedChoiceItem): AskAnswer {
			const option = item.option!;
			return { type: "option", label: option.label, value: option.value, index: item.index };
		}
		function stageOrConfirm(item: WrappedChoiceItem): void {
			if (item.isOther) {
				if (stagedAnswer?.type === "other") return finish(stagedAnswer);
				return openOtherEditor();
			}
			const answer = answerForItem(item);
			if (stagedAnswer && answerSelectionKey(stagedAnswer) === item.id) return finish(stagedAnswer);
			stagedAnswer = answer;
			invalidate();
			tui.requestRender();
		}
		editor.onSubmit = (value) => {
			const trimmed = value.trim();
			if (!trimmed) {
				feedback = "Custom answer required.";
				invalidate();
				tui.requestRender();
				return;
			}
			otherEditorValue = value;
			stagedAnswer = { type: "other", label: trimmed, value: trimmed };
			editMode = false;
			editor.focused = false;
			invalidate();
			tui.requestRender();
		};

		return {
			render(width: number): string[] {
				// Completion results arrive asynchronously; render the live editor state.
				const lines: string[] = [];
				const add = (text: string) => lines.push(truncateToWidth(text, width));
				add(theme.fg("accent", "─".repeat(width)));
				addWrapped(lines, theme.fg("text", theme.askAppearance?.questionText === "normal" ? sanitizeDisplayText(question) : theme.bold(sanitizeDisplayText(question))), width, " ");
				if (context) { lines.push(""); addWrapped(lines, theme.fg("muted", sanitizeDisplayText(context)), width, " "); }
				lines.push("");
				const tail: string[] = feedback ? [theme.fg("warning", ` ${feedback}`), ""] : [""];
				renderOptionalNote(tail, width, theme, noteEditor, noteFocused, 9, noteActionFocused);
				tail.push("");
				if (clarification.active) {
					tail.push(...clarification.render(width));
				} else if (dismissConfirm) {
					renderDismissBanner(tail, width, theme, dismissSummary());
				} else {
					const tokens: HintToken[] = noteFocused
						? ["Enter/Tab Save note", { label: "Ctrl+C/Esc Discard note", tone: "error" }, "F2 More"]
						: noteActionFocused
							? ["Enter/+ Edit note", "Tab/Esc Back", "F2 More"]
							: editMode
								? ["Enter Save answer", "Ctrl+C Clear", "Alt+↑/↓ Options", "Tab Note", "Esc Back", "Ctrl+S Skip", "F2 More"]
								: [stagedAnswer ? "Enter Confirm or replace" : "Enter Select", { label: "+ Note", tone: "accent" },
									"Ctrl+S Skip", "Ctrl+R Regenerate", { label: "Esc Close", tone: "error" }, "F2 More"];
					addActionHints(tail, width, theme, tokens);
				}
				tail.push(truncateToWidth(theme.fg("accent", "─".repeat(width)), width));
				const availableLines = Math.max(0, (tui.terminal?.rows ?? Number.POSITIVE_INFINITY) - lines.length - tail.length);
				lines.push(...choiceList.render(width, {
					selectedAnswers: stagedAnswer && answerSelectionKey(stagedAnswer)
						? new Map([[answerSelectionKey(stagedAnswer)!, stagedAnswer]])
						: new Map(),
					showRadio: true,
					inlineOtherEditor: editMode ? editor : undefined,
					availableLines,
				}));
				lines.push(...tail);
				constrainFrameHeight(lines, tui.terminal?.rows, 3);
				cachedWidth = width;
				cachedRows = tui.terminal?.rows;
				cachedLines = lines;
				return lines;
			},
			invalidate,
			handleInput(data: string): void {
				// The confirmation owns the keyboard: no other key may reach an editor.
				if (dismissConfirm) {
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) return done(null);
					if (data === "n" || data === "N") { dismissConfirm = false; invalidate(); tui.requestRender(); }
					return;
				}
				if (clarification.active) { clarification.handle(data); invalidate(); return; }
				if (matchesKey(data, Key.ctrl("r"))) return done({ action: "regenerate", note: noteEditor.getExpandedText() });
				if (matchesKey(data, Key.ctrl("s"))) return done({ action: "skip" });
				if (handleFileCompletion(noteFocused ? noteEditor : editMode ? editor : undefined, data)) { invalidate(); tui.requestRender(); return; }
				if (isAskAgentKey(data)) { feedback = ""; clarification.open(); invalidate(); return; }
				data = normalizeFocusCycleKey(data);
				if (!matchesKey(data, Key.escape)) feedback = "";
				if (noteActionFocused) {
					if (isSubmitEnter(data) || matchesKey(data, Key.space) || data === "+") return openNote();
					if (matchesKey(data, Key.tab) || matchesKey(data, Key.escape)) return focusPrimary();
					return;
				}
				if (noteFocused) {
					if (isSubmitEnter(data)) return focusPrimary();
					if (matchesKey(data, Key.ctrl("enter")) || matchesKey(data, Key.alt("enter"))) {
						const item = choiceList.selectedItem;
						if (stagedAnswer) return finish(stagedAnswer);
						if (item.isOther) return openOtherEditor();
						return finish(answerForItem(item));
					}
					if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) return discardNote();
					if (matchesKey(data, Key.tab)) return focusPrimary();
					noteEditor.handleInput(data);
				} else if (editMode) {
					if (matchesKey(data, Key.ctrl("c"))) {
						clearSelection();
					} else if (matchesKey(data, Key.tab)) return focusNote();
					else if (matchesKey(data, Key.alt("up")) || matchesKey(data, Key.alt("down"))) {
						choiceList.scrollOptions(matchesKey(data, Key.alt("up")) ? -1 : 1);
					} else if (matchesKey(data, Key.escape)) {
						editMode = false;
						otherEditorValue = editor.getText();
						editor.focused = false;
						choiceList.resetOptionScroll();
					} else editor.handleInput(data);
				} else {
					if (matchesKey(data, Key.tab)) return focusNote();
					if (data === "+") { focusNote(); openNote(); return; }
					if (matchesKey(data, Key.ctrl("c")) && stagedAnswer) { clearSelection(); return; }
					if (/^[1-9]$/.test(data)) {
						const index = parseInt(data, 10) - 1;
						if (index < choiceList.length) { choiceList.setSelectedIndex(index); return stageOrConfirm(choiceList.selectedItem); }
					}
					const action = choiceList.handleInput(data);
					if (action === "confirm") return stageOrConfirm(choiceList.selectedItem);
					// Escape is a close gesture only; Ctrl+C is the way to unselect.
					if (action === "cancel") return requestDismiss();
				}
				invalidate();
				tui.requestRender();
			},
			get focused(): boolean { return _focused; },
			set focused(value: boolean) {
				_focused = value;
				invalidate();
				clarification.setFocused(value);
				if (clarification.active) { editor.focused = false; noteEditor.focused = false; return; }
				editor.focused = value && editMode;
				noteEditor.focused = value && noteFocused;
			},
			isConfirmingDismiss() { return dismissConfirm; },
			getMoreActions() { return [
				{ label: "Add or edit note", run: () => { focusNote(); openNote(); } },
				{ label: "Regenerate question", key: "\x12", hint: "Ctrl+R" },
				{ label: "Skip question", key: "\x13", hint: "Ctrl+S" },
				{ label: "Ask for clarification", key: "\x1b[47;5u", hint: "Ctrl+?" },
				{ label: "Clear selection", key: "\x03", hint: "Ctrl+C" },
				{ label: "Discard and close", danger: true, run: () => requestDismiss() },
			]; },
		};
	});
}

/** Multi-choice question with inline Other and an optional inline note. */
export function askMultiChoice(
	ctx: ExtensionContext,
	question: string,
	context: string | undefined,
	options: AskOption[],
	signal?: AbortSignal,
): Promise<AnswerWithNote<AskAnswer[]> | ClarificationRequest | RegenerateRequest | SkipRequest | null> {
	const otherLabel = getOtherLabel(options);
	return customWithAbort<AnswerWithNote<AskAnswer[]> | ClarificationRequest | RegenerateRequest | SkipRequest | null>(ctx, signal, (tui: any, theme: any, keybindings: KeybindingsManager, done) => {
		let editMode = false;
		let noteFocused = false;
		let noteActionFocused = false;
		let cachedWidth: number | undefined;
		let cachedRows: number | undefined;
		let cachedLines: string[] | undefined;
		let _focused = false;
		let otherPending = false;
		let savedNote = "";
		let feedback = "";
		let dismissConfirm = false;
		const selected = new Map<string, AskAnswer>();
		const otherEditor = createQuestionEditor(tui, theme, undefined, ctx.cwd);
		// The custom answer is capped so the choices above it stay visible.
		otherEditor.maxContentLines = 3;
		const noteEditor = createNoteEditor(tui, theme, ctx.cwd);
		const clarification = createClarificationEditor(tui, theme, done, (focused) => {
			otherEditor.focused = focused && _focused && editMode;
			noteEditor.focused = focused && _focused && noteFocused;
		}, ctx.cwd);
		const choiceList = new WrappedChoiceList(
			options,
			otherLabel,
			Math.min(options.length + 1, 12, Math.max(1, Math.floor((tui.terminal?.rows ?? 24) / 4))),
			keybindings,
			theme,
		);
		let otherText = "";

		function invalidate(): void { cachedLines = undefined; }
		function finish(): void {
			if (selected.size === 0) {
				feedback = "Select an answer.";
				invalidate();
				tui.requestRender();
				return;
			}
			done({ answer: sortAnswers(Array.from(selected.values())), note: noteEditor.getExpandedText() });
		}
		/** Any checked choice, custom draft, note or clarification is real work worth confirming. */
		function hasWork(): boolean {
			return selected.size > 0 || Boolean(otherText.trim() || otherEditor.getExpandedText().trim() || noteEditor.getExpandedText().trim() || clarification.text());
		}
		function requestDismiss(): void {
			if (!hasWork()) return done(null);
			dismissConfirm = true;
			feedback = "";
			invalidate();
			tui.requestRender();
		}
		/** Unselecting is Ctrl+C, so Escape stays a single, predictable close gesture. */
		function clearSelection(): void {
			selected.clear();
			otherText = "";
			otherPending = false;
			otherEditor.setText("");
			invalidate();
			tui.requestRender();
		}
		function dismissSummary(): string {
			const custom = otherText.trim() || otherEditor.getExpandedText().trim();
			return countSummary([
				{ count: selected.has("other") ? selected.size - 1 : selected.size, one: "answer", many: "answers" },
				{ count: custom ? 1 : 0, one: "custom answer", many: "custom answers" },
				{ count: noteEditor.getExpandedText().trim() ? 1 : 0, one: "note", many: "notes" },
				{ count: clarification.text() ? 1 : 0, one: "clarification draft", many: "clarification drafts" },
			]);
		}
		function focusNote(): void {
			if (editMode) {
				otherText = otherEditor.getText();
				const customAnswer = otherText.trim();
				if (customAnswer) {
					selected.set("other", { type: "other", label: customAnswer, value: customAnswer });
					otherPending = false;
				} else {
					selected.delete("other");
				}
			}
			editMode = false;
			otherEditor.focused = false;
			noteFocused = false;
			noteActionFocused = true;
			noteEditor.focused = false;
			invalidate();
			tui.requestRender();
		}
		function openNote(): void {
			savedNote = noteEditor.getExpandedText();
			noteActionFocused = false;
			noteFocused = true;
			noteEditor.focused = _focused;
			invalidate(); tui.requestRender();
		}
		function focusPrimary(): void {
			noteFocused = false;
			noteActionFocused = false;
			noteEditor.focused = false;
			invalidate();
			tui.requestRender();
		}
		function discardNote(): void { noteEditor.setText(savedNote); focusPrimary(); }
		function toggleOption(item: WrappedChoiceItem): void {
			const option = item.option;
			if (!option) return;
			if (selected.has(item.id)) selected.delete(item.id);
			else selected.set(item.id, { type: "option", label: option.label, value: option.value, index: item.index });
		}
		function openOtherEditor(): void {
			choiceList.selectOther();
			otherPending = true;
			editMode = true;
			otherEditor.setText(otherText);
			otherEditor.focused = _focused;
			invalidate();
			tui.requestRender();
		}
		function toggleOther(): void {
			if (selected.has("other")) {
				selected.delete("other");
				otherPending = false;
				return;
			}
			const cached = otherText.trim();
			if (cached) {
				selected.set("other", { type: "other", label: cached, value: cached });
				otherPending = false;
				return;
			}
			openOtherEditor();
		}
		otherEditor.onSubmit = (value: string) => {
			const trimmed = value.trim();
			if (!trimmed) {
				feedback = "Custom answer required.";
				invalidate();
				tui.requestRender();
				return;
			}
			otherText = trimmed;
			selected.set("other", { type: "other", label: trimmed, value: trimmed });
			otherPending = false;
			editMode = false;
			otherEditor.focused = false;
			invalidate();
			tui.requestRender();
		};

		return {
			render(width: number): string[] {
				// Completion results arrive asynchronously; render the live editor state.
				const lines: string[] = [];
				const add = (text: string) => lines.push(truncateToWidth(text, width));
				add(theme.fg("accent", "─".repeat(width)));
				addWrapped(lines, theme.fg("text", theme.askAppearance?.questionText === "normal" ? sanitizeDisplayText(question) : theme.bold(sanitizeDisplayText(question))), width, " ");
				if (context) { lines.push(""); addWrapped(lines, theme.fg("muted", sanitizeDisplayText(context)), width, " "); }
				lines.push("");
				add(selected.size > 0 ? theme.fg("success", ` ✓ ${selected.size} selected`) : theme.fg("dim", " ○ Select options below"));
				lines.push("");
				const tail: string[] = feedback ? [theme.fg("warning", ` ${feedback}`), ""] : [""];
				renderOptionalNote(tail, width, theme, noteEditor, noteFocused, 9, noteActionFocused);
				tail.push("");
				if (clarification.active) {
					tail.push(...clarification.render(width));
				} else if (dismissConfirm) {
					renderDismissBanner(tail, width, theme, dismissSummary());
				} else {
					const tokens: HintToken[] = noteFocused
						? ["Enter/Tab Save note", { label: "Ctrl+C/Esc Discard note", tone: "error" }, "F2 More"]
						: noteActionFocused
							? ["Enter/+ Edit note", "Tab/Esc Back", "F2 More"]
							: editMode
								? ["Enter Save answer", "Ctrl+C Clear", "Alt+↑/↓ Options", "Tab Note", "Esc Back", "Ctrl+S Skip", "F2 More"]
								: [choiceList.selectedItem.isOther ? "Enter Edit" : selected.size ? "Enter Submit" : "Space Select", { label: "+ Note", tone: "accent" },
									"Ctrl+S Skip", "Ctrl+R Regenerate", { label: "Esc Close", tone: "error" }, "F2 More"];
					addActionHints(tail, width, theme, tokens);
				}
				tail.push(truncateToWidth(theme.fg("accent", "─".repeat(width)), width));
				const availableLines = Math.max(0, (tui.terminal?.rows ?? Number.POSITIVE_INFINITY) - lines.length - tail.length);
				lines.push(...choiceList.render(width, {
					selectedAnswers: selected,
					inlineOtherEditor: editMode ? otherEditor : undefined,
					availableLines,
				}));
				lines.push(...tail);
				constrainFrameHeight(lines, tui.terminal?.rows, 3);
				cachedWidth = width;
				cachedRows = tui.terminal?.rows;
				cachedLines = lines;
				return lines;
			},
			invalidate,
			handleInput(data: string): void {
				// The confirmation owns the keyboard: no other key may reach an editor.
				if (dismissConfirm) {
					if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) return done(null);
					if (data === "n" || data === "N") { dismissConfirm = false; invalidate(); tui.requestRender(); }
					return;
				}
				if (clarification.active) { clarification.handle(data); invalidate(); return; }
				if (matchesKey(data, Key.ctrl("r"))) return done({ action: "regenerate", note: noteEditor.getExpandedText() });
				if (matchesKey(data, Key.ctrl("s"))) return done({ action: "skip" });
				if (handleFileCompletion(noteFocused ? noteEditor : editMode ? otherEditor : undefined, data)) { invalidate(); tui.requestRender(); return; }
				if (isAskAgentKey(data)) { feedback = ""; clarification.open(); invalidate(); return; }
				data = normalizeFocusCycleKey(data);
				if (!matchesKey(data, Key.escape)) feedback = "";
				if (noteActionFocused) {
					if (isSubmitEnter(data) || matchesKey(data, Key.space) || data === "+") return openNote();
					if (matchesKey(data, Key.tab) || matchesKey(data, Key.escape)) return focusPrimary();
					return;
				}
				if (noteFocused) {
					if (isSubmitEnter(data)) return focusPrimary();
					if (matchesKey(data, Key.ctrl("enter")) || matchesKey(data, Key.alt("enter"))) {
						if (otherPending && !selected.has("other")) {
							noteFocused = false;
							noteEditor.focused = false;
							editMode = true;
							otherEditor.focused = _focused;
							invalidate();
							tui.requestRender();
							return;
						}
						return finish();
					}
					if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) return discardNote();
					if (matchesKey(data, Key.tab)) return focusPrimary();
					noteEditor.handleInput(data);
				} else if (editMode) {
					if (matchesKey(data, Key.ctrl("c"))) {
						otherEditor.setText("");
						otherText = "";
						selected.delete("other");
						otherPending = true;
					} else if (matchesKey(data, Key.ctrl("enter")) || matchesKey(data, Key.alt("enter"))) {
						const trimmed = otherEditor.getText().trim();
						if (!trimmed) return;
						otherText = trimmed;
						selected.set("other", { type: "other", label: trimmed, value: trimmed });
						otherPending = false;
						return finish();
					}
					if (matchesKey(data, Key.tab)) return focusNote();
					if (matchesKey(data, Key.alt("up")) || matchesKey(data, Key.alt("down"))) {
						choiceList.scrollOptions(matchesKey(data, Key.alt("up")) ? -1 : 1);
					} else if (matchesKey(data, Key.escape)) {
						editMode = false;
						otherPending = false;
						otherText = otherEditor.getText();
						if (!otherText.trim()) selected.delete("other");
						otherEditor.focused = false;
						choiceList.resetOptionScroll();
					} else otherEditor.handleInput(data);
				} else {
					if (matchesKey(data, Key.tab)) return focusNote();
					if (data === "+") { focusNote(); openNote(); return; }
					if (matchesKey(data, Key.ctrl("enter")) || matchesKey(data, Key.alt("enter"))) {
						return finish();
					}
					if (matchesKey(data, Key.ctrl("c")) && selected.size > 0) { clearSelection(); return; }
					if (/^[1-9]$/.test(data)) {
						const index = parseInt(data, 10) - 1;
						if (index < choiceList.length) {
							choiceList.setSelectedIndex(index);
							if (choiceList.selectedItem.isOther) toggleOther(); else toggleOption(choiceList.selectedItem);
							invalidate(); tui.requestRender(); return;
						}
					}
					if (matchesKey(data, Key.space)) {
						if (choiceList.selectedItem.isOther) toggleOther(); else toggleOption(choiceList.selectedItem);
					} else {
						const action = choiceList.handleInput(data);
						if (action === "confirm") {
							if (choiceList.selectedItem.isOther) return openOtherEditor();
							if (selected.size > 0) return finish();
							toggleOption(choiceList.selectedItem);
						} else if (action === "cancel") {
							// Escape is a close gesture only; Ctrl+C is the way to unselect.
							return requestDismiss();
						}
					}
				}
				invalidate();
				tui.requestRender();
			},
			get focused(): boolean { return _focused; },
			set focused(value: boolean) {
				_focused = value;
				invalidate();
				clarification.setFocused(value);
				if (clarification.active) { otherEditor.focused = false; noteEditor.focused = false; return; }
				otherEditor.focused = value && editMode;
				noteEditor.focused = value && noteFocused;
			},
			isConfirmingDismiss() { return dismissConfirm; },
			getMoreActions() { return [
				{ label: "Add or edit note", run: () => { focusNote(); openNote(); } },
				{ label: "Regenerate question", key: "\x12", hint: "Ctrl+R" },
				{ label: "Skip question", key: "\x13", hint: "Ctrl+S" },
				{ label: "Ask for clarification", key: "\x1b[47;5u", hint: "Ctrl+?" },
				{ label: "Clear selection", key: "\x03", hint: "Ctrl+C" },
				{ label: "Discard and close", danger: true, run: () => requestDismiss() },
			]; },
		};
	});
}
