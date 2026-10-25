# How to describe this project

**Working category:** a **Pi extension suite and agent workspace** with a reusable terminal design system. The product is **Pi Egregore**: a thinking environment shaped by what you pursue. Do not imply that it replaces Pi or that every proposed customization is already implemented.

Pi describes itself as a minimal, extensible AI agent for the terminal. Pi's host and SDK own the agent session, model/tool loop, resource loading and persistence. This repository supplies extensions and packages on top of that host: Egregore (terminal presentation and session activity), Quests (persistent pursuits and directed memory), Tasks (plans, accepted requests and history), Ask (human questions and decisions) and Frame (reusable rendering/presentation primitives). The private suite currently packages these together; `/egregore` has Input, Tasks, Ask, Transcript, More settings and General sections. Shared visual preferences use `pi-egregore.json`; operational Egregore/Tasks/recap preferences retain separate authorities. A public surface-registration API remains **in design**. After explicit approval, live Pi settings load this checkout once; the old personal Home copy has been removed and the old Tasks copy remains excluded (see the migration record).

| Term | Use it when | Accurate for this work now? |
| --- | --- | --- |
| **Pi extension suite / package** | Describing what people install and what is versioned together | **Yes.** The private `pi-egregore` has an explicit Pi manifest; Frame and Ask also retain independent package manifests. It has not been published; after explicit approval, live Pi settings load this local checkout once without duplicate legacy loading; the current legacy inventory is recorded in migration. |
| **Agent workspace / experience layer** | Explaining the integrated terminal UI, planning and human-in-the-loop workflow | **Yes, as a descriptive phrase.** Define it on first use; it is not a formal Pi API category. |
| **Terminal design system / toolkit** | Describing shared visual grammar, Frame primitives, surface adapters and developer documentation | **Yes for the existing primitives and integrations; expanding.** A public third-party surface contract and full visual editor are future work. |
| **Agent** | Describing the configured Pi-plus-extensions system a person uses | **Qualified yes:** a *customized Pi-based agent experience*, not a new agent runtime built from scratch. Tasks/Ask provide real behavior, not merely a theme. |
| **Harness** | Describing the underlying runtime that hosts the model loop, tool execution, sessions and extensions | **Pi is the harness in this architecture.** The suite extends and configures it; calling the suite a standalone harness would imply it owns more of that runtime than it currently does. |
| **Framework / platform** | Inviting others to build independent integrations against a stable public contract | **Not yet.** Use only after versioned extension points, compatibility policy, examples and at least one independently developed integration prove the contract. |

## Audience-ready wording

- **One sentence:** “Pi Egregore is a thinking environment shaped by what you pursue: develop ideas, make decisions, and carry understanding forward with an agent.”
- **For technical readers:** “It’s a version-controlled Pi extension suite with explicit package entry points. Egregore, Quests, Tasks and Ask retain separate state/input ownership; Frame supplies reusable rendering primitives. The shared settings workspace currently covers Input & footer, Tasks, Ask and supported transcript frames; we’re developing additional per-surface appearance adapters without forking Pi’s agent loop or replacing its native editor.”
- **For less technical readers:** “Bring an idea, question or project into conversation. Keep promising directions, organize work you choose to pursue, answer questions when your judgment matters, and return to what you learned later.”
- **For future contributors:** “Use the existing [Frame feature guide](../packages/pi-frame/FEATURE-GUIDE.md) to request or implement frame behavior. The [surface specification](SURFACE-WORKSPACE.md) describes proposed adapter boundaries. A public add-on API will be documented only after it is implemented and tested.”

Use **“built on Pi”**, **“extends Pi”** or **“Pi-based”** rather than “built a new agent from scratch.” A person who installs Pi plus this suite does have a tailored agent system; the distinction is who owns the engine. Likewise, “open source toolkit” or “extensible framework” should wait for a licensing/release decision, stable APIs, compatibility tests and published examples. State what is shipped separately from what is planned.

## Teaching path

1. Show the user outcome: a developing quest, a linked task plan, a consequential question, readable session activity and the current `/egregore` preview. Explain that the assistant's actual data remains separate from its presentation.
2. Teach a safe customization: select an element, preview, Undo, Discard and Save. Identify the implemented Input & footer, Tasks, Ask and Transcript rooms; explain that unsupported tool renderers stay native.
3. Show the developer boundary: Pi host → extension/tool/state owner → semantic surface adapter → Frame presentation → Pi TUI redraw. Keep keyboard, cursor and native fallbacks intact.
4. Show how to contribute: feature request using `FEATURE-GUIDE.md`, isolated tests, design decision, versioned change, changelog and rollback. Do not promise a third-party registration API before it exists.

Sources for the Pi-specific boundary: the installed Pi `README.md`, `docs/packages.md`, `docs/extensions.md` and `docs/sdk.md` (Pi 1.0.0). These describe Pi as the terminal agent, a package as a unit of extensions/resources, and `AgentSession` as the owner of model/tools/session/extension runtime.
