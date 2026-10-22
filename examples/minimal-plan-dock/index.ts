/**
 * A copyable Tasks-style dock provider. One tool, one session entry, one validated
 * snapshot: it shows the whole contract without copying the suite.
 *
 * It is deliberately a *provider*, not a host. A host answers `DOCK.probe` and
 * acknowledges `DOCK.update`; Workspace does that. An extension that answered
 * probes with `available: true` while rendering nothing would make every other
 * provider suppress its native fallback.
 */
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { DOCK, isHost, isSnapshot, validOverview, type DockHost, type DockSnapshot } from "pi-agent-contracts/dock";

const TOOL = "example_plan";
const ENTRY = "example-plan:v1";
const SNAPSHOT_ID = "example-plan";
const MAX_ITEMS = 12;

type Item = { title: string; doneWhen?: string };
type Plan = { version: 1; revision: string; title: string; items: Item[] };

const emptyPlan = (): Plan => ({ version: 1, revision: "r1", title: "Untitled plan", items: [] });

/** Session data is untrusted after a reload: validate it instead of casting. */
function restore(value: unknown): Plan {
  if (value === undefined) return emptyPlan();
  const plan = value as Plan;
  if (!plan || plan.version !== 1 || typeof plan.revision !== "string" || typeof plan.title !== "string" ||
    !Array.isArray(plan.items) ||
    !plan.items.every(item => item && typeof item.title === "string" &&
      (item.doneWhen === undefined || typeof item.doneWhen === "string"))) throw new Error("invalid example plan");
  return { version: 1, revision: plan.revision, title: plan.title, items: plan.items.slice(0, MAX_ITEMS) };
}

/** A bounded framed card: no colour, no width overflow, honest field names. */
function card(title: string, open: number, expanded: boolean, width: number): string[] {
  if (width < 16) return [];
  const inner = width - 4;
  const head = truncateToWidth(` ${title} · ${open} open `, width - 2, "…");
  const row = (text: string) => "│ " + truncateToWidth(text, inner, "…").padEnd(inner) + " │";
  const rows = ["╭" + head + "─".repeat(Math.max(0, width - 2 - visibleWidth(head))) + "╮"];
  rows.push(row(`${open} open item${open === 1 ? "" : "s"} · example_plan`));
  if (expanded) rows.push(row("State lives in one session entry: example-plan:v1."));
  rows.push("╰" + "─".repeat(width - 2) + "╯");
  return rows;
}

export default function examplePlanDock(pi: ExtensionAPI) {
  let ctx: ExtensionContext | undefined, plan = emptyPlan(), announced = false;
  const sessionId = () => ctx?.sessionManager.getSessionId() ?? "";

  /** Build, validate, then publish. Invalid state is never emitted. */
  function publish() {
    if (!ctx) return;
    const open = plan.items;
    const snapshot: DockSnapshot = {
      version: 1, sessionId: sessionId(), id: SNAPSHOT_ID, title: plan.title,
      rows: open.slice(0, MAX_ITEMS).map(item => ({ text: item.title, tone: "text" as const })),
      hint: "/example-plan",
      overview: { revision: plan.revision, total: open.length, done: 0, blocked: 0, cancelled: 0 },
    };
    if (!isSnapshot(snapshot) || !validOverview(snapshot.overview!)) {
      if (!announced) ctx.ui.notify("example-plan: internal state was not publishable; nothing was sent.", "warning");
      announced = true;
      return;
    }
    announced = false;
    pi.events.emit(DOCK.update, snapshot);
  }

  function commit(next: Plan) {
    pi.appendEntry(ENTRY, next); // Persist before publishing: a reload must see the same plan.
    plan = next;
    publish();
  }

  pi.registerTool({
    name: TOOL, label: "Example plan", renderShell: "self",
    description: "Demonstration plan for the dock contract. Sets the plan title and, when given, replaces the open items.",
    parameters: Type.Object({
      title: Type.String({ maxLength: 200 }),
      items: Type.Optional(Type.Array(Type.Object({
        title: Type.String({ maxLength: 200 }),
        doneWhen: Type.Optional(Type.String({ maxLength: 400 })),
      }), { maxItems: MAX_ITEMS })),
    }),
    async execute(_callId, params, _signal, _onUpdate, context) {
      if (!ctx || context.sessionManager.getSessionId() !== sessionId()) throw new Error("Example plan session changed; retry.");
      const items = (params.items ?? []).map(item => ({ title: item.title, ...(item.doneWhen ? { doneWhen: item.doneWhen } : {}) }));
      commit({ version: 1, revision: `r${Date.now().toString(36)}`, title: params.title, items });
      return {
        content: [{ type: "text", text: `Example plan “${params.title}” · ${items.length} open item${items.length === 1 ? "" : "s"}` }],
        details: { title: params.title, revision: plan.revision, items },
      };
    },
  });

  /** The newest plan entry on the current branch is the only source of truth. */
  function load(context: ExtensionContext) {
    ctx = context;
    let value: unknown;
    for (const entry of context.sessionManager.getBranch())
      if (entry.type === "custom" && entry.customType === ENTRY) value = entry.data;
    try { plan = restore(value); }
    catch (error) {
      plan = emptyPlan();
      context.ui.notify(`example-plan: ${String(error)}. History was not overwritten.`, "warning");
    }
  }

  pi.on("session_start", async (_event, context) => {
    load(context);
    // Ask any mounted host to advertise itself; a host replies on DOCK.host.
    pi.events.emit(DOCK.probe, { version: 1, sessionId: sessionId() });
    publish();
  });

  // The documented seam for drawing a tool call. `next()` is what Pi would use
  // without us, so unknown and third-party tools are returned untouched; Pi wraps
  // whatever we return in a MouseRegion that toggles `expanded` on click.
  pi.registerToolRenderer((name, next) => {
    const base = next();
    if (name !== TOOL || !base) return base;
    return {
      ...base,
      renderShell: "self",
      renderResult: (_result, _options, _theme, context) => ({
        render: width => card(plan.title, plan.items.length, context.expanded, width),
        invalidate() {},
      }),
    };
  });

  // Only the matching host answer is trusted, and only for this session.
  pi.events.on(DOCK.host, (value) => {
    const host = value as DockHost | undefined;
    if (!isHost(host) || !ctx || host.sessionId !== sessionId()) return;
    if (host.available) publish();
  });

  // A branch switch is a different plan history, not a re-render.
  pi.on("session_tree", (_event, context) => { load(context); publish(); });
}
