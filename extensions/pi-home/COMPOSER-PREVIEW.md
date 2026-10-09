# Native composer preview

Run `/reload`, then `/composer-preview`. This is a temporary native Pi overlay, not a replacement editor or a saved design. It focuses on the region from working status through the footer, without the forest scene or transcript.

All displayed identity, paths, model, task counts, Git state, context usage and times are **sample data**. There are no model calls, shell commands, task updates, session entries, preference writes, or reads/writes of the real draft. Closing discards the test draft and preview options.

## Controls

| Key | Action |
| --- | --- |
| `1`–`6` | Typing, working, tools, waiting, finished, error |
| Left / Right or Tab / Shift+Tab | Previous / next state |
| Space | Start the state tour, pause it, or resume it |
| `R` | Replay the tour from typing |
| `E` | Edit the local demo draft |
| Enter or Escape **while editing** | Return to preview controls; never send |
| `D` | Expand/collapse sample task/tool details |
| `V` | Compare luminous, firefly, and Braille-wave treatments |
| `M` | Toggle decorative motion; working duration still updates |
| `I` | Toggle Nerd Font / plain icons |
| `N` | Compare a 58-column pane with the available width |
| Escape **outside editing** | Close the preview |
| Ctrl+C / Ctrl+D | Close from either mode |

State tabs and the demo input support clicks in fullscreen mode. Keyboard controls also work in regular terminal mode. While editing, ordinary keys—including digits and preview shortcuts—are draft text.

You can start at a specific state with `/composer-preview tools`, or another state name from the table. The preview opens in manual mode. The optional tour spends four seconds in each sample state and stops after the error example; it is a set of examples, not a claim about a real workflow.

## What to evaluate

- Input and footer positions remain fixed across states and detail expansion.
- Work has one indicator and one duration. The cumulative active total is absent during work.
- Waiting and error states stop the busy animation and make the issue visible.
- Run completion is distinct from task completion; the finished example still has a remaining task.
- Sent/reply times remain near, but separate from, Tasks.
- Session title/context occupy the left column. Directory is directly above the model/level in a shared right column. Detailed sample Git appears separately at wider widths.
- The bare context rail holds a constant sample 42%, with no tinted capsule. Only brightness animates, not a false progress value.

The demo test field is **single-line**, using Pi's native `Input` for Unicode, paste, scrolling and cursor/IME placement. It is not a test of full multiline editor behavior. The live `/home composer` implementation uses Pi's full native editor and shortcuts, not this test field.

The preview respects Home's saved motion-off and icon preferences when it opens, but changes made here are temporary. It uses a contained light/dark palette. No packages or second terminal renderer are needed.

At least 38 columns by 22 terminal rows are needed for the full composition. A small terminal displays a resize notice and keeps exit controls available. Resizing does not delete the local draft.

## Verification

```sh
node --test agent/extensions/pi-home/tests/*.test.mjs agent/extensions/pi-tasks/tests/*.test.mjs
```

Tests cover width/height bounds, state and treatment changes, directory/model alignment, fixed input position, local draft isolation, Unicode and focus markers, animation scheduling, tour pause/resume, cancellation/shutdown, mouse input, invalid arguments, and non-TUI safety. They do not establish the visual quality of a user's font or terminal. No production application is implied by passing tests or opening this preview.
