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
			"Ask one consequential question and pause until the user answers or explicitly skips it. First investigate what you can and form a provisional judgment. Ask when plausible answers would change the next action and the answer belongs to the user, cannot be found in available evidence, and cannot be handled by a stated, reversible assumption. Supports choices or a multiline free-form response when options are omitted.",
		promptSnippet:
			"Ask one question only when its answer would change your next action; otherwise investigate or proceed with a stated assumption.",
		promptGuidelines: [
			"Ask exactly one question per tool call.",
			"If multiple consequential answers are needed together, use ask_questions; keep unrelated questions separate and do not combine them into one prompt.",
			'Provide options for choice and decision questions. Write concise, neutral option labels that still make sense beneath the question in a completed record; put rationale in description or suggestion. Users can write a custom answer with "Something else…" and add an optional note.',
			"Omit options for open-ended questions that ask the user to describe or explain something, or to share an experience; this opens a multiline free-form response.",
			"Use multiSelect: true only when you provide options and need multiple answers to the same question.",
			"Before asking, use the request, existing context, and practical investigation to separate findable facts, safe reversible assumptions, and decisions that belong to the user. Form a provisional judgment; no question is a good outcome when you can proceed.",
			"Ask only when plausible answers would materially change your next action and you cannot responsibly resolve the difference yourself. Briefly show the relevant finding or trade-off and what the answer changes. For technical choices, investigate and recommend a path before asking the user to choose; for exploration, begin open-ended rather than forcing a premature menu.",
			"After an answer, use it to update your understanding and work. Ask a follow-up only if a new consequential uncertainty emerges; do not ask just to keep a question loop going.",
			"Do not mark an option as suggested just because it is first, familiar, or conventional. Use suggestion with kind and a concrete basis tied to evidence or the user's stated priorities; include a caveat when it could change. Leave options unendorsed if the deciding criterion is unknown.",
			"The suggestion is your judgment, not verification by this tool. Distinguish evidence from inferred personal fit; do not use the deprecated recommended flag or a '(Recommended)' label.",
			"Do not guess at consequential user preferences. Multiple valid paths alone do not require a question when available evidence supports a reversible choice.",
			"If clarification_requested, answer the clarification, then reconsider whether the original question still matters. Re-ask only if it does; otherwise explain the changed understanding and proceed.",
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
			"Ask multiple related, consequential questions in a sequential form only when their answers are needed together. Investigate and form a provisional judgment first; omit questions that do not change the next action. Review shows answered, explicitly skipped and unanswered questions separately; Submit finalizes the stated answers.",
		promptSnippet:
			"Use this tool to ask multiple related questions at once in a sequential form.",
		promptGuidelines: [
			"Use ask_questions only for 2+ related, independently consequential questions whose answers are needed together. Prefer one pivotal question over a comprehensive questionnaire; for a single question use ask_user_question.",
			"Provide options for choice and decision questions; use concise, neutral option labels that still make sense beneath the question in a completed record, with rationale in description or suggestion. Omit options for open-ended prompts that ask the user to describe, explain, or share an experience. Use multiSelect only with options.",
			"Add a short label for semantic progress when useful; notes are optional.",
			"The user reviews completed answers before an explicit Submit and may intentionally skip unanswered questions; custom answers remain distinct.",
			"First use existing context and practical investigation to form a provisional judgment. Ask only when plausible answers materially change the next action and the answer belongs to the user, not to available evidence or a safe reversible assumption. Show the trade-off and why the answer matters; for exploration use open-ended questions before narrowing to a menu. No questions is a valid outcome. Do not suggest an option merely because it is first or conventional.",
			"Use suggestion with kind and a concrete basis tied to evidence or stated priorities, plus a caveat when needed. Leave choices unendorsed if the deciding criterion is unknown. This tool does not verify your suggestion; do not use the deprecated recommended flag or a '(Recommended)' label.",
			"If the result status is regenerate, incorporate answered entries and notes, then reconsider every unanswered question. Drop resolved or inconsequential questions; ask only the essential revised questions, or explain why none remain and proceed.",
			"If clarification_requested, answer the clarification and keep resolved answers as context. Reconsider the unresolved questions before re-asking; withdraw questions that no longer matter and proceed when none remain.",
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
