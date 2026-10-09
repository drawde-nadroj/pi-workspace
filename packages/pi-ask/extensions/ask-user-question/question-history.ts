import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { addWrappedWithPrefix, sanitizeDisplayText } from "./tui-primitives.ts";
import { suggestionLabel } from "./domain.ts";
import { questionTheme } from "./question-surface.ts";

/** One question/answer pair per card. Original choices are opt-in on expansion. */
export function questionHistory(args: any, result: any | undefined, sourceTheme: any, expanded = false) {
  const theme = questionTheme(sourceTheme);
  return {
    invalidate() {},
    render(width: number) {
      if (width <= 0) return [];
      const framed = width >= 10, inner = Math.max(1, width - (framed ? 4 : 0));
      const output: string[] = [];
      const details = result?.details;
      const questions = details?.questions ?? args?.questions ?? [{ question: details?.question ?? args?.question, details: details?.context ?? args?.details, options: details?.options ?? args?.options }];
      for (let index = 0; index < questions.length; index++) {
        const rows: string[] = [], q = questions[index];
        const add = (text: unknown, tone = "text", prefix = "", bold = false) => {
          for (const line of String(text ?? "").split("\n")) {
            const safe = sanitizeDisplayText(line) || " ";
            addWrappedWithPrefix(rows, prefix, theme.fg(tone, bold ? theme.bold(safe) : safe), inner, " ".repeat(visibleWidth(prefix)));
          }
        };
        add(q?.question || "Question");
        if (result) {
          const batch = Array.isArray(details?.questions);
          const answer = batch ? details.answers?.find((a: any) => a.questionIndex === index) : undefined;
          const value = batch ? answer?.answer : details?.answers;
          const values = Array.isArray(value) ? value : value == null ? [] : [value];
          const labels = values.map((a: any) => typeof a === "string" ? a : a?.label ?? a?.value ?? "");
          rows.push("");
          const status = details?.skippedQuestionIndexes?.includes(index) || details?.status === "skipped" ? "Skipped"
            : details?.status === "cancelled" ? "Cancelled"
            : details?.status === "unavailable" ? "Unavailable" : "Not answered";
          const mode = batch ? q?.mode : details?.mode;
          const freeform = mode === "text" || (values.length > 0 && values.every((a: any) => typeof a === "string" || a?.type === "other" || a?.type === "text"));
          if (labels.length) {
            for (const label of labels) add(label, "accent", freeform ? "" : "✓ ", true);
          } else add(status, "muted");
          const note = batch ? answer?.note ?? details?.unansweredNotes?.find((n: any) => n.questionIndex === index)?.note : details?.note;
          if (note) { rows.push(""); add("Your note", "muted", "", true); add(note); }
          if (details?.clarification && (!batch || details.activeQuestionIndex === index)) {
            rows.push(""); add("Your question", "muted", "", true); add(details.clarification);
          }
        }
        if (!result || expanded) {
          if (q?.details) { rows.push(""); add(q.details, "muted"); }
          const options = q?.options ?? args?.options ?? [];
          if (options.length) { rows.push(""); add("Original choices", "muted", "", true); }
          for (const [optionIndex, option] of options.entries()) {
            add(String(option.label).replace(/\s*\(Recommended\)$/i, ""), "text", `${optionIndex + 1}. `);
            if (option.description) add(option.description, "muted", "   ");
            if (option.suggestion?.basis?.trim()) {
              add(suggestionLabel(option.suggestion.kind), "muted", "   ");
              add(`Why: ${option.suggestion.basis.trim()}`, "muted", "   ");
              if (option.suggestion.caveat?.trim()) add(`Caveat: ${option.suggestion.caveat.trim()}`, "muted", "   ");
            }
          }
        }
        if (index === questions.length - 1) {
          if (details?.message) add(details.message, "muted");
          if (result && !details) for (const block of result.content ?? []) if (block.type === "text") add(block.text);
        }
        if (index) output.push("");
        if (!framed) { output.push(...rows); continue; }
        const title = questions.length > 1 ? truncateToWidth(` ${index + 1} `, width - 2, "") : "";
        const rail = (top: boolean) => theme.fg("borderAccent", (top ? "╭" : "╰") + (top ? title : "") + "─".repeat(Math.max(0, width - 2 - (top ? visibleWidth(title) : 0))) + (top ? "╮" : "╯"));
        output.push(rail(true), ...rows.map(row => theme.fg("borderAccent", "│") + " " + row + " ".repeat(Math.max(0, inner - visibleWidth(row))) + " " + theme.fg("borderAccent", "│")), rail(false));
      }
      return output;
    },
  };
}

/** The live form owns the prompt. The result owns the transcript summary.
 * Never duplicate the form in the host's separate call slot. */
export function questionCall(_args: any, _theme: any, _context: any) {
  return { invalidate() {}, render(_width: number) { return []; } };
}
export function questionResult(result: any, options: any, theme: any, context: any) {
  if (context?.state) context.state.hasQuestionResult = true;
  return questionHistory(context?.args ?? {}, result, theme, options.expanded);
}
