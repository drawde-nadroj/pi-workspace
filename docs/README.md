# Documentation

Choose the path that matches what you need now. These guides cover the root suite and Egregore, Quests, Tasks, Ask and Frame; a separately developed Chronomancer plugin is not part of this repository.

## Learn by trying

- [Try a reversible appearance preview](TRY-PREVIEW.md): one keyboard-only exercise that distinguishes a temporary edit, Undo and saving. No message or provider call is needed.

## Complete a task

- [Install, update, transfer or remove the local suite](INSTALL.md).
- [Customize appearance and save safely](../extensions/pi-egregore/FOOTER.md#start-here).
- [Inspect work history without changing the current plan](../extensions/pi-tasks/README.md#inspect-history-without-changing-current-work).
- [Answer, clarify or revise questions](../packages/pi-ask/README.md#best-usage-ask-when-inquiry-is-worth-the-interruption).
- [Resume a quest or keep a direction for later](../extensions/pi-quests/README.md#begin-using-it).
- [Inspect session activity and its sources](../extensions/pi-egregore/README.md#session-activity).
- [Set up development and verification](../CONTRIBUTING.md).
- [Review the suite in an isolated agent directory](ACCEPTANCE.md#repeatable-isolated-review). This is a reviewer procedure, not a live migration recipe.

## Look up a fact

- [Egregore controls, saving and compatibility](../extensions/pi-egregore/FOOTER.md).
- [Settings purpose, preview and persistence scope](SETTINGS-REVIEW.md).
- [Egregore commands and optional recap processing](../extensions/pi-egregore/README.md#commands-and-preferences).
- [Tasks commands, panel controls and agent-tool operations](../extensions/pi-tasks/README.md).
- [Ask user commands and tool parameters](../packages/pi-ask/README.md#tool-parameters).
- [Quests tool operations and persistence](../extensions/pi-quests/README.md#tool-reference).
- [Frame primitives and presentation API](../packages/pi-frame/README.md).
- [Egregore dock protocol](../extensions/pi-egregore/DOCK.md).
- [Primitive contracts](PRIMITIVES.md): tool parameters, event IDs, storage keys and compatibility rules for building a Tasks or Ask plugin.

## Understand the design

- [Directed memory and developing intentions](../extensions/pi-quests/README.md#directed-memory-continuity-of-a-developing-intention).
- [Architecture and separate owners](ARCHITECTURE.md): why visual composition does not merge domain state or input ownership.
- [Supported surface workspace and proposed adapters](SURFACE-WORKSPACE.md): current scope versus design direction.
- [Frame feature guide](../packages/pi-frame/FEATURE-GUIDE.md): describe a meaningful integration and its safety/lifecycle facts.
- [Project terminology](POSITIONING.md): what the suite is and is not.
- [Ownership decision record](decisions/0001-one-repo-separate-owners.md): historical decision with later outcome links.

## Check evidence and history

- [Acceptance](ACCEPTANCE.md): current executed/source checks, historical increments and remaining human/provider gates. Evidence references are not independent verification.
- [Migration](MIGRATION.md): the maintainer's installation history and rollback limits, not portable setup instructions.
- [Changelog](../CHANGELOG.md): source changes, not a published-release announcement.
- [Opt-in evaluation harness](../eval/harness/README.md): source-checkout-only synthetic development workflow and authorization limits.

A correct command, passing build or tidy page does not prove reader comprehension, accessibility or learning. The guides retain those evidence boundaries.
