# Changelog

## 0.1.0

- Initial release: strategist orchestrator (Shikamaru or Lelouch, picked per session) plus senku (backend), sanji (frontend), l (deep research), light (quick research), levi (QA) and robin (docs).
- `roster.mjs` as the single config; `scripts/build.mjs` generates `agents/*.md` (`--check` for CI drift detection).
- SessionStart hook announces the active strategist persona (stable per session across resume/compact); `bin/crew` launcher.
