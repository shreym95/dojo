# Changelog

## 0.4.0

- New optional plugin `dojo-fx` 0.1.0 (`fx/`, install with `/plugin install dojo-fx@dojo`): function hooks that add visual character. Themed spinner words (strategist pool on the main thread, emoji + verb pool per crew member on their own spinner), past-tense turn-end words, a live crew band above the prompt (emoji, animated frame, task, latest tool call), and deploy/return/fell toasts.
- dojo-fx model guard: an `agent.spawn` of any `dojo:*` type has its `model` stripped so the agent's frontmatter model always wins (callers following a generic "always pass model: sonnet" rule had been overriding Haiku agents). Always on, independent of the visual toggles.
- Each visual is a `userConfig` toggle (spinners, turnFlair, band, toasts, neutralMainTheme); all character data lives in `fx/hooks/characters.ts`.
- The main `dojo` plugin's agents and personas are unchanged.

## 0.3.0

- Every persona sheet gains a `Japanese lines & named moves:` section: 4-5 canonical romaji lines and in-anime technique names, each with an English gloss and a work moment it fits. Each medium example uses exactly one.
- Voice levels: `subtle` uses none; `medium` allows at most 1 per message (romaji, then English in parentheses on first use; counts toward the catchphrase budget); `full` uses them freely with glosses, each riding on a fact.
- House rules: a Japanese line or move never replaces a fact.
- Crew output templates start with a required in-character opening line (Haiku agents skipped it when it lived only in the voice rules).
- New test: every persona sheet has the section with at least 4 entries in the required format.

## 0.2.0

- Configurable voice intensity: `defaults.voice` in `roster.mjs`, overridable per agent. Levels `subtle` (the old one-opening-line behaviour), `medium` (new default) and `full`. Rules live in `shared/voice/<level>.md`; the build inserts only the selected one after the persona and before the house rules. Unknown level or missing file fails the build.
- Persona sheets enriched: speech patterns, reactions, 8-10 signature lines and a medium-voice example in each role's real output format. The old one-opening-line and one-catchphrase limits moved out of the house rules and sheets into the level files.
- Crew voices reach the user: every crew role's output contract ends with `Says: "<line>"`; the strategist's user report gains a `Crew:` field quoting them verbatim.
- House rules: role hard limits and field caps beat voice; the out-of-scope reason may be in voice.

## 0.1.0

- Initial release: strategist orchestrator (Shikamaru or Lelouch, picked per session) plus senku (backend), sanji (frontend), l (deep research), light (quick research), levi (QA) and robin (docs).
- `roster.mjs` as the single config; `scripts/build.mjs` generates `agents/*.md` (`--check` for CI drift detection).
- SessionStart hook announces the active strategist persona (stable per session across resume/compact); `bin/crew` launcher.
