# Frame presentation: developing and requesting features

## Describe the experience, not the implementation

You do not need to name functions, choose an extension, or specify every setting. Start with what you want to notice and what should stay quiet. Screenshots, rough sketches, motion references and phrases such as “a soft white glint, not a loading spinner” are useful.

A strong request covers the relevant parts of this template:

> **Surface:** Where should this appear? Persistent overview, transient acknowledgement, tool card, editor rail, question, or a new panel?
>
> **Purpose and hierarchy:** What should I understand at a glance? What belongs in the header, body, secondary metadata, expanded view or raw view? Which facts must remain visible?
>
> **States:** How should idle, working, waiting, completion, blockers and errors differ? What event triggers a transition? Do not imply activity from a stale task status alone.
>
> **Border:** Base color, highlight color, shimmer versus pulse, direction, speed, strength, repeat versus single pass.
>
> **Text:** Which labels or rows need color, bold or a gentle color pulse? Which content must stay completely still? What does emphasis mean?
>
> **Placement:** Which of the six rails should hold title, counts or the more-work hint? What should yield first in a narrow pane?
>
> **Controls:** Which choices should be available in live settings? What should be the default? What should Undo and Discard restore?
>
> **Safeguards:** What happens while typing, reading, selecting, answering a question, resizing, or using reduced motion/light theme? What must not change in the underlying data?

You can leave decisions open: “Pick restrained defaults, show me the alternatives, and keep the mechanism reusable.” The assistant should propose the missing choices rather than inventing task facts.

### Example that uses the current feature set

> For the persistent Tasks overview, prioritize the active task and blockers, with completed/total in the upper-right and additional-open-work count in the lower-right rail. Keep the title upper-left and normal text neutral. While work is actually running, send a soft white highlight clockwise around a purple border every four seconds at medium intensity. Keep body text still, but let the title have a very gentle color pulse. Give progress changes one fresh sweep. Waiting should be still; blockers amber and errors red, with written explanations. Let me change colors, positions, text emphasis, effect, timing, strength and state rules in `/footer`, with demo states and Save/Discard/Undo. Preserve the native editor and task data; stop live motion while typing or answering a question.

That request maps to existing package capabilities. Applying it to another surface still requires an integration adapter and tests; installing the package does not restyle everything automatically.

### Requests that extend the package

You can also ask for effects that are not implemented yet, for example a multi-stop static gradient, a moving light across individual text cells, or coordinated transitions among several panels. State the desired behavior and constraints, and say **“add this as a reusable package capability, not a Home-only effect.”**

This release provides a travelling border shimmer, whole-border pulse and gentle uniform text-color pulse. It does **not** provide arbitrary shaders, moving letters, font changes, independent per-character animations, a global layout engine, or a replacement editor. No need to constrain your ideas to these limits—but an implementation should distinguish configuration from new development.

## How development should use the package

The dependency direction is:

```text
Task/tool/application state → thin semantic adapter → frame presentation package
                                                     ↓
                                              host terminal redraw
```

The application remains authoritative about real work. The package owns rules such as “working repeats a shimmer, blocked uses amber, progress changes sweep once.” Those rules are configurable. A Pi adapter supplies focus/dialog/typing/reduced-motion facts rather than implementing a second visual state machine.

### Managed-clock component

Create this inside a mounted component or explicit interaction, not at module load:

```ts
import {
  createFrameController, framePresentationDefaults, presentationRows,
  type FrameFacts,
} from "pi-embeddable-frame/presentation";

const style = framePresentationDefaults();
style.periodMs = 4000;
style.intensity = 0.65;
style.textEffect = "labels";
style.states.blocked = { borderColor: "warning", motion: "off" };

const motion = createFrameController({
  automatic: true,
  requestRender: () => tui.requestRender(),
});
let facts: FrameFacts = { state: "idle", revision: "initial" };

const component = {
  update(next: FrameFacts) {
    facts = next;
    motion.update(facts, style);
    tui.requestRender();
  },
  invalidate() {},
  render(width: number) {
    const frame = motion.update({ ...facts, visible: width >= 24 }, style);
    return presentationRows({
      theme, width, presentation: style, frame,
      title: "Review", summary: "3/7 done", // Example data, not inferred facts.
      rows: [{ text: "Review rendering changes", role: "active" }],
    });
  },
  dispose() { motion.dispose(); },
};
```

