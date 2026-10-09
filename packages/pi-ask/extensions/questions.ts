import { questionCall, questionResult } from "./ask-user-question/question-history.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth } from "@earendil-works/pi-tui";
import { askMultiChoice, askSingleChoice, askText, customWithAbort } from "./ask-user-question/standalone-ui.ts";
import { addWrappedWithPrefix, sanitizeDisplayText } from "./ask-user-question/tui-primitives.ts";
import { TabbedQuestions, type BatchUIResult } from "./ask-user-question/batch-ui.ts";
import {
	AskQuestionsParams, AskUserQuestionParams, type AskUserQuestionMode, type AskUserQuestionResultDetails,
	type BatchQuestionResultDetails, type QuestionDef, type TextAnswer,
	batchCancelledResult, batchUnavailableResult, buildBatchClarificationResult, buildBatchResult, buildClarificationResult, buildRegenerateResult,
	buildResult, cancelledResult, skippedResult, normalizeOptions, unavailableResult,
} from "./ask-user-question/domain.ts";

let uiLock = Promise.resolve();

function withUILock<T>(fn: () => Promise<T>): Promise<T> {
	const prev = uiLock;
	let release: () => void;
	uiLock = new Promise<void>((r) => { release = r; });
	return prev.then(fn).finally(() => release!());
}

/**
 * Tell external agent-state integrations that Pi is waiting on a person.
 * `finally` is the ownership boundary: every active event is cleared even
 * when the dialog is cancelled, aborted, or fails unexpectedly.
 */
async function withHerdrBlocked<T>(
	pi: ExtensionAPI,
	label: string,
	fn: () => Promise<T>,
): Promise<T> {
	pi.events.emit("herdr:blocked", { active: true, label });
	try {
		return await fn();
	} finally {
		pi.events.emit("herdr:blocked", { active: false });
	}
}

