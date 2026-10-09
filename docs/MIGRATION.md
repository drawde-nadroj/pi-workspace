# Migration plan (not yet executed)

The source import deliberately leaves the live installation alone. At this baseline, `~/.pi/agent/settings.json` names `./packages/pi-frame` and `./packages/pi-ask`; Home and Tasks are auto-discovered from `~/.pi/agent/extensions/`. Do not point Pi at this checkout **as well** without removing or excluding the old entries: duplicate tool/command registrations or competing editor/footer owners are possible.

## Planned phases

1. **Record a baseline:** run `npm ci`, `npm test`, package dry-runs and a live-terminal visual check. Record compatible Pi and dependency versions. Review this repository's tracked-file list for private data.
2. **Build the suite package:** define one explicit Pi resource manifest, declare non-host runtime dependencies, keep standalone Frame and Ask releases possible, and test a packed installation in an *isolated* `PI_CODING_AGENT_DIR`. Decide whether independent Ask is loaded as a suite dependency resource or built into the suite; never load both copies. Provide a standalone Tasks fallback when Home is absent.
3. **Compatibility:** preserve `/home`, `/footer`, `/tasks`, `tasks`, `ask_user_question`, and `ask_questions`. Preserve existing preferences at their current locations initially; validate and migrate schemas without overwriting corrupt files or plan history. Check cold load, old export maps, live `/reload`, shutdown and re-enable in both extension load orders.
4. **Switch one live installation:** back up source and preferences outside Git; modify only Pi package/extension declarations and auto-discovery paths necessary for the switch. Verify the new commands once and confirm the old copies are not loaded. Keep a documented rollback to the previous source and settings. Do not delete sessions or task entries.
5. **Grow customization:** extract `/footer`'s reusable transaction and navigation, then add a Tasks surface page, followed by Questions and transcript frames. Keep previews display-only, with per-surface settings ownership and documented schema migrations.

No part of this document authorizes publishing, switching a user's live installation, moving saved data, or claiming the suite is already installable. Pi package guidance: the host provides Pi libraries as peers; resource paths in a `pi` manifest are explicit; packages installed by different roots do not share undeclared dependencies. Pin and test package compatibility before release.
