# dojo

Anime-themed Claude Code subagents: one orchestrator and a crew, each with its own model, tools and voice.

## Crew

| Agent | Character | Role | Model |
|---|---|---|---|
| `dojo:strategist` | Shikamaru or Lelouch (per session) | Orchestrator / integrator (main thread) | claude-opus-5-5 |
| `dojo:senku` | Senku | Backend builder | claude-sonnet-5-5 |
| `dojo:sanji` | Sanji | Frontend builder | claude-sonnet-5-5 |
| `dojo:l` | L | Deep web researcher | claude-haiku-4-5 |
| `dojo:light` | Light | Quick fact-finder | claude-haiku-4-5 |
| `dojo:levi` | Levi | QA inspector (read-only) | claude-haiku-4-5 |
| `dojo:robin` | Robin | Documentation writer | claude-haiku-4-5 |

## Install

```
/plugin marketplace add shreym95/dojo
/plugin install dojo@dojo
```

## Launch the orchestrator

```
claude --agent dojo:strategist
crew               # bin/crew: random persona
crew lelouch       # pin the persona (shikamaru | lelouch)
```

Or make it the default in `settings.json`: `"agent": "dojo:strategist"`.

The strategist must run as the main-thread agent because subagents cannot spawn subagents. Run as a subagent it could not dispatch the crew.

A SessionStart hook tells the strategist which persona is on duty. Override with `DOJO_STRATEGIST=shikamaru|lelouch`; set `DOJO_DEBUG=1` to log hook input to `${TMPDIR:-/tmp}/dojo-hook-debug.log`.

## Customise

**Crew agents**: edit `roster.mjs` (characters, models, tools, descriptions), `personas/*.md` (voice sheets), `roles/*.md` (duties) or `shared/house-rules.md`, then:

```
npm run build   # regenerate agents/*.md
npm run check   # fail if agents/ has drifted (used in CI)
npm test
```

`agents/*.md` is generated; do not edit by hand.

**Visuals and art**: edit `mods/theme.ts` to change character emoji and colors; `mods/visuals/transcript-art.ts` for banners and speech bubbles; `mods/visuals/chrome-art.ts` for spinner verbs, turn-end words, toast lines, fall lines, prompt hints and band headers. Validate, test and try locally:

```
claude plugin validate .   # check the hook structure
claude plugin test .       # run the mod suite
claude --plugin-dir .      # try the plugin locally without installing
```

## Voice levels

How loud the characters are is set in `roster.mjs`: `defaults: { voice: 'medium' }`, or `voice: '...'` on one agent to override it.

| Level | What you get |
|---|---|
| `subtle` | One in-character opening line, optional sign-off, plain body. |
| `medium` (default) | 1-2 opening lines, character-coloured wording, up to ~3 short asides and 2 catchphrases, a closing line. About +20% length. |
| `full` | The character speaks freely, section by section. About +40% length. |

At every level facts, paths, numbers and commands stay exact, and persona never reaches code, commits or files. Each crew report ends with a `Says:` line; the strategist relays them to you under `Crew:`. Level rules are in `shared/voice/`; run `npm run build` after changing a level.

## Visuals

Built on Claude Code's function hooks (early-access API), the dojo plugin includes:

- **Themed spinners**: the main thread's spinner word comes from the on-duty strategist (Shikamaru: "Shadow-possessing", "Reading the board"; Lelouch: "Commanding", "Geass-ing"). A crew member's own spinner gets its emoji and verbs (🧪 Senku "Science-ing", 🧹 Levi "Scrubbing", 🌸 Robin "Deciphering"...). Verbs rotate per turn.
- **Turn-end flair**: the line that closes a turn says "Outmaneuvered" (Shikamaru) or "Checkmated" (Lelouch).
- **Crew band**: while any `dojo:*` subagent runs, one row each above the prompt: emoji, name, an animated frame, its task and its latest tool call (`Bash: npm test`). Gone when nobody is running.
- **Transcript theme**: persona frames on messages, tool badges, crew cards and speech bubbles in the on-duty character's colors.
- **ASCII banners**: shown when a dojo subagent is deployed and when it returns.
- **Prompt chrome**: themed prompt area with persona hints under the prompt and session mode labels.
- **Roster pane**: `/dojo` shows the crew, who is on duty and who is running.
- **Deploy/return toasts and sounds**: `🧹 Levi deployed — "Chi. Show me the mess."`, then `🧹 Levi returned` or `💀 Levi fell`. Sound cues play on macOS only (via `afplay`).