The integration must call `update` when lifecycle/safety facts change, including when the component becomes hidden. No package can discover a task's status or an editor's focus without a supplied connection. On branch/plan replacement use `reset()` to establish a fresh revision baseline. Use `dispose()` when the component leaves the UI; a disposed controller does not restart.

### Existing shared clock

Home already has a scheduler. It uses `createFrameController()` without `automatic`, updates it with current facts, and uses the returned `active` flag to select its frame cadence. Rendering passes the returned sample to `presentationRows`. No second live animation timer is created for Tasks. The settings demo is a separate, disposable interaction and uses managed-clock mode.

Do not infer work from frame animation, parse display labels back into application state, or change tool results to achieve a visual effect. Keep state, stored content, input ownership and presentation separate.

### Example: a separate tool extension's presentation adapter

For a tool you own, keep the original result renderer and compute a small visual header from your **sourced** state. This pure adapter can be called by your own component at its real width; it does not register a tool or replace Pi's editor:

```ts
import { frameRows, statusPreset } from "pi-embeddable-frame/primitives";

function renderMyTool(theme, width, resultRows, toolState) {
  // toolState comes from the tool's execution lifecycle, not from a label or demo.
  const status = statusPreset({ state: toolState, appearance: theme.appearance });
  return frameRows({
    theme, width, rows: resultRows, inset: 1,
    color: theme.colors.borderAccent,
    corners: {
      topLeft: theme.style(` ${status.marker} My tool `, { fg: status.color }),
      bottomRight: theme.style(` ${status.label} `, { fg: status.color }),
    },
  });
}
```

Call it only for renderers whose text rows you can safely wrap; pass through graphical, self-rendering or incompatible results untouched. Preserve the original component's expansion and mouse coordinates. On resize, render with the new width. For a future shared settings room, define your surface's own validated visual slots and preference authority first; Frame does not create a global workspace registration or store your tool data.

### Persisting settings

Store a `FramePresentation` as versioned JSON and validate it with `readFramePresentation` when reading it. Do not persist controller instances, frame timestamps or demo state. Keep one preference authority per surface; Home uses `pi-footer.json` → `tasks` for this integration.

### Definition of done for another integration

- Meaningful facts and information hierarchy, not just a new border.
- Static, working, waiting, progress, blocked/error and disabled-motion behavior.
- Light/dark colors, ANSI/Unicode widths, narrow panes and resize.
- Bounded timers, single-pass completion, reset/hide/disposal and reload.
- Native cursor/IME, Vim, mouse selection and draft behavior preserved where relevant.
- Save, Undo, Discard and failed-save rollback if settings are exposed.
- Representative visual captures, with live-terminal verification reported separately from automated tests.

## Using the first integration

1. Run `/reload` after the code update.
2. Open `/footer` and choose **Tasks**. Keyboard: Tab cycles Elements → Properties → Other options → Tasks → Ask → Transcript; arrows and Enter navigate.
3. Choose **Demo state** to inspect working, waiting, blocked, error, idle or done without starting real work. Use **Replay progress sweep** for a one-shot demonstration.
4. Scroll through controls for colors, text, timing, placement and state overrides. Each state has its own override controls.
5. **Save** commits; **Undo** reverses edits; **Discard** restores the original settings. Demo state is never saved. Escape backs out before discarding.

The persistent overview uses sourced counts and prioritizes open work. `/tasks` remains the full plan/history browser. Its legacy `prev`, `next`, `follow` and focus/compact settings still control the independent no-Home fallback, not the new overview. Hiding or disabling Tasks still removes the overview and does not erase the plan.
