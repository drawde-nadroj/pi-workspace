# pi-embeddable-frame

An installable presentation package for **embedded** terminal frames. It does not register a tool or replace the editor. Use the passive primitives (`frameRows`, `frameRail`, `paintFramePerimeter`) or the opt-in state-driven layer (`presentationRows`, `createFrameController`). The package owns reusable styling, visual state rules and motion mechanics; integrations supply truthful content/state, host repaint access, focus/input facts and lifecycle boundaries.

See **[FEATURE-GUIDE.md](FEATURE-GUIDE.md)** for development examples and how to describe a feature without knowing the API.

```ts
import { frameRows } from "pi-embeddable-frame/primitives";

const lines = frameRows({
  theme,
  width,
  rows: editor.render(width - 4),
  inset: 1,
  corners: { topLeft: " Question ", topRight: " 1 of 3 ", bottomLeft: " Esc back " },
  color: theme.colors.borderAccent,
  textColor: theme.colors.muted,
  // Animation is opt-in and should be driven by actual work, not an input prompt.
  motion: { active: running, now: Date.now(), accent: theme.colors.toolTitle },
});
```

All six rail positions (`topLeft`, `topCenter`, `topRight`, `bottomLeft`, `bottomCenter`, `bottomRight`) are optional. Center labels stay centered in terminal cells; side labels truncate before the center on narrow rails. For essential side labels, omit optional hints at small widths in the embedding extension. The frame's interior is the caller's content. Labels can already contain independent ANSI styling; `textColor` is a single fallback for unstyled labels. A `surface(text, width)` callback can preserve a host's background and text-color contract. Lines respect visible terminal cell widths and narrow frames fall back to unframed rows. `frameRail` builds one rail for editors that already own their content rows; `paintFramePerimeter` animates existing rails without touching input content.

## Entry points and upgrades

Use **`pi-embeddable-frame/primitives`** for `frameRail`, `frameRows`, `paintFramePerimeter`, `statusPreset` and their types. Use **`pi-embeddable-frame/presentation`** for the state-driven layer. The root keeps all exports for compatibility, but integrations should import these dedicated entries rather than the root barrel.

A long-running Pi process can retain **both** an older JavaScript root namespace and an older package export map across `/reload`. The first can silently discard center labels; the second can reject a new entry with `Package subpath './primitives' is not defined by "exports"` and stop the integrating extension from loading. Dedicated entries alone do **not** solve both cases.

The local Home/Tasks integration uses `agent/lib/frame.ts`; pi-ask has a self-contained `extensions/ask-user-question/frame.ts` bootstrap. They resolve the established root entry with `createRequire(import.meta.url).resolve("pi-embeddable-frame")` without evaluating its old namespace, then import the sibling `primitives.js` and, where needed, `presentation.js` by file URL. This uses the one package-owned implementation, not a copied renderer, and does not clear global caches or change user settings. The implementation files must be updated together with the integration. Public subpath imports remain the normal API for updated installations and for types; the bootstrap handles this local in-process migration.

Run `/reload` in each existing Pi process after the integration update. Regression coverage must include an old export table as well as old code, and real reload failure/recovery—not only fresh startup. This does not promise that Pi reloads every arbitrary future native dependency change.

## Design tips for a coherent terminal UI

Treat color as a small **visual grammar**, not a rule to paint every word alike:

- **Surface identity:** use the border color for a primary label, such as a chat name, question title, or message speaker.
- **Related metadata:** use a quieter, readable shade of that hue for a timestamp, model name, path, or question progress. Do not force every secondary label to the same intensity as the title.
- **Semantic state:** permit a distinct success, warning, or error color when it communicates something different from the border. A neutral tool border with a colored status symbol is intentional; a failed tool may warrant an error-colored border too. If the border represents thinking level, a completed-run label represents another state and need not match it.
- **Content:** keep draft text, Markdown, code, tool results, and question wording at readable theme text colors. A frame color is not a replacement for syntax or Markdown styling. Terminal applications normally share the terminal's font; bold, italic, spacing, and Markdown rendering can make the editor and transcript *look* different without setting different typefaces.

For example, style a centered title with the border color, style quieter corner metadata separately, and leave pre-rendered content alone:

```ts
const border = theme.colors.borderAccent;
const lines = frameRows({ theme, width, rows: messageRows, color: border,
  corners: {
    topCenter: theme.style(" Chat name ", { fg: border }),
    bottomRight: theme.fg("muted", " 19:42 "),
  },
});
```

These are suggestions, not automatic package policies. Choose the border's *meaning* for each surface before selecting colors; test light/dark contrast, ANSI labels, emoji/CJK widths, short panes, and disabled color. Motion should follow actual work and stop while the user reads or types.

## Optional tool-status preset

`statusPreset({ state, appearance, attention, markers, colors, labels })` returns a `{ marker, color, label }` presentation for `preparing`, `running`, `returned`, `failed`, `cancelled`, or `observed`. The default markers and light/dark colors match Home's tool cards; each can be overridden independently. For example:

```ts
const status = statusPreset({ state: toolState, appearance: theme.appearance });
const rows = frameRows({ theme, width, rows: resultRows, corners: { topLeft: ` ${status.marker} Search ` }, color: status.color });
```

