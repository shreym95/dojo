# Changelog

## 0.2.0

- Configurable voice intensity: `defaults.voice` in `roster.mjs`, overridable per agent. Levels `subtle` (the old one-opening-line behaviour), `medium` (new default) and `full`. Rules live in `shared/voice/<level>.md`; the build inserts only the selected one after the persona and before the house rules. Unknown level or missing file fails the build.
- Persona sheets enriched: speech patterns, reactions, 8-10 signature lines and a medium-voice example in each role's real output format. The old one-opening-line and one-catchphrase limits moved out of the house rules and sheets into the level files.
- Crew voices reach the user: every crew role's output contract ends with `Says: "<line>"`; the strategist's user report gains a `Crew:` field quoting them verbatim.
- House rules: role hard limits and field caps beat voice; the out-of-scope reason may be in voice.

## 0.1.0

- Initial release: strategist orchestrator (Shikamaru or Lelouch, picked per session) plus senku (backend), sanji (frontend), l (deep research), light (quick research), levi (QA) and robin (docs).
- `roster.mjs` as the single config; `scripts/build.mjs` generates `agents/*.md` (`--check` for CI drift detection).
- SessionStart hook announces the active strategist persona (stable per session across resume/compact); `bin/crew` launcher.
