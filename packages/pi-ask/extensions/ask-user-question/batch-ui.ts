import { Key, type KeybindingsManager, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { AskAnswer, OtherAnswer, OptionAnswer, QuestionDef, TabAnswer, TabState } from "./domain.ts";
import { getOtherLabel } from "./domain.ts";
import type { MoreAction } from "./question-surface.ts";
import { addActionHints, countSummary, renderDismissBanner, handleFileCompletion, addWrapped, addWrappedWithPrefix, constrainFrameHeight, createNoteEditor, createQuestionEditor, fitLineWindow, isAskAgentKey, isSubmitEnter, normalizeFocusCycleKey, renderOptionalNote, sanitizeDisplayText, sanitizeEditorDisplay, WrappedChoiceList, type HintToken, type WrappedChoiceItem } from "./tui-primitives.ts";

export type BatchUIResult = TabAnswer[] | { action: "regenerate"; answers: TabAnswer[] } | { action: "clarification"; clarification: string; answers: TabAnswer[]; activeQuestionIndex: number } | null;

export interface QuestionDraft {
	answer: TabAnswer["answer"]; textBuffer: string; otherText: string; selected: [string, AskAnswer][];
	note: string; skipped: boolean; committed: boolean;
	clarificationText?: string; clarificationMode?: boolean;
}

export class TabbedQuestions {
	private questions: QuestionDef[];
	private tabs: TabState[];
	private activeTab: number;
	private done: (result: any) => void;
	private tui: any;
	private theme: any;
	private cachedWidth?: number;
	private cachedRows?: number;
	private cachedLines?: string[];
	private editMode: boolean;
	private editor: any;
	private choiceList: WrappedChoiceList | null;
	private selected: Map<string, AskAnswer>;
	private otherText: string;
	private otherEditor: ReturnType<typeof createQuestionEditor>;
	private _focused: boolean;
	private noteEditor: ReturnType<typeof createNoteEditor>;
	private noteFocused: boolean;
	private noteActionFocused: boolean;
	private dismissConfirm: boolean;
	/** Posted questions close without submitting; an explicit close keeps the draft. */
	preserveDraftOnDismiss = false;
	private advanceListener?: () => void;
	private keybindings: KeybindingsManager;
	private tabChoiceLists: Map<number, WrappedChoiceList>;
	private reviewing: boolean;
	private partialReview: boolean;
	private reviewScroll: number;
	/** First visible question row; the prompt keeps its own counted window. */
	private promptScroll = 0;
	/** Rows the prompt can still reveal below its window; zero means Alt+↑/↓ do nothing. */
	private promptMaxScroll = 0;
	private reviewEditDigits: string;
	private feedback: string;
	private clarificationEditor: ReturnType<typeof createQuestionEditor>;
	private clarificationMode: boolean;

	constructor(
		questions: QuestionDef[],
		tui: any,
		theme: any,
		keybindings: KeybindingsManager,
		done: (result: any) => void,
		cwd = process.cwd(),
		draft?: QuestionDraft,
		private readonly regenerationEnabled = true,
	) {
		this.questions = questions;
		this.tui = tui;
		this.theme = theme;
		this.keybindings = keybindings;
		this.done = done;
		this.activeTab = 0;
		this.editMode = false;
		this._focused = false;
		this.selected = new Map();
		this.otherText = "";
		this.choiceList = null;
		this.tabChoiceLists = new Map();
		this.reviewing = false;
		this.partialReview = false;
		this.reviewScroll = 0;
		this.reviewEditDigits = "";
		this.feedback = "";
		this.clarificationMode = false;
		this.clarificationEditor = createQuestionEditor(tui, theme, undefined, cwd);
		if (draft?.clarificationText) this.clarificationEditor.setText(draft.clarificationText);
		this.clarificationMode = draft?.clarificationMode === true;

		this.otherEditor = createQuestionEditor(tui, theme, undefined, cwd);
		this.otherEditor.onSubmit = (value: string) => {
			const trimmed = value.trim();
			if (!trimmed) {
				this.feedback = "Custom answer required.";
				this.invalidate();
				tui.requestRender();
				return;
			}
			this.feedback = "";
			this.otherText = trimmed;
			const tab = this.getActiveTab();
			if (tab) tab.otherText = trimmed;
			this.tabChoiceLists.get(this.activeTab)?.resetOptionScroll();
			if (tab && tab.mode === "single-select") {
				const answer: AskAnswer = { type: "other" as const, label: trimmed, value: trimmed };
				tab.answer = answer;
				this.selected = new Map();
				this.selected.set("other", answer);
				tab.selected = new Map(this.selected);
				this.editMode = false;
				this.otherEditor.focused = false;
				this.invalidate();
				tui.requestRender();
				return;
			}
			this.selected.set("other", { type: "other" as const, label: trimmed, value: trimmed });
			this.editMode = false;
			this.otherEditor.focused = false;
			this.syncMultiSelectState();
			this.invalidate();
			tui.requestRender();
		};

		this.editor = createQuestionEditor(tui, theme, undefined, cwd);

		this.noteEditor = createNoteEditor(tui, theme, cwd);
		this.noteFocused = false;
		this.noteActionFocused = false;
		this.dismissConfirm = false;
		// The custom "Something else" editor is capped; the answer and note editors are not.
		this.otherEditor.maxContentLines = 3;

		// Initialize tabs
		const tabs: TabState[] = [];
		for (let i = 0; i < questions.length; i++) {
			const q = questions[i];

			tabs.push({
				skipped: false,
				committed: false,
				questionIndex: i,
				mode: q.mode,
				answer: null,
				textBuffer: "",
				otherText: "",
				selected: new Map(),
				note: "",
			});
		}
		this.tabs = tabs;
		if (draft && tabs.length === 1) Object.assign(tabs[0], structuredClone(draft), { selected: new Map(draft.selected) });

		// Prepare active tab
		this.prepareActiveTab();

		if (this.tabs.length > 0) {
			this.noteEditor.setText(this.tabs[this.activeTab].note || "");
		}
	}

	/** Posted-question navigation preserves unsubmitted input; this is not an answer result. */
	captureDraft(): QuestionDraft {
		if (this.editMode) this.preserveOtherDraft();
		this.syncAnswerFromTab();
		const tab = this.getActiveTab();
		return structuredClone({ answer: tab.answer, textBuffer: tab.textBuffer, otherText: tab.otherText,
			selected: [...tab.selected.entries()], note: this.noteFocused ? this.noteEditor.getExpandedText() : tab.note,
			skipped: tab.skipped, committed: tab.committed,
			...(this.clarificationEditor.getExpandedText() ? { clarificationText: this.clarificationEditor.getExpandedText(), clarificationMode: this.clarificationMode } : {}) });
	}

	/** Posted overlays close only from the outer form; nested modes retain their own Escape contract. */
	backFromNestedMode(): boolean {
		if (!this.dismissConfirm && !this.clarificationMode && !this.reviewing && !this.editMode && !this.noteFocused && !this.noteActionFocused) return false;
		this.handleInput("\x1b"); return true;
	}

	/** Read-only boundary/context updates never edit answers or the underlying question definition. */
	setContextDetails(details: string): void {
		if (this.questions.length === 1 && this.questions[0].details !== details) {
			this.questions[0] = { ...this.questions[0], details }; this.invalidate();
		}
	}

	private snapshot(): TabAnswer[] {
		if (this.editMode) this.preserveOtherDraft();
		else this.syncAnswerFromTab();
		return this.tabs.map((tab, index) => ({
			questionIndex: index,
			answer: tab.skipped ? null : tab.answer,
			note: tab.skipped ? "" : tab.note,
			skipped: tab.skipped,
		}));
	}

	private clarificationSnapshot(): TabAnswer[] {
		if (!this.editMode) return this.snapshot();

		this.preserveOtherDraft();
		const customAnswer = this.otherText.trim();
		return this.tabs.map((tab, index) => {
			let answer = tab.answer;
			if (index === this.activeTab && tab.mode === "single-select") {
				answer = customAnswer
					? { type: "other", label: customAnswer, value: customAnswer }
					: null;
			} else if (index === this.activeTab && tab.mode === "multi-select") {
				const draftSelection = new Map(this.selected);
				if (customAnswer) draftSelection.set("other", { type: "other", label: customAnswer, value: customAnswer });
				else draftSelection.delete("other");
				const values = Array.from(draftSelection.values());
				answer = values.length > 0 ? values : null;
			}
			if (index === this.activeTab && tab.mode === "text" && !tab.skipped && tab.textBuffer.trim()) answer = tab.textBuffer;
			return { questionIndex: index, answer: tab.skipped ? null : answer, note: tab.skipped ? "" : tab.note, skipped: tab.skipped };
		});
	}

	private getActiveTab(): TabState {
		return this.tabs[this.activeTab];
	}

	private saveOtherDraft(): void {
		const tab = this.getActiveTab();
		this.preserveOtherDraft();
		const customAnswer = this.otherText.trim();
		if (customAnswer) {
			const answer: OtherAnswer = { type: "other", label: customAnswer, value: customAnswer };
			if (tab.mode === "single-select") {
				tab.answer = answer;
				this.selected = new Map([["other", answer]]);
			} else {
				this.selected.set("other", answer);
				tab.answer = Array.from(this.selected.values());
			}
		} else {
			this.selected.delete("other");
			if (tab.mode === "single-select") {
				if (tab.answer && typeof tab.answer === "object" && !Array.isArray(tab.answer) && tab.answer.type === "other") {
					tab.answer = null;
				}
			} else {
				const answers = Array.from(this.selected.values());
				tab.answer = answers.length > 0 ? answers : null;
			}
		}
		tab.selected = new Map(this.selected);
	}

	private preserveOtherDraft(): void {
		this.otherText = this.otherEditor.getExpandedText();
		this.getActiveTab().otherText = this.otherText;
	}

	private canRegenerate(): boolean {
		const answeredCount = this.tabs.filter((tab) => this.isAnswered(tab)).length;
		return this.regenerationEnabled && answeredCount < this.tabs.length;
	}

	private focusNote(): void {
		if (this.editMode) {
			this.saveOtherDraft();
			this.editMode = false;
			this.otherEditor.focused = false;
		} else {
			this.syncAnswerFromTab();
		}
		this.noteActionFocused = true;
		this.editor.focused = false;
		this.noteEditor.focused = false;
		this.invalidate();
		this.tui.requestRender();
	}

	private openNote(): void {
		this.noteEditor.setText(this.getActiveTab().note);
		this.noteActionFocused = false;
		this.noteFocused = true;
		this.noteEditor.focused = this._focused;
		this.invalidate();
		this.tui.requestRender();
	}

	private leaveNoteFocus(): void {
		this.focusAnswer();
	}

	private discardNote(): void {
		this.noteEditor.setText(this.getActiveTab().note);
		this.focusAnswer();
		this.feedback = "Note changes discarded.";
		this.invalidate(); this.tui.requestRender();
	}

	private focusAnswer(): void {
		if (this.noteFocused) this.getActiveTab().note = this.noteEditor.getExpandedText();
		this.noteFocused = false;
		this.noteActionFocused = false;
		this.noteEditor.focused = false;
		const tab = this.getActiveTab();
		if (tab.mode === "text") this.editor.focused = this._focused && !tab.skipped;
		this.invalidate();
		this.tui.requestRender();
}


	private syncAnswerFromTab(): void {
		const tab = this.getActiveTab();
		if (!tab) return;
		if (tab.mode === "text") {
			const val = this.editor?.getExpandedText?.() ?? "";
			tab.textBuffer = val;
			tab.answer = tab.committed && val.trim() ? val : null;
		} else if (tab.mode === "multi-select") {
			const vals = Array.from(this.selected.values());
			tab.answer = vals.length > 0 ? vals : null;
		}
		if (tab.mode !== "text") tab.otherText = this.otherText;
		if (!this.noteFocused) tab.note = this.noteEditor.getExpandedText();
	}

	private syncMultiSelectState(): void {
		const tab = this.getActiveTab();
		if (!tab || tab.mode !== "multi-select") return;
		tab.selected = new Map(this.selected);
		const vals = Array.from(this.selected.values());
		tab.answer = vals.length > 0 ? vals : null;
		this.invalidate();
		this.tui.requestRender();
	}

	private selectTab(index: number): void {
		if (index < 0 || index >= this.tabs.length || (!this.reviewing && index === this.activeTab)) return;
		if (this.noteFocused) this.leaveNoteFocus();
		this.feedback = "";
		this.reviewEditDigits = "";
		if (!this.reviewing) {
			if (this.editMode) this.preserveOtherDraft();
			this.syncAnswerFromTab();
		}
		this.reviewing = false;
		this.partialReview = false;
		this.activeTab = index;
		this.promptScroll = 0;
		this.promptMaxScroll = 0;
		this.editMode = false;
		this.noteFocused = false;
		this.noteActionFocused = false;
		this.otherEditor.focused = false;
		this.editor.focused = false;
		this.noteEditor.focused = false;
		this.prepareActiveTab();
		this.noteEditor.setText(this.tabs[index].note || "");
		this.invalidate();
		this.tui.requestRender();
	}

	private prepareActiveTab(): void {
		const tab = this.getActiveTab();
		if (!tab) return;
		this.tabChoiceLists.get(this.activeTab)?.resetOptionScroll();
		if (tab.mode === "text") {
			this.editor.setText(tab.textBuffer || "");
			this.editor.focused = this._focused && !tab.skipped && !this.noteActionFocused;
		} else if (tab.mode === "single-select" || tab.mode === "multi-select") {
			this.selected = new Map(tab.selected || new Map());
			this.otherText = tab.otherText;
		}
		this.noteEditor.setText(tab.note || "");
	}

	private regenerate(): void {
		if (!this.regenerationEnabled) return;
		if (this.noteFocused) this.leaveNoteFocus();
		// Ctrl+R preserves, but does not commit, an unfinished custom draft.
		if (this.editMode) this.preserveOtherDraft();
		this.syncAnswerFromTab();
		const answers = this.snapshot().map((answer) => ({ ...answer, note: answer.note || "" }));
		const answeredCount = this.tabs.filter((tab) => this.isAnswered(tab)).length;
		if (answeredCount === this.tabs.length) {
			this.feedback = "All answered. Use Review.";
		} else {
			this.done({ action: "regenerate", answers });
			return;
		}
		this.invalidate();
		this.tui.requestRender();
	}

	private isAnswered(tab: TabState): boolean {
		if (tab.skipped) return false;
		if (typeof tab.answer === "string") return tab.answer.trim().length > 0;
		return tab.answer !== null && (!Array.isArray(tab.answer) || tab.answer.length > 0);
	}

	/** Any answer, staged selection, note, custom draft, skip or clarification is real work. */
	private hasWork(): boolean {
		if (this.noteFocused && this.noteEditor.getExpandedText().trim()) return true;
		if (this.editMode && this.otherEditor.getExpandedText().trim()) return true;
		if (this.clarificationEditor.getExpandedText().trim()) return true;
		return this.tabs.some((tab) => tab.skipped || this.isAnswered(tab)
			|| tab.textBuffer.trim().length > 0 || tab.note.trim().length > 0 || tab.otherText.trim().length > 0
			|| tab.selected.size > 0);
	}

	private dismissalCounts(): { answers: number; notes: number; custom: number; skipped: number; clarification: number } {
		const active = this.getActiveTab();
		const liveNote = this.noteFocused ? this.noteEditor.getExpandedText().trim() : "";
		const liveCustom = this.editMode ? this.otherEditor.getExpandedText().trim() : "";
		return {
			// A draft answer is exactly what the person would lose, so it counts here.
			answers: this.tabs.filter((tab) => this.isAnswered(tab) || tab.textBuffer.trim() || tab.selected.size > 0).length,
			notes: this.tabs.filter((tab) => tab.note.trim() || (tab === active && liveNote)).length,
			custom: this.tabs.filter((tab) => tab.mode !== "text" && !tab.selected.has("other")
				&& (tab.otherText.trim() || (tab === active && liveCustom))).length,
			skipped: this.tabs.filter((tab) => tab.skipped).length,
			clarification: this.clarificationEditor.getExpandedText().trim() ? 1 : 0,
		};
	}

	/** Named counts keep the close prompt concrete instead of a generic "unsaved work". */
	private dismissSummary(): string {
		const counts = this.dismissalCounts();
		return countSummary([
			{ count: counts.answers, one: "answer", many: "answers" },
			{ count: counts.notes, one: "note", many: "notes" },
			{ count: counts.custom, one: "custom answer", many: "custom answers" },
			{ count: counts.skipped, one: "skipped question", many: "skipped questions" },
			{ count: counts.clarification, one: "clarification draft", many: "clarification drafts" },
		]);
	}

	/** Close an empty form immediately; ask once before discarding real work. */
	requestDismiss(): void {
		if (!this.hasWork()) return this.done(null);
		this.dismissConfirm = true;
		this.feedback = "";
		this.invalidate();
		this.tui.requestRender();
	}

	isConfirmingDismiss(): boolean {
		return this.dismissConfirm;
	}

	/** Collapse-on-advance is the frame's decision; the form only reports the transition. */
	setAdvanceListener(listener: () => void): void {
		this.advanceListener = listener;
	}

	private toggleSkip(): void {
		const tab = this.getActiveTab();
		if (tab.skipped) {
			tab.skipped = false;
			this.feedback = "Draft restored. Use it or skip again.";
			this.focused = this._focused;
			this.tui.requestRender();
			return;
		}
		// Save custom drafts without losing their selection or optional note.
		if (this.editMode) this.saveOtherDraft();
		else this.syncAnswerFromTab();
		tab.note = this.noteEditor.getExpandedText();
		tab.skipped = true;
		this.editMode = false;
		this.noteFocused = false;
		this.noteActionFocused = false;
		this.otherEditor.focused = false;
		this.noteEditor.focused = false;
		this.editor.focused = false;
		if (this.tabs.every((candidate) => candidate.skipped || this.isAnswered(candidate))) this.openReview();
		else this.advance();
	}

	private advance(): void {
		if (this.tabs.every((candidate) => candidate.skipped || this.isAnswered(candidate))) this.openReview();
		else if (this.activeTab < this.tabs.length - 1) {
			this.selectTab(this.activeTab + 1);
			this.advanceListener?.();
		} else this.openReview();
	}

	private openReview(allowSkipped = false): void {
		if (this.noteFocused) this.leaveNoteFocus();
		// Ctrl+Enter preserves unfinished drafts without treating them as answers.
		if (this.editMode) this.preserveOtherDraft();
		else this.syncAnswerFromTab();

		const answeredCount = this.tabs.filter((tab) => this.isAnswered(tab)).length;
		if (allowSkipped && answeredCount === 0 && !this.tabs.every((tab) => tab.skipped)) {
			this.feedback = "Answer a question or explicitly skip every question first.";
			this.invalidate();
			this.tui.requestRender();
			return;
		}
		if (!allowSkipped) {
			for (let i = 0; i < this.tabs.length; i++) {
				const tab = this.tabs[i];
				if (!this.isAnswered(tab) && !tab.skipped) {
					this.activeTab = i;
					this.editMode = false;
					this.noteFocused = false;
					this.noteActionFocused = false;
					this.otherEditor.focused = false;
					this.noteEditor.focused = false;
					this.prepareActiveTab();
					this.feedback = `Answer or skip question ${i + 1} before Review.`;
					this.invalidate();
					this.tui.requestRender();
					return;
				}
			}
		}
		this.reviewing = true;
		this.feedback = "";
		this.partialReview = this.tabs.some((tab) => !tab.skipped && !this.isAnswered(tab));
		this.reviewScroll = 0;
		this.reviewEditDigits = "";
		this.editMode = false;
		this.noteFocused = false;
		this.noteActionFocused = false;
		this.otherEditor.focused = false;
		this.noteEditor.focused = false;
		this.editor.focused = false;
		this.invalidate();
		this.tui.requestRender();
	}

	private submitAll(): void {
		if (!this.reviewing) return this.openReview();
		// "Submit without unanswered" is an explicit decision, unlike merely opening Review.
		for (const tab of this.tabs) if (!tab.skipped && !this.isAnswered(tab)) tab.skipped = true;
		this.done(this.snapshot());
	}

	getHeaderLabel(): string {
		return this.reviewing ? "Review" : `${this.activeTab + 1} of ${this.tabs.length}`;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedRows = undefined;
		this.cachedLines = undefined;
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(val: boolean) {
		this._focused = val;
		this.invalidate();
		// Focus belongs to exactly one field. Review has no editable field.
		this.editor.focused = false;
		this.otherEditor.focused = false;
		this.noteEditor.focused = false;
		this.clarificationEditor.focused = false;
		if (this.reviewing) return;
		if (this.clarificationMode) {
			this.clarificationEditor.focused = val;
		} else if (this.editMode) {
			this.otherEditor.focused = val;
		} else if (this.noteFocused) {
			this.noteEditor.focused = val;
		} else {
			const tab = this.getActiveTab();
			if (tab?.mode === "text") {
				this.editor.focused = val && !tab.skipped && !this.noteActionFocused;
			}
		}
	}

	handleInput(data: string): void {
		// The confirmation owns the keyboard: no other key may reach an editor.
		if (this.dismissConfirm) {
			if (matchesKey(data, Key.enter) || matchesKey(data, Key.escape)) {
				this.dismissConfirm = false;
				this.done(null);
			} else if (data === "n" || data === "N") {
				this.dismissConfirm = false;
				this.invalidate();
				this.tui.requestRender();
			}
			return;
		}
		const activeEditor = this.clarificationMode ? this.clarificationEditor
			: this.reviewing ? undefined : this.editMode ? this.otherEditor
			: this.noteFocused ? this.noteEditor
			: this.getActiveTab()?.mode === "text" && !this.getActiveTab().skipped ? this.editor : undefined;
		if (handleFileCompletion(activeEditor, data)) {
			this.invalidate(); this.tui.requestRender(); return;
		}
		if (this.clarificationMode) {
			if (matchesKey(data, Key.escape)) {
				this.clarificationMode = false;
				this.clarificationEditor.focused = false;
				if (this.editMode) this.otherEditor.focused = this._focused;
				else if (this.noteFocused) this.noteEditor.focused = this._focused;
				else if (this.getActiveTab()?.mode === "text") this.editor.focused = this._focused && !this.getActiveTab().skipped && !this.noteActionFocused;
				this.feedback = "";
			} else if (isSubmitEnter(data)) {
				const clarification = this.clarificationEditor.getExpandedText().trim();
				if (!clarification) this.feedback = "Question required.";
				else return this.done({ action: "clarification", clarification, answers: this.clarificationSnapshot(), activeQuestionIndex: this.activeTab });
			} else {
				this.clarificationEditor.handleInput(data);
				this.feedback = "";
			}
			this.invalidate(); this.tui.requestRender(); return;
		}
		if (isAskAgentKey(data) && !this.reviewing) {
			if (this.editMode) this.preserveOtherDraft();
			else this.syncAnswerFromTab();
			this.clarificationMode = true;
			this.otherEditor.focused = false;
			this.noteEditor.focused = false;
			this.editor.focused = false;
			this.clarificationEditor.focused = this._focused;
			this.feedback = "";
			this.invalidate(); this.tui.requestRender(); return;
		}
		data = normalizeFocusCycleKey(data);
		if (this.reviewing) {
			if (matchesKey(data, Key.ctrl("r"))) { this.regenerate(); return; }
			if (this.keybindings.matches(data, "tui.select.up")) {
				this.reviewScroll = Math.max(0, this.reviewScroll - 1);
				this.invalidate();
				this.tui.requestRender();
				return;
			}
			if (this.keybindings.matches(data, "tui.select.down")) {
				this.reviewScroll++;
				this.invalidate();
				this.tui.requestRender();
				return;
			}
			if (matchesKey(data, Key.enter)) {
				if (this.reviewEditDigits) return this.selectTab(Number(this.reviewEditDigits) - 1);
				return this.submitAll();
			}
			if (matchesKey(data, Key.escape) && this.reviewEditDigits) {
				this.reviewEditDigits = "";
				this.feedback = "";
				this.invalidate(); this.tui.requestRender(); return;
			}
			if (matchesKey(data, Key.escape) || matchesKey(data, Key.left) || data.toLowerCase() === "b") {
				const firstPending = this.tabs.findIndex((tab) => !tab.skipped && !this.isAnswered(tab));
				const firstSkipped = this.tabs.findIndex((tab) => tab.skipped);
				this.selectTab(firstPending >= 0 ? firstPending : firstSkipped >= 0 ? firstSkipped : this.tabs.length - 1);
				return;
			}
			if (/^[0-9]$/.test(data)) {
				if (this.questions.length <= 9) {
					if (data !== "0") this.selectTab(Number(data) - 1);
				} else {
					const next = `${this.reviewEditDigits}${data}`;
					if (Number(next) > 0 && Number(next) <= this.questions.length) {
						this.reviewEditDigits = next;
						this.feedback = "";
					} else {
						this.reviewEditDigits = "";
						this.feedback = "No question with that number.";
					}
					this.invalidate(); this.tui.requestRender();
				}
			}
			return;
		}
		if (matchesKey(data, Key.ctrl("r"))) {
			this.regenerate();
			return;
		}
		if (matchesKey(data, Key.ctrl("enter")) || matchesKey(data, Key.alt("enter"))) {
			this.openReview(true);
			return;
		}
		if (matchesKey(data, Key.ctrl("s"))) {
			this.toggleSkip();
			return;
		}
		if (this.editMode) {
			if (matchesKey(data, Key.ctrl("c"))) {
				this.otherEditor.setText("");
				this.otherText = "";
				const tab = this.getActiveTab();
				tab.otherText = "";
				this.selected.delete("other");
				if (tab.mode === "multi-select") this.syncMultiSelectState();
				else tab.answer = null;
				this.invalidate();
				this.tui.requestRender();
				return;
			}
			if (matchesKey(data, Key.tab)) {
				this.focusNote();
				return;
			}
			// Alt+arrows move the visible option window; Ctrl+arrows and PageUp/Down stay native.
			if (matchesKey(data, Key.alt("up")) || matchesKey(data, Key.alt("down"))) {
				const scrolled = this.getOrCreateChoiceList(this.questions[this.activeTab]).scrollOptions(matchesKey(data, Key.alt("up")) ? -1 : 1);
				if (scrolled) {
					this.invalidate();
					this.tui.requestRender();
				}
				return;
			}
			if (matchesKey(data, Key.escape)) {
				this.preserveOtherDraft();
				this.editMode = false;
				this.otherEditor.focused = false;
				this.tabChoiceLists.get(this.activeTab)?.resetOptionScroll();
				this.invalidate();
				this.tui.requestRender();
				return;
			}
			this.otherEditor.handleInput(data);
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		// Note editor is focused
		if (this.noteFocused) {
			if (matchesKey(data, Key.tab) || isSubmitEnter(data)) {
				this.leaveNoteFocus();
				return;
			}
			if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
				this.discardNote();
				return;
			}
			this.noteEditor.handleInput(data);
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		if (this.noteActionFocused) {
			if (isSubmitEnter(data) || matchesKey(data, Key.space) || data === "+") this.openNote();
			else if (matchesKey(data, Key.tab) || matchesKey(data, Key.escape)) this.focusAnswer();
			return;
		}

		// A clipped question is the only Alt+↑/↓ target outside the custom-answer editor:
		// the choices below keep their own cursor keys.
		if (this.promptMaxScroll > 0 && (matchesKey(data, Key.alt("up")) || matchesKey(data, Key.alt("down")))) {
			const next = Math.max(0, Math.min(this.promptMaxScroll, this.promptScroll + (matchesKey(data, Key.alt("up")) ? -1 : 1)));
			if (next !== this.promptScroll) {
				this.promptScroll = next;
				this.invalidate();
				this.tui.requestRender();
			}
			return;
		}

		const tab = this.getActiveTab();
		if (!tab) return;
		if (this.feedback && !matchesKey(data, Key.ctrl("enter")) && !matchesKey(data, Key.alt("enter"))) {
			this.feedback = "";
		}

		if (!tab.skipped && tab.mode === "text" && matchesKey(data, Key.ctrl("c"))) {
			this.editor.setText("");
			tab.textBuffer = "";
			tab.committed = false;
			tab.answer = null;
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		// Unselecting is Ctrl+C, so Escape stays a single, predictable close gesture.
		if (!tab.skipped && tab.mode !== "text" && matchesKey(data, Key.ctrl("c"))) {
			this.selected = new Map();
			tab.selected = new Map();
			tab.answer = null;
			tab.otherText = "";
			this.otherText = "";
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		// Plain arrows edit free text; Ctrl+arrows navigate questions instead.
		if (matchesKey(data, Key.ctrl("left")) || tab.mode !== "text" && matchesKey(data, Key.left)) {
			this.selectTab((this.activeTab - 1 + this.tabs.length) % this.tabs.length);
			return;
		}
		if (matchesKey(data, Key.ctrl("right")) || tab.mode !== "text" && matchesKey(data, Key.right)) {
			this.selectTab((this.activeTab + 1) % this.tabs.length);
			return;
		}

		// Tab to focus note editor
		if (matchesKey(data, Key.tab)) {
			this.focusNote();
			return;
		}

		if (matchesKey(data, Key.escape)) {
			// Escape is a close gesture only. Unselecting stays on Ctrl+C so a close
			// attempt never silently changes the staged answer.
			this.requestDismiss();
			return;
		}

		// A retained draft is read-only until the user explicitly restores it.
		if (tab.skipped) {
			if (isSubmitEnter(data)) this.toggleSkip();
			else {
				this.feedback = "Skipped. Use Enter or Ctrl+S to restore and edit.";
				this.invalidate();
				this.tui.requestRender();
			}
			return;
		}

		if (tab.mode !== "text" && data === "+") {
			this.focusNote(); this.openNote(); return;
		}

		// A draft is not an answer until the user chooses Continue.
		if (tab.mode === "text" && isSubmitEnter(data)) {
			this.syncAnswerFromTab();
			if (!tab.textBuffer.trim()) {
				this.feedback = "Write an answer or skip this question.";
				this.invalidate(); this.tui.requestRender(); return;
			}
			tab.committed = true;
			tab.answer = tab.textBuffer;
			this.advance();
			return;
		}

		// Delegate to tab type
		if (tab.mode === "text") {
			this.editor.handleInput(data);
			tab.textBuffer = this.editor.getExpandedText() || "";
			tab.committed = false;
			tab.answer = null;
			this.invalidate();
			this.tui.requestRender();
		} else if (tab.mode === "single-select") {
			this.handleSingleSelectInput(data, tab);
		} else if (tab.mode === "multi-select") {
			this.handleMultiSelectInput(data);
		}
	}

	private handleSingleSelectInput(data: string, tab: TabState): void {
		const question = this.questions[this.activeTab];
		const choiceList = this.getOrCreateChoiceList(question);

		if (/^[1-9]$/.test(data)) {
			const index = parseInt(data, 10) - 1;
			if (index < choiceList.length) {
				choiceList.setSelectedIndex(index);
				const item = choiceList.selectedItem;
				if (item.isOther) {
					if (tab.selected.has("other")) this.advance();
					else this.openOtherEditor();
				} else if (tab.selected.has(item.id)) this.advance();
				else this.selectOption(tab, item);
				return;
			}
		}

		const action = choiceList.handleInput(data);
		if (action === "changed") {
			this.invalidate();
			this.tui.requestRender();
			return;
		}
		if (action === "confirm") {
			const item = choiceList.selectedItem;
			if (item.isOther) {
				if (tab.selected.has("other")) this.advance();
				else this.openOtherEditor();
			} else if (tab.selected.has(item.id)) this.advance();
			else this.selectOption(tab, item);
			return;
		}
		if (action === "cancel") {
			this.handleInput("\x1b");
		}
	}

	private selectOption(tab: TabState, item: WrappedChoiceItem): void {
		const answer: AskAnswer = {
			type: "option",
			label: item.option!.label,
			value: item.option!.value,
			index: item.index,
		} as OptionAnswer;
		tab.answer = answer;
		this.selected = new Map();
		this.selected.set(item.id, answer);
		tab.selected = new Map(this.selected);
		this.invalidate();
		this.tui.requestRender();
	}

	private openOtherEditor(): void {
		if (this.choiceList) {
			this.choiceList.selectOther();
			this.choiceList.resetOptionScroll();
		}
		const tab = this.getActiveTab();
		if (tab.mode === "single-select") {
			tab.answer = null;
			tab.selected = new Map();
			this.selected = new Map();
		}
		this.editMode = true;
		this.otherEditor.setText(this.otherText);
		this.otherEditor.focused = this._focused;
		this.invalidate();
		this.tui.requestRender();
	}

	private handleMultiSelectInput(data: string): void {
		const question = this.questions[this.activeTab];
		const choiceList = this.getOrCreateChoiceList(question);

		if (/^[1-9]$/.test(data)) {
			const index = parseInt(data, 10) - 1;
			if (index < choiceList.length) {
				choiceList.setSelectedIndex(index);
				this.toggleMultiChoice(choiceList.selectedItem);
				return;
			}
		}

		if (matchesKey(data, Key.space)) {
			this.toggleMultiChoice(choiceList.selectedItem);
			return;
		}

		const action = choiceList.handleInput(data);
		if (action === "changed") {
			this.invalidate();
			this.tui.requestRender();
		} else if (action === "confirm") {
			if (choiceList.selectedItem.isOther) this.openOtherEditor();
			else this.toggleMultiChoice(choiceList.selectedItem);
		} else if (action === "cancel") {
			this.handleInput("\x1b");
		}
	}

	private toggleMultiChoice(item: WrappedChoiceItem): void {
		if (item.isOther) this.toggleOther();
		else {
			this.toggleOption(item);
			this.syncMultiSelectState();
		}
	}

	private toggleOption(item: WrappedChoiceItem): void {
		const option = item.option;
		if (!option) return;
		if (this.selected.has(item.id)) this.selected.delete(item.id);
		else this.selected.set(item.id, {
			type: "option", label: option.label, value: option.value, index: item.index,
		} as OptionAnswer);
	}

	private toggleOther(): void {
		if (this.selected.has("other")) {
			this.selected.delete("other");
			this.syncMultiSelectState();
			return;
		}
		const cached = this.otherText.trim();
		if (cached) {
			this.selected.set("other", { type: "other", label: cached, value: cached });
			this.syncMultiSelectState();
			return;
		}
		this.openOtherEditor();
	}

	getMoreActions() {
		if (this.clarificationMode) return [
			{ label: "Clear question", key: "\x03", hint: "Ctrl+C" },
			{ label: "Insert a new line", key: "\x1b[13;2u", hint: "Shift+Enter" },
		];
		if (this.reviewing) return [
			...(this.canRegenerate() ? [{ label: "Regenerate unanswered questions", key: "\x12", hint: "Ctrl+R" }] : []),
			...this.questions.map((q, index) => ({ label: `Edit ${index + 1}: ${sanitizeDisplayText(q.question)}`, run: () => this.selectTab(index) })),
			{ label: "Discard and close", danger: true, run: () => this.requestDismiss() },
		];
		const tab = this.getActiveTab();
		const actions: MoreAction[] = [
			{ label: this.noteFocused ? "Save note and return to answer" : this.noteActionFocused ? "Back to answer" : "Add or edit note", run: () => this.noteFocused || this.noteActionFocused ? this.focusAnswer() : (this.focusNote(), this.openNote()) },
			{ label: tab.skipped ? "Restore question" : "Skip question (keep draft)", key: "\x13", hint: "Ctrl+S" },
			{ label: "Ask for clarification", key: "\x1b[47;5u", hint: "Ctrl+?" },
			{ label: "Review answers", key: "\x1b[13;5u", hint: "Ctrl/Alt+Enter" },
			{ label: "Previous question", run: () => this.selectTab(Math.max(0, this.activeTab - 1)) },
			{ label: "Next question", run: () => this.selectTab(Math.min(this.tabs.length - 1, this.activeTab + 1)) },
			{ label: "Discard and close", danger: true, run: () => this.requestDismiss() },
		];
		if (this.canRegenerate()) actions.push({ label: "Regenerate unanswered questions", key: "\x12", hint: "Ctrl+R" });
		if (this.noteFocused) actions.push({ label: "Discard note changes", danger: true, key: "\x03", hint: "Ctrl+C" });
		if (this.editMode || (tab.mode === "text" && !this.noteFocused)) {
			actions.push({ label: "Clear this field", key: "\x03", hint: "Ctrl+C" });
			actions.push({ label: "Insert a new line", key: "\x1b[13;2u", hint: "Shift+Enter" });
		}
		if (tab.mode !== "text" && !this.editMode && !this.noteFocused && !this.noteActionFocused) {
			actions.push({ label: "Clear selection", key: "\x03", hint: "Ctrl+C" });
		}
		return actions;
	}

	private renderActionBar(width: number): string[] {
		const lines: string[] = [];
		// The confirmation replaces the hint row: one banner, one obvious pair of answers.
		if (this.dismissConfirm) {
			renderDismissBanner(lines, width, this.theme, this.dismissSummary(), this.preserveDraftOnDismiss);
			return lines;
		}
		const th = this.theme;
		let tokens: HintToken[];
		if (this.clarificationMode) tokens = ["Enter Ask", "Esc Back"];
		else if (this.reviewing) {
			const pending = this.tabs.filter((tab) => !tab.skipped && !this.isAnswered(tab)).length;
			const editHint = this.questions.length <= 9 ? `1–${this.questions.length} Edit` : `1–${this.questions.length} then Enter Edit`;
			tokens = this.reviewEditDigits
				? [`Enter Edit ${this.reviewEditDigits}`, "Esc Clear number", "F2 More"]
				: [pending ? `Enter Submit without ${pending} unanswered` : "Enter Submit",
					...(this.canRegenerate() ? ["Ctrl+R Regenerate"] : []), editHint, "Esc Back", "F2 More"];
		} else {
			const tab = this.getActiveTab();
			const primary = this.noteFocused ? "Enter/Tab Save note" : this.noteActionFocused ? "Enter/+ Edit note" : this.editMode ? "Enter Save answer"
				: tab.skipped ? "Enter Restore" : this.primaryActionLabel(tab);
			if (this.noteFocused) tokens = [primary, { label: "Ctrl+C/Esc Discard note", tone: "error" }, "F2 More"];
			else if (this.noteActionFocused) tokens = [primary, "Tab/Esc Back", "F2 More"];
			else if (this.editMode) tokens = [primary, "Ctrl+C Clear", "Alt+↑/↓ Options", "Tab Note", "Esc Back",
				tab.skipped ? "Ctrl+S Restore" : "Ctrl+S Skip", "F2 More"];
			else tokens = [primary, tab.mode === "text" ? { label: "Tab Note", tone: "accent" } : { label: "+ Note", tone: "accent" },
				tab.skipped ? "Ctrl+S Restore" : "Ctrl+S Skip",
				...(this.canRegenerate() ? ["Ctrl+R Regenerate"] : []),
				...(this.tabs.some((candidate) => this.isAnswered(candidate)) || this.tabs.every((candidate) => candidate.skipped) ? ["Ctrl+Enter Review"] : []),
				...(this.tabs.length > 1 ? [tab.mode === "text" ? "Ctrl+←/→ Questions" : "←/→ Questions"] : []),
				{ label: "Esc Close", tone: "error" }, "F2 More"];
		}
		addActionHints(lines, width, th, tokens);
		return lines;
	}

	private primaryActionLabel(tab: TabState): string {
		if (tab.mode === "text") return tab.textBuffer.trim() ? "Enter Continue" : "Write answer";
		const item = this.getOrCreateChoiceList(this.questions[this.activeTab]).selectedItem;
		if (tab.mode === "single-select") return item?.isOther && !tab.selected.has(item.id) ? "Enter Edit" : tab.selected.has(item.id) ? "Enter Continue" : "Enter Select";
		return item?.isOther ? "Enter Edit" : "Enter/Space Toggle";
	}

	render(width: number): string[] {
		// Completion results arrive asynchronously; render the live editor state.

		const lines: string[] = [];
		const th = this.theme;
		const compactHeight = (this.tui.terminal?.rows ?? 40) < 20;
		const add = (text: string) => lines.push(truncateToWidth(text, width));

		add(th.fg("borderMuted", "─".repeat(width)));

		// The frame shows the current position; Review carries the full overview.
		if (width < 10) add(th.fg("muted", `${this.reviewing ? "Review" : `${this.activeTab + 1} of ${this.tabs.length}`}`));

		if (this.reviewing) {
			if (!compactHeight) lines.push("");
			const answeredCount = this.tabs.filter((candidate) => this.isAnswered(candidate)).length;
			const skippedCount = this.tabs.filter((tab) => tab.skipped).length;
			const pendingCount = this.tabs.length - answeredCount - skippedCount;
			const reviewTitle = `Review ${answeredCount} ${answeredCount === 1 ? "answer" : "answers"} · ${skippedCount} skipped${pendingCount ? ` · ${pendingCount} unanswered` : ""}`;
			add(th.fg("text", th.bold(reviewTitle)));
			if (this.feedback) add(th.fg("warning", ` ${this.feedback}`));
			lines.push("");
			const summaryLines: string[] = [];
			this.questions.forEach((question, index) => {
				const tab = this.tabs[index];
				const answers = Array.isArray(tab.answer) ? tab.answer : tab.answer ? [tab.answer] : [];
				const summary = this.isAnswered(tab)
					? `Answered — ${answers.map((answer) => typeof answer === "string" ? answer : answer.label).join(" · ")}`
					: tab.skipped ? "Skipped — answer and note won't be sent" : tab.textBuffer.trim() && tab.mode === "text" ? "Unanswered — draft not sent" : "Unanswered";
				const questionPrefix = `${index + 1}. `;
				addWrappedWithPrefix(
					summaryLines,
					th.fg("muted", questionPrefix),
					th.fg("muted", sanitizeDisplayText(question.question)),
					width,
					" ".repeat(visibleWidth(questionPrefix)),
				);
				addWrappedWithPrefix(summaryLines, "   ", th.fg("accent", sanitizeDisplayText(summary)), width, "   ");
				if (tab.note.trim()) addWrappedWithPrefix(summaryLines, "   ", th.fg("dim", `Note${tab.skipped ? " (not sent)" : !this.isAnswered(tab) ? " (not sent if skipped)" : ""}: ${sanitizeDisplayText(tab.note.trim())}`), width, "   ");
				summaryLines.push("");
			});
			const actionLines = this.renderActionBar(width);
			const budget = Math.max(0, (this.tui.terminal?.rows ?? 40) - lines.length - actionLines.length - 2);
			const window = fitLineWindow(summaryLines.length, budget, this.reviewScroll);
			this.reviewScroll = window.start;
			if (window.above) add(th.fg("dim", ` ↑ ${window.start} more`));
			lines.push(...summaryLines.slice(window.start, window.start + window.count));
			if (window.below) add(th.fg("dim", ` ↓ ${summaryLines.length - window.start - window.count} more`));
			add(th.fg("borderMuted", "─".repeat(width)));
			lines.push(...actionLines);
			add(th.fg("accent", "─".repeat(width)));
			constrainFrameHeight(lines, this.tui.terminal?.rows, actionLines.length + 2);
			this.cachedWidth = width;
			this.cachedRows = this.tui.terminal?.rows;
			this.cachedLines = lines;
			return lines;
		}

		const tab = this.getActiveTab();
		const q = this.questions[this.activeTab];

		if (this.clarificationMode) {
			if (!compactHeight) lines.push("");
			addWrapped(lines, th.fg("text", th.bold("What are you wondering about?")), width);
			lines.push("");
			for (const line of this.clarificationEditor.render(Math.max(1, width - 2))) add(` ${sanitizeEditorDisplay(line)}`);
			if (this.feedback) add(th.fg("warning", ` ${this.feedback}`));
			const actionLines = this.renderActionBar(width);
			add(th.fg("borderMuted", "─".repeat(width)));
			lines.push(...actionLines);
			add(th.fg("accent", "─".repeat(width)));
			constrainFrameHeight(lines, this.tui.terminal?.rows, actionLines.length + 2);
			this.cachedWidth = width; this.cachedRows = this.tui.terminal?.rows; this.cachedLines = lines;
			return lines;
		}

		// The question is its own region: it never borrows the choices' rows, and the
		// host decides each region's height from the measured chrome once.
		const promptLines: string[] = [];
		addWrapped(promptLines, th.fg("text", th.askAppearance?.questionText === "normal" ? sanitizeDisplayText(q.question) : th.bold(sanitizeDisplayText(q.question))), width);
		if (q.details) addWrapped(promptLines, th.fg("muted", ` ${sanitizeDisplayText(q.details)}`), width);

		const statusLines: string[] = [];
		if (tab.skipped) addWrapped(statusLines, th.fg("warning", "Skipped · answer and note not sent. Ctrl+S restores."), width);
		else if (tab.mode === "text" && tab.textBuffer.trim() && !tab.committed) addWrapped(statusLines, th.fg("muted", "Draft · press Enter to use this answer."), width);
		if (this.feedback) statusLines.push(truncateToWidth(th.fg("warning", ` ${this.feedback}`), width));

		// A native one-line note action, not a second bordered editor panel.
		const noteLines: string[] = [];
		renderOptionalNote(noteLines, width, th, this.noteEditor, this.noteFocused, tab.mode === "multi-select" ? 9 : tab.mode === "single-select" ? 10 : 2, this.noteActionFocused);
		const actionLines = this.renderActionBar(width);

		// Text answers hold a fixed editor region instead of a measured choice list.
		const choiceList = tab.mode === "text" ? null : this.getOrCreateChoiceList(q);
		const measured = choiceList?.measure(Math.max(1, tab.mode === "single-select" ? width - 1 : width), {
			selectedAnswers: tab.mode === "multi-select" ? this.selected : tab.selected,
			inlineOtherEditor: this.editMode ? this.otherEditor : undefined,
			showRadio: tab.mode === "single-select",
		});
		const headerRows = tab.mode === "multi-select" ? 2 : 0;
		const fullNeed = (measured ? measured.full + measured.tail : 5) + headerRows;
		const compressedNeed = (measured ? measured.compressed + measured.tail : 5) + headerRows;

		const totalRows = this.tui.terminal?.rows ?? Number.POSITIVE_INFINITY;
		// Blank A precedes the question, B separates it from the choices, C and D close
		// the body. Tight chrome keeps only B so the question and choices can stay whole.
		const chromeRows = (spacedBlanks: boolean) => 1 + (width < 10 ? 1 : 0)
			+ (compactHeight ? 0 : spacedBlanks ? 4 : 1)
			+ statusLines.length + noteLines.length + 1 + actionLines.length + 1;
		const spacedContent = Math.max(0, totalRows - chromeRows(true));
		const tightContent = Math.max(0, totalRows - chromeRows(false));
		// Spaced chrome with full detail wins; each step below trades decoration, then
		// detail, then the question's height — the last resort keeps two prompt rows.
		let spaced = true;
		let windowed = false;
		let optionRows = fullNeed;
		if (promptLines.length + fullNeed > spacedContent) {
			if (promptLines.length + compressedNeed <= spacedContent) {
				optionRows = compressedNeed;
			} else if (promptLines.length + fullNeed <= tightContent) {
				spaced = false;
			} else if (promptLines.length + compressedNeed <= tightContent) {
				spaced = false;
				optionRows = compressedNeed;
			} else {
				spaced = false;
				windowed = true;
				optionRows = Math.min(compressedNeed, Math.max(0, tightContent - Math.min(promptLines.length, 2)));
			}
		}
		const promptRows = windowed ? Math.max(0, tightContent - optionRows) : promptLines.length;

		// Blank A belongs to the spaced layout only: tight chrome keeps just the
		// separator between the question and its choices, and the budget knows it.
		if (spaced && !compactHeight) lines.push("");

		const promptWindow = fitLineWindow(promptLines.length, promptRows, this.promptScroll);
		this.promptScroll = promptWindow.start;
		// No row to scroll into means no scroll: the keys stay inert rather than move
		// an offset nothing can show.
		this.promptMaxScroll = promptWindow.count === 0 ? 0 : Math.max(0, promptLines.length - promptWindow.count);
		if (promptWindow.above) add(th.fg("dim", `↑ ${promptWindow.start} more lines · Alt+↑`));
		lines.push(...promptLines.slice(promptWindow.start, promptWindow.start + promptWindow.count));
		if (promptWindow.below) add(th.fg("dim", `↓ ${promptLines.length - promptWindow.start - promptWindow.count} more lines · Alt+↓`));

		if (!compactHeight) lines.push("");

		if (tab.mode === "text") {
			this.renderTextTab(width, lines, add, th);
		} else if (tab.mode === "single-select") {
			this.renderSingleSelectTab(width, lines, add, th, tab, q, optionRows);
		} else if (tab.mode === "multi-select") {
			this.renderMultiSelectTab(width, lines, add, th, q, optionRows);
		}

		lines.push(...statusLines);
		if (spaced && !compactHeight) lines.push("");

		lines.push(...noteLines);
		if (spaced && !compactHeight) lines.push("");

		add(th.fg("borderMuted", "─".repeat(width)));
		lines.push(...actionLines);
		add(th.fg("accent", "─".repeat(width)));
		constrainFrameHeight(lines, this.tui.terminal?.rows, actionLines.length + 2);

		this.cachedWidth = width;
		this.cachedRows = this.tui.terminal?.rows;
		this.cachedLines = lines;
		return lines;
	}

	private renderTextTab(width: number, lines: string[], add: (text: string) => void, th: any): void {
		add(th.fg("accent", "─".repeat(width)));
		const editorPadding = width > 2 ? 1 : 0;
		const editorIndent = " ".repeat(editorPadding);
		for (const line of this.editor.render(Math.max(1, width - editorPadding * 2))) {
			add(`${editorIndent}${sanitizeEditorDisplay(line)}`);
		}
	}

	private getOrCreateChoiceList(question: QuestionDef): WrappedChoiceList {
		const existing = this.tabChoiceLists.get(this.activeTab);
		if (existing) {
			this.choiceList = existing;
			return existing;
		}

		const choiceList = new WrappedChoiceList(
			question.options,
			getOtherLabel(question.options),
			Math.min(question.options.length + 1, 8, Math.max(1, Math.floor((this.tui.terminal?.rows ?? 24) / 4))),
			this.keybindings,
			this.theme,
		);
		this.choiceList = choiceList;
		this.tabChoiceLists.set(this.activeTab, choiceList);
		return choiceList;
	}

	private renderSingleSelectTab(width: number, lines: string[], add: (text: string) => void, _th: any, tab: TabState, q: QuestionDef, availableLines: number): void {
		const choiceList = this.getOrCreateChoiceList(q);
		for (const line of choiceList.render(Math.max(1, width - 1), {
			selectedAnswers: tab.selected,
			inlineOtherEditor: this.editMode ? this.otherEditor : undefined,
			showRadio: true,
			availableLines,
		})) {
			// WrappedChoiceList sanitizes model text and the inline editor at
			// their source. Keep its trusted theme styles (and cursor) intact.
			add(` ${line}`);
		}
	}

	private renderMultiSelectTab(width: number, lines: string[], add: (text: string) => void, th: any, q: QuestionDef, availableLines: number): void {
		const choiceList = this.getOrCreateChoiceList(q);
		const choiceBudget = Math.max(0, availableLines - 2);

		if (this.selected.size > 0) {
			add(th.fg("success", ` ✓ ${this.selected.size} selected`));
		} else {
			add(th.fg("dim", " ○ Select options below"));
		}
		lines.push("");
		lines.push(...choiceList.render(width, {
			selectedAnswers: this.selected,
			inlineOtherEditor: this.editMode ? this.otherEditor : undefined,
			availableLines: choiceBudget,
		}));
	}
}
