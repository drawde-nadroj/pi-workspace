# Home: design-system direction

## Brief

Make pi unmistakable: clean, alive, personal, and visually coherent when more extensions arrive. The first shell proved native-editor compatibility and response/idle timing, but changing frame colors was not enough. The live design lab explored several visual identities; the user has now selected Glasshouse / Bioluminescent, refined into an evergreen forest with pastel wandering fireflies.

The session name is a primary identifier, not incidental footer text. Response duration and time since completion remain readable in every direction.

## What is implemented now

- Production Biolume shell, plus Hearth/Studio/Orbit, with persistent session identity, response/idle timing, and independently collapsible forest artwork.
- Biolume now has one continuous frame/surface system for identity, forest, checklist, native input and footer, plus an optional matching runtime palette for native conversation/tool output. `/home theme off` restores preceding colors without disabling the workspace.
- The approved cat is a fixed shared asset: preserve its native silhouette and expression detail. Responsive layouts hide the complete scene before cropping, squashing or replacing the character.
- Consistent three-cell content insets, a clear gap around the checklist, muted inherited rules, and reset-safe input backgrounds replace the disconnected banner/editor composition. Short plans show every step; longer plans have explicit overflow, not silent two-row truncation.
- Standalone `pi-tasks`: per-session/branch work plans, optional Home dock/native fallback, editable overlay, and an independent `/tasks off` switch. Lightweight context tracking; no automatic continuation.
- `/home lab`: an isolated, interactive preview of Prism, Terrarium, Arcade Studio, and the new Glasshouse hybrid.
- Glasshouse's three lighting moods: Bioluminescent, Kaleidoscopic, and Sunlit. They share a scene engine and component language, not three independent UI implementations.
- A common semantic palette shape and shared composition, panel, badge, progress, task, and activity treatments.
- State-based animation rather than unrelated looping decorations.
- The lab still uses fully labeled **sample data**; the production dock displays committed real task state.

The user approved bringing Biolume into the everyday shell, selected lightweight tracking and per-session plans, and explicitly required Tasks to remain independently switchable. These choices now define the production implementation. The existing gallery remains an isolated preview.

See [TODO-RESEARCH.md](TODO-RESEARCH.md) for source-backed comparisons of OMP, Claude Code, OpenCode, Hermes, relevant agent-planning research, and the work-plan rationale. See [DOCK.md](DOCK.md) for the small versioned production integration contract. The lab drawing primitives remain internal and experimental.

## Three art directions

### Prism

Layered charcoal, lavender/cyan accents, selective rails instead of outlines everywhere. A custom orbital pi sigil is the main moving focal point; a directional highlight ties activity to the composer. Plugin panels are quiet, filled surfaces with aligned headers and rows.

### Terrarium

Warm natural colors on a deep green surface. An original pixel cat and plant inhabit a compact night desk. Agent states become character behaviors: attention, motion, waiting, celebration, and sleep. Task completion is echoed by small lit windows, while the actual task text remains conventional and readable.

### Arcade Studio

A block-built HOME wordmark, mint/lilac accents, segmented marks, mission-board headers, and a command deck. State transitions feel tactile and deliberate. This is not a points economy: task counts express real completion in a future integration, not productivity scores or work-hour streaks.

## Glasshouse: the combined direction

Feedback favored Prism's movement and the cat, with a love of plants and psychedelic imagery. Glasshouse combines those preferences into one botanical workspace. Its gallery scene combines procedural foliage, the shared cat sprite, and animated pastel light. Following the user's explicit preference for both actual evergreen trees and evergreen/pastel colors, Bioluminescent now contains layered conifers, moss, ferny understory, and small pastel mushroom caps. The user found orbital geometry out of place among trees and selected wandering fireflies instead. Bioluminescent now uses independent, smoothly interpolated paths and asynchronous light pulses around the fixed logo, without ring shapes or starburst completion effects. The existing trees, cat, palette, and panel layout are retained. Kaleidoscopic and Sunlit keep their earlier houseplant scene and orbital effects for comparison. The cat watches the light, occasionally reaches toward a spark, shows attention when blocked, and sleeps at idle.

Lighting is a separate dimension from structure:

- **Bioluminescent:** deep pine-green surfaces, sage foliage, and pastel lavender, blush, mint, butter, and apricot light. A forest clearing rather than a neon tropical garden.
- **Kaleidoscopic:** plum, a broader spectrum, and additional petal-like orbital geometry.
- **Sunlit:** cream, soft greens, coral, lavender, and yellow-green accents.

The same task/activity/composer treatments receive the palette. The preview's `G` control changes lighting without resetting its clock or pause state. This lets the user compare the same moment, rather than treating the palettes as another three designs to choose between.

The mood palettes are contained within the overlay. They never write to pi's global theme settings. Future production lighting could remain switchable; an automatic time-of-day mode is **not** implemented or assumed.

## Shared language

### Semantic roles

- Surfaces: `base`, `panel`, `input`, `inset`.
- Typography: `text`, `muted`, `faint`.
- Identity: `accent`, `secondary`, `glow`.
- States: `success`, `warning`, `error`.
- Structure: `line` and controlled accent interpolation steps.