This preset does **not** inspect Pi tool metadata, change execution state, or schedule a rerender. The caller determines its own state, passes the current value on render, and keeps ownership of tool lifecycle and content.

## State-driven presentation

The public entry is **`pi-embeddable-frame/presentation`**. The root still re-exports it for compatibility. Presentation imports its passive primitives directly, not through the root barrel. Home's Tasks adapter and settings demo use the reload bootstrap described above so an old cached package export map cannot reject this newer entry.

`framePresentationDefaults()` creates fresh version-1, serializable settings. `readFramePresentation(value)` validates colors, enums, positions and state rules, bounds period to 1.2–12 seconds and intensity to 0–1, and ignores unknown fields.

- Independent border, highlight, title, metadata, body and active-row colors; title/active-row bold.
- Theme colors or exact six-digit hex. The `highlight` token is soft white on dark themes and dark ink on light themes. Custom colors are not automatically contrast-corrected.
- Title, summary and optional hint in any of the six rail positions; same-position fields are combined. Tasks uses the bottom-right hint for additional open work rather than spending a body row.
- Shimmer or whole-border pulse, clockwise/counterclockwise direction, cycle duration and intensity.
- Optional gentle text-color pulse on labels, active rows, or both. Text is never moved, replaced or written back to source data.
- Default `work`, `changes`, or `off` motion. State overrides for `idle`, `working`, `waiting`, `done`, `blocked`, and `error` can choose `repeat`, `change`, or `off` plus independent colors. Global off and safety facts always win.

`createFrameController()` is external-clock by default and creates **no timer**. `update(facts, settings, now)` consumes semantic state, a revision token, and `suspended`, `reducedMotion`, `visible` facts. `sample(now)` advances the effect; `.active` reports whether frames are needed. The first revision establishes a baseline, not a replay. `reset()` clears history; `dispose()` is terminal and idempotent.

With `{ automatic: true, requestRender }`, it owns one timer, capped at 30 Hz. Timers stop on safety gates, completion of a one-shot, reset and disposal. Integrations with a scheduler—such as Home—use external-clock mode instead. No timer starts merely by importing the package or creating a controller.

`presentationRows({ theme, width, rows, title, summary, hint, presentation, frame })` uses the active state rule and renders optional semantic rows (`text`, `active`, `muted`, `warning`, `error`). Pass native input through the passive primitives instead until the integration has verified its cursor, IME, hit targets and selection contract. This release does not globally apply effects to editors or transcript tools.

## First integration: persistent Home Tasks

`/footer` → **Tasks** offers live display-only state demonstrations, colors, motion, text emphasis/effects, rail positions, title and row count, plus per-state overrides. It shares the existing Save/Discard/Undo transaction and `pi-footer.json` settings authority. No task, message or run clock is changed by the demo.

Home supplies sourced task counts and open-work rows through the dock bridge. The overview is independent of the legacy `/tasks` focus browser: active tasks come first, then blockers and pending work; completed work is counted rather than consuming rows. The independent no-Home Tasks fallback retains its existing appearance and browsing behavior. Historical tool acknowledgements are not animated by this integration.

Default motion is a quiet accent border with a near-white travelling highlight while an actual run and active task are present. Progress changes can sweep once. Waiting, typing, lost editor focus, blocking prompts, hidden/narrow frames, settings interactions and motion-off stop live motion. Explicit settings demos have their own disposable controller; reduced-motion settings still apply.

## Verification for the Tasks integration

- Frame + Home + Tasks suite: **217/217 passed**, `/tmp/pi-frame-final-tests.log`.
- Scoped strict TypeScript (new presentation/settings/workspace code, footer and Tasks integration): passed, `/tmp/pi-frame-scoped-tsc.log`.
- Full Home strict check still reports four diagnostics in the untouched `sent-messages.ts` native metadata accesses, `/tmp/pi-frame-tsc.log`. Those are not fixed or represented as clean by this change.
- Package dry-run includes runtime, declarations and both guides: `/tmp/pi-frame-pack.log`.
- Text/ANSI captures cover 24/40/90/140 columns, light/dark and working/waiting/blocked/done: `/tmp/pi-task-presentation-captures.{txt,ansi}`. Text captures were inspected; controller tests verify changing colors without changing geometry/content, finite sweeps, safety gates and timer cleanup.
- No automatic reload or live terminal/font animation verification was performed. Run `/reload`, then use `/footer` → Tasks for the explicit preview.

## Install and develop

```bash
pi install ./packages/pi-frame  # relative to ~/.pi/agent/settings.json
```

The package contains no auto-loaded extension (`pi.extensions` is empty). Install it as a dependency of an integrating package, or make it resolvable to a local extension; merely installing it does **not** change any Pi surfaces. It uses Pi's host-provided `@earendil-works/pi-tui` as a peer. For a distributed integration, publish this package first and list `pi-embeddable-frame` under that integration's runtime `dependencies`. For this local setup `~/.pi/agent/node_modules/pi-embeddable-frame` links to the sibling package; the link is a development/install mechanism, not part of the published tarball.

No part of this package records messages or changes tool execution. Passive primitives never schedule rendering. The optional controller can request host redraws through its supplied callback; integrations provide lifecycle/safety facts and dispose it. State-to-appearance decisions live in the package's configurable rules, not duplicated in each extension.