export default function askUserQuestion(pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user_question",
		label: "Question",
		renderShell: "self",
		description:
			"Ask the user a single question and pause execution until they answer or explicitly skip it. Supports choices or a multiline free-form response when options are omitted. Use this when requirements are ambiguous, user preferences are needed, a decision would materially affect implementation, or you need confirmation before proceeding. Ask exactly one question per tool call, and prefer multiple separate tool calls over bundling unrelated questions together.",
		promptSnippet:
			"Use this tool to ask exactly one clarifying question, missing-requirement question, preference question, or decision question before continuing.",
		promptGuidelines: [
			"Ask exactly one question per tool call.",
			"If you need answers to multiple questions, make multiple separate ask_user_question tool calls instead of combining them into one prompt.",
			'Provide options for choice and decision questions. Write concise, neutral option labels that still make sense beneath the question in a completed record; put rationale in description or suggestion. Users can write a custom answer with "Something else…" and add an optional note.',
			"Omit options for open-ended questions that ask the user to describe or explain something, or to share an experience; this opens a multiline free-form response.",
			"Use multiSelect: true only when you provide options and need multiple answers to the same question.",
			"Ask only when the answer will change the exploration or next action; use open-ended questions before narrowing an exploratory conversation to a menu.",
			"Do not mark an option as suggested just because it is first, familiar, or conventional. Use suggestion with kind and a concrete basis tied to evidence or the user's stated priorities; include a caveat when it could change. Leave options unendorsed if the deciding criterion is unknown.",
			"The suggestion is your judgment, not verification by this tool. Distinguish evidence from inferred personal fit; do not use the deprecated recommended flag or a '(Recommended)' label.",
			"Prefer this tool over guessing when requirements, preferences, or implementation choices are unclear.",
			"Use this tool when multiple valid implementation paths exist and the preferred path depends on user choice.",
			"If ask_user_question returns clarification_requested, answer the clarification and immediately call ask_user_question again with the original question before continuing work.",
		],
		parameters: AskUserQuestionParams,

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const optionsProvided = params.options !== undefined;
			const options = normalizeOptions(params.options);
			if (optionsProvided && options.length === 0) {
				throw new Error("ask_user_question requires at least one non-empty option when options are provided");
			}
			if (!optionsProvided && params.multiSelect) {
				throw new Error("ask_user_question multiSelect requires options");
			}
			const context = params.details?.trim() || undefined;
			const mode: AskUserQuestionMode = !optionsProvided
				? "text"
				: params.multiSelect ? "multi-select" : "single-select";

			if (signal?.aborted) {
				return cancelledResult(params.question, mode, context);
			}

			if (!ctx.hasUI || ctx.mode !== "tui") {
				return unavailableResult(params.question, mode, "ask_user_question requires interactive TUI mode", context);
			}

			return withUILock(async () => {
				if (signal?.aborted) return cancelledResult(params.question, mode, context);
				return withHerdrBlocked(pi, "Waiting for your answer", async () => {
					if (mode === "text") {
						const result = await askText(ctx, params.question, context, signal);
						if (!result) return cancelledResult(params.question, mode, context);
						if ("action" in result) return result.action === "skip"
							? skippedResult(params.question, mode, context)
							: buildClarificationResult(params.question, context, mode, options, result.clarification);
						const answer: TextAnswer = { type: "text", label: result.answer, value: result.answer };
						return buildResult(params.question, context, mode, [answer], result.note);
					}

					if (mode === "single-select") {
						const result = await askSingleChoice(ctx, params.question, context, options, signal);
						if (!result) return cancelledResult(params.question, mode, context);
						if ("action" in result) return result.action === "skip"
							? skippedResult(params.question, mode, context)
							: buildClarificationResult(params.question, context, mode, options, result.clarification);
						return buildResult(params.question, context, mode, [result.answer], result.note);
					}

					const result = await askMultiChoice(ctx, params.question, context, options, signal);
					if (!result) return cancelledResult(params.question, mode, context);
					if ("action" in result) return result.action === "skip"
						? skippedResult(params.question, mode, context)
						: buildClarificationResult(params.question, context, mode, options, result.clarification);
					return buildResult(params.question, context, mode, result.answer, result.note);
				});
			});
		},

		renderCall: questionCall,
		renderResult: questionResult,
	});

	// ──────────────────────────────────────────────────────────
	// ask_questions — batch multi-question form
	// ──────────────────────────────────────────────────────────


	pi.registerTool({
		name: "ask_questions",
		label: "Questions",
		renderShell: "self",
		description:
			"Ask the user multiple related questions in a sequential form. Review shows answered, explicitly skipped and unanswered questions separately; a single Submit action finalizes the stated answers.",
		promptSnippet:
			"Use this tool to ask multiple related questions at once in a sequential form.",
		promptGuidelines: [
			"Use ask_questions for 2+ related questions where the answers are needed together. For a single question, use ask_user_question instead.",
			"Provide options for choice and decision questions; use concise, neutral option labels that still make sense beneath the question in a completed record, with rationale in description or suggestion. Omit options for open-ended prompts that ask the user to describe, explain, or share an experience. Use multiSelect only with options.",
			"Add a short label for semantic progress when useful; notes are optional.",
			"The user reviews completed answers before an explicit Submit and may intentionally skip unanswered questions; custom answers remain distinct.",
			"Ask only when an answer will change the exploration or next action. For exploration, use open-ended questions before narrowing to a menu. Do not suggest an option merely because it is first or conventional.",
			"Use suggestion with kind and a concrete basis tied to evidence or stated priorities, plus a caveat when needed. Leave choices unendorsed if the deciding criterion is unknown. This tool does not verify your suggestion; do not use the deprecated recommended flag or a '(Recommended)' label.",
			"If the result status is regenerate, use the answered entries and notes as new understanding, do not repeat resolved questions, and immediately call ask_questions again with revised unanswered questions only.",
			"If ask_questions returns clarification_requested, answer the clarification, keep resolved answers as context, and immediately call ask_questions again with revised unanswered questions only.",
		],
		parameters: AskQuestionsParams,

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const questions: QuestionDef[] = params.questions.map((q: any, index: number) => {
				const optionsProvided = q.options !== undefined;
				const opts = normalizeOptions(q.options);
				if (optionsProvided && opts.length === 0) {
					throw new Error(`ask_questions question ${index + 1} requires at least one non-empty option when options are provided`);
				}
				if (!optionsProvided && q.multiSelect) {
					throw new Error(`ask_questions question ${index + 1} cannot use multiSelect without options`);
				}
				const mode: AskUserQuestionMode = !optionsProvided
					? "text"
					: q.multiSelect ? "multi-select" : "single-select";
				return { question: q.question, label: q.label?.trim() || undefined, details: q.details?.trim() || undefined, mode, options: opts };
			});

			if (signal?.aborted) return batchCancelledResult(questions);

			if (!ctx.hasUI || ctx.mode !== "tui") {
				return batchUnavailableResult(questions);
			}

			return withUILock(async () => {
				if (signal?.aborted) return batchCancelledResult(questions);
				return withHerdrBlocked(pi, "Waiting for your answers", async () => {
					const result: BatchUIResult = await customWithAbort<any>(
						ctx,
						signal,
						(tui: any, theme: any, kb: any, done: (r: any) => void) =>
							new TabbedQuestions(questions, tui, theme, kb, done, ctx.cwd),
					);
					if (!result) return batchCancelledResult(questions);
					if (!Array.isArray(result)) {
						if (result.action === "clarification") return buildBatchClarificationResult(questions, result.answers, result.activeQuestionIndex, result.clarification);
						return buildRegenerateResult(questions, result.answers);
					}
					return buildBatchResult(questions, result);
				});
			});
		},

		renderCall: questionCall,
		renderResult: questionResult,
	});
}
