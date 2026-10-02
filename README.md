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

Edit `roster.mjs` (characters, models, tools, descriptions), `personas/*.md` (voice sheets), `roles/*.md` (duties) or `shared/house-rules.md`, then:

```
npm run build   # regenerate agents/*.md
npm run check   # fail if agents/ has drifted (used in CI)
npm test
```

`agents/*.md` is generated; do not edit by hand.

## Voice levels

How loud the characters are is set in `roster.mjs`: `defaults: { voice: 'medium' }`, or `voice: '...'` on one agent to override it.

| Level | What you get |
|---|---|
| `subtle` | One in-character opening line, optional sign-off, plain body. |
| `medium` (default) | 1-2 opening lines, character-coloured wording, up to ~3 short asides and 2 catchphrases, a closing line. About +20% length. |
| `full` | The character speaks freely, section by section. About +40% length. |

At every level facts, paths, numbers and commands stay exact, and persona never reaches code, commits or files. Each crew report ends with a `Says:` line; the strategist relays them to you under `Crew:`. Level rules are in `shared/voice/`; run `npm run build` after changing a level.

## dojo-fx (optional visuals)

A second plugin in this marketplace, built on Claude Code's function hooks (early-access API): `/plugin install dojo-fx@dojo`. The main `dojo` plugin works without it.

- **Themed spinners**: the main thread's spinner word comes from the on-duty strategist (Shikamaru: "Shadow-possessing", "Reading the board"; Lelouch: "Commanding", "Geass-ing"). A crew member's own spinner gets its emoji and verbs (🧪 Senku "Science-ing", 🧹 Levi "Scrubbing", 🌸 Robin "Deciphering"...). Verbs rotate per turn.
- **Turn-end flair**: the line that closes a turn says "Outmaneuvered" (Shikamaru) or "Checkmated" (Lelouch).
- **Crew band**: while any `dojo:*` subagent runs, one row each above the prompt: emoji, name, an animated frame, its task and its latest tool call (`Bash: npm test`). Gone when nobody is running.
- **Toasts**: `🧹 Levi deployed — "Chi. Show me the mess."`, then `🧹 Levi returned` or `💀 Levi fell`.
- **Model guard** (always on): an `agent.spawn` of any `dojo:*` type has `model` stripped, so a caller's "always pass model: sonnet" can't override an agent's own frontmatter model.

The strategist is read from the `dojo: on duty: <Name>` context line; if it can't be found, `DOJO_STRATEGIST` is used, else a neutral strategist theme. Toggle features in `/config` (or `pluginConfigs` in settings): `spinners`, `turnFlair`, `band`, `toasts`, `neutralMainTheme`, all on by default. Emoji, verbs, frames and toast lines live in `fx/hooks/characters.ts`. Try it without installing: `claude --plugin-dir ./fx`. Tests: `claude plugin test fx`.

## Note

Don't pass `model` when spawning dojo agents: it overrides the model set in their frontmatter.

## License

MIT