Dark and light variants are explicit. A future plugin asks for a role, not a hard-coded hex color.

### Components

The lab currently shares Canvas composition, panels, badges, progress, task rows, and activity rows. The next stable component set should include:

- Identity strip and status chips
- Panel and panel header
- Task row and progress summary
- Activity row and compact status
- Keyboard hint and empty state
- Consistent picker/drawer/overlay surfaces

Spacing, icon meaning, selected state, truncation, and compact behavior belong to the design system. Plugin authors should not reinvent them.

### Motion

- One significant moving focal point per region.
- The transcript and user's text do not move for decoration.
- Ongoing work, waiting for input, completion, and error have distinct treatments.
- Completion flourishes are brief; successful tool execution is not automatically the same as successful user work.
- Motion must have a static alternative. Text labels never depend on animation or color alone.
- The lab has its own shared 20 Hz scheduler, a freeze control, and a 1 Hz clock-only mode. It stops on disposal. The existing shell retains its separate, lower-frequency scheduler.
- Any production scene must fit in a small dock; the enlarged lab scene is for comparison, not a commitment to permanently consume this much transcript space.

## Plugin integration — v1 implemented, wider slots remain future work

A visual host should own layout, palette, and animation coordination. Plugins should publish typed, session-scoped data and actions into named slots, rather than each replacing pi's editor/footer independently.

Candidate slots:

1. **Identity:** session name, project, branch.
2. **Activity:** current run and pending attention.
3. **Dock:** compact task/tool/other plugin summaries.
4. **Drawer:** expanded details, keyboard accessible.
5. **Footer:** model, context, response duration, idle age.

`pi-tasks` is the first real consumer. It owns task state, commands, tool exposure, context summaries, and its enabled preference. Home supplies a bounded compact view through [dock v1](DOCK.md). If Home is disabled or absent, Tasks uses its own native/text fallback. Turning Tasks off withdraws its display and behavioral integration, preserving the complete named-plan library and Home's appearance. Tasks v2 keeps separate plans for substantial requests, with browse-only history, explicit current-plan selection and reversible archives. A closed plan leaves the dock after a brief acknowledgment; the full plan remains saved. Its own raised modal uses an opaque, slightly lighter pine surface and accent boundary rather than blending into the host.

V1 implements the dock, availability/acknowledgement handshake, session scoping, optional semantic palette, withdrawal, and native fallback. It deliberately does not implement a general callback/action registry or every candidate slot above. Future extensions should motivate additions rather than committing to an oversized framework.

Do not promise arbitrary third-party extension layouts will automatically inherit this system. They must opt in or receive an adapter.

## Library decision

No additional runtime dependency is needed for this iteration.

- The installed **`@earendil-works/pi-tui`** already exposes `oklchColor`, `okhslColor`, `colorToOklch`, `colorToOkhsl`, and `mixColors` (OKLCH mixing by default). The forest's ambient pastel gradients and 16-level firefly brightness ramps use these public helpers and cache the results per palette. Existing width/input/theme/rendering helpers remain the terminal foundation.
- **[Culori](https://github.com/Evercoder/culori)** is a credible future option for broader color-space conversions, interpolation, blending, and color-difference calculations. For the current palette, it would largely duplicate pi's capabilities. Evaluated, not installed.
- **[Tween.js](https://github.com/tweenjs/tween.js)** could help when many scene or plugin state transitions need coordinated easing. It operates on object properties and explicitly does not own an animation loop, so it could be advanced from our shared clock. Current wandering, orbital, and sway animation is simpler as deterministic functions of time. Evaluated, not installed.
- Do not add another full TUI framework or a browser/canvas runtime to render a small scene inside pi. Keep one terminal renderer and preserve the native editor.

Original procedural art and the shared half-block compositor remain sufficient. Improving silhouettes, palette, and choreography matters more here than adding a graphics dependency. If authored sprite assets eventually replace the procedural art, that can be a separate build-time workflow without requiring an image protocol at runtime.

## Pi integration boundary

Use pi's public editor factories, widgets, footer/header factories, custom overlays, theme helpers, and event bus. Retain the native editor engine and one terminal renderer.

A permanent sidebar that reserves width beside pi's native transcript is not directly exposed by the current extension API. Start with an above-editor dock and expandable overlay/drawer. A reserved full-height sidebar would require a separate core integration decision, not an undocumented monkey patch.

## Review checklist

Review the live previews in your actual font and terminal:

- Which silhouette is recognizable without its colors?
- Does the animation remain pleasant after a minute, not just a screenshot?
- Are the session name and both timing states easy to locate?
- Do sample task and activity panels look like parts of the same product?
- What should shrink or disappear when the terminal gets small?
- Would a companion be a defining feature or an optional add-on?

Choose a coherent combination of structure and character. Glasshouse now demonstrates this synthesis, with three independently switchable lighting moods. Do not grow multiple independently maintained design systems merely because the lab contains multiple prototypes.
