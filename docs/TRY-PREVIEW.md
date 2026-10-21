# Try a reversible appearance preview

This short exercise shows the difference between **accepting a temporary edit**, **Undo**, and **Save**. You will change a synthetic name label, undo it and leave without saving. It does not send a message, call a model or change an account name.

## Before you start

Use an installed, loaded suite on a compatible Pi 1.3.0 host. Start with an empty input prompt, no agent work running and no other dialog open. Preserve any valuable draft with your normal workflow before starting; do not overwrite it just to enter a slash command. Use Pi's default text-field keybindings for the keys below. You need the terminal keyboard; hover is not required. For installation, use [the local suite guide](INSTALL.md). For a credential-free sandbox, use [isolated review](ACCEPTANCE.md#repeatable-isolated-review).

Do not submit an agent prompt during this exercise. The suite is not a permission or network sandbox. Do not open the separately saved `/composer`, `/tasks` preference or recap controls as part of this appearance-only exercise.

## Preview and undo a name

1. In Pi, enter `/workspace`. The drawer starts in **Input**. Its preview uses the existing native editor; your unsent draft remains unchanged.
2. Press **Ctrl+R** to open **Choose a room**. Press **Down five times**, then **Enter**, to choose **General**. You should see **Your name**, **Spacing**, and synthetic example messages. The example caption says **nothing is sent**.
3. With **Your name** selected, press **Enter** to open its text field. Press **Ctrl+A**, then **Ctrl+K**, to replace the field contents. Type `Preview learner` and press **Enter**.
4. The synthetic user example now has that label. You accepted an edit into the temporary settings draft; **you have not saved it**. Do not press Ctrl+S in this exercise.
5. Press **Ctrl+Z**. The example returns to its starting label. This Undo belongs to settings, not the native editor's text undo.
6. Press **Escape** to return from General to Input, then **Escape** to close the drawer. If you changed anything else and a discard confirmation appears, choose **Discard changes** rather than Save.

The editor should again show your original unsent draft. Reopening `/workspace` → General shows the original name value. No appearance preference is saved by this path.

## What to do next

You practiced an accepted temporary edit and its reversal. Choice menus add another stage: arrows or supported hover can audition a candidate **before** Enter accepts it. Undo applies to accepted edits; Save persists only accepted settings. For a real customization, read [controls and saving](../extensions/pi-workspace/FOOTER.md#controls), including file authority and failure boundaries.
