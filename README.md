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

## Note

Don't pass `model` when spawning dojo agents: it overrides the model set in their frontmatter.

## License

MIT