Toggle features in `/config` (or `pluginConfigs` in settings): `spinners`, `turnFlair`, `band`, `toasts`, `neutralMainTheme`, `transcriptTheme`, `banners`, `promptChrome`, `rosterPane`, `sounds`, all on by default.

## Guards and gates

- **Model guard** (always on): an `agent.spawn` of any `dojo:*` type has `model` stripped, so a caller's "always pass model: sonnet" can't override an agent's own frontmatter model.
- **Commit gate** (on by default): forces Conventional Commits (subject ≤72 chars, no body), denies a `git commit` command that breaks the rules, and injects the configured Co-Authored-By trailer (default `Co-Authored-By: Claude`). Empty trailer disables the check.
- **Delegation budgets** (on by default, in a dojo session): caps the main thread's inline edits and lookups per turn. Limits: 2 files, 6 lines, 3 lookups. Scratch (temp dirs, `/scratchpad/`) is exempt.
- **Compaction memory** (on by default): in a dojo session, the compaction summary keeps the on-duty line, voice level, running dojo agents with their tasks, and user decisions.

## Commands

- `/dojo-duty [shikamaru|lelouch]`: Show or switch the strategist persona on duty. The choice survives compaction and resume in the same process; a resume in a new process starts from the persona picked at session start.
- `/dojo-voice [subtle|medium|full|default|reset|off]`: Show or set the dojo voice level override for this session; overrides pass to agents spawned until cleared.
- `/dojo`: Open the roster pane (requires `rosterPane` toggle on).

## Settings

Every setting below lives in the `userConfig` section of the plugin and can be toggled in `/config` or set in `pluginConfigs` in Claude Code's `settings.json`:

| Key | Default | What it does |
|---|---|---|
| `spinners` | true | Replace the spinner word with the on-duty strategist's (or crew member's) themed verbs. |
| `turnFlair` | true | Past-tense themed word on the line that closes a turn (Outmaneuvered, Checkmated). |
| `band` | true | Show one animated row per running dojo subagent above the prompt. |
| `toasts` | true | Toast when a dojo subagent is deployed, returns or falls. |
| `neutralMainTheme` | true | When no strategist persona is detected, still theme the main spinner with a neutral strategist pool. |
| `commitGate` | true | Force the configured commit trailer into git texts and deny git commit commands whose inline message breaks the commit rules (Conventional Commits subject, no body, exact trailer). Applies in every session. |
| `commitTrailer` | `Co-Authored-By: Claude` | The exact Co-Authored-By line commits must carry. Empty keeps Claude Code's own text and skips the trailer check. |
| `roleGuard` | true | In a dojo session, cap the main thread's inline edits and web lookups per turn and point it at dojo:senku, dojo:sanji, dojo:l or dojo:light. |
| `inlineEditFiles` | 2 | Distinct files the main thread may edit itself in one turn before it must delegate. |
| `inlineEditLines` | 6 | Largest Edit (lines in new_string) the main thread may make itself. |
| `inlineLookups` | 3 | WebSearch and WebFetch calls the main thread may make itself in one turn before it must delegate. |
| `archivist` | true | In a dojo session, tell the compaction summary to keep the on-duty line, the voice level, running dojo agents with their tasks, and the user's decisions. |
| `transcriptTheme` | true | Frame messages, tool calls and subagent results in the on-duty character's colors: persona frames on messages, tool badges, crew cards and speech bubbles. |
| `banners` | true | Show an ASCII banner when a dojo subagent is deployed and when it returns. |
| `promptChrome` | true | Theme the prompt area: persona hints under the prompt and the session mode line. |
| `rosterPane` | true | Show the /dojo roster panel: the crew, who is on duty and who is running. |
| `sounds` | true | Play a sound cue when a dojo subagent is deployed, returns or falls (macOS only). |

## Note

Don't pass `model` when spawning dojo agents: the model guard enforces each agent's own frontmatter model.

## License

MIT
