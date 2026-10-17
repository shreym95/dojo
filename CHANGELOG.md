# Changelog

## 0.8.1

### Changed
- Usage line: Stamina (busiest rate-limit window) now shows from 25% instead of 50%, so it no longer drops off for long after a window reset.

## 0.8.0

### Added
- `dojo:kurisu` (Kurisu, solutions architect, claude-sonnet-5-5, medium effort): options and trade-offs, solution designs, hypotheses and test methodology, small POCs in the scratchpad or an isolated worktree, as input to the strategist's decision. Never decides or ships code; replies `NEEDS INTEL: <question>` when research goes beyond a few targeted lookups.
- Architect write guard (`architectGuard`, on by default): Edit, Write and NotebookEdit calls by `dojo:kurisu` are refused outside the system temp dir, a `/scratchpad/` path or a Claude Code worktree under `.claude/worktrees/`. Bash writes are not checked.
- Routing section in the README: one fact → Light, multi-source facts → Jiraiya, design and POCs → Kurisu, build → Senku/Sanji, QA → Levi, docs → Robin; the strategist decides.

### Changed
- Models and effort: strategist claude-opus-5-5 medium; senku, sanji, levi, jiraiya claude-haiku-5-5 medium; light, robin claude-haiku-5-5 low.
- Roles: builders, QA and docs execute precise briefs and reply `BLOCKED: <question>` instead of guessing; Light replies `NOT FOUND` instead of a second lookup; the strategist's brief template gains `Files:` and `Steps:`.
- Crew token figures (band, `/dojo` stats, `/dojo-recap`) use Claude Code's formula: latest request's full input including cache, plus all output so far. They now match Claude Code's own agent list.
- roleGuard points lookups at `dojo:jiraiya` or `dojo:light`.
- Senku/Sanji boundary is by concern, not by file or server/client: Senku owns behaviour and data, Sanji owns presentation and interaction; the seam is a data contract. The strategist routes by concern.
- Plugin internals: state-recording hooks moved to mods/state/recorders.tsx; visual installers only draw (the crew tick still lives in mods/visuals/chrome.tsx).
- README redesigned with images in docs/assets/.

### Breaking
- `dojo:l` is renamed to `dojo:jiraiya` (pure multi-source web research with citations; no recommendations). Anything that called `dojo:l` must use `dojo:jiraiya`.

## 0.7.0

### Changed
- **Transcript**: strategist replies now draw as a thin one-cell colored stripe only, no header frame. Main-thread tool badges are hidden; crew tool rows show only the crew emoji. Crew deploy, return and fall states are one-line moments: `emoji Name ▸ task  "quote"` (deploy), `emoji Name ✓ elapsed  "Says or return line"` (return), `💀 Name ✗ fell  "fall line"` (fallen). AskUserQuestion and InfoNotice are no longer framed. Background launches (async) draw no second card. ASCII banners are drawn at fixed widths.
- **Chrome toasts**: deploy toast (3s) and return toast (5s) show the crew member's says line or a signature line. Fall toast (6s) and rank-up toast (7s) are text only, replacing return for the agent that crossed a rank line. Deploy uses: `emoji Name deployed`, return: `emoji Name returned`, fall: `💀 Name fell`.
- **Crew band**: no header row, one row per running agent, showing animated glyph, emoji, name, task description, tool name (when space allows), and elapsed time and token count (right-aligned).
- **Usage line**: Stamina (busiest rate-limit window) is shown only when it reaches 50% or higher. Prompt hint catchphrase removed; hint text displayed only in /dojo-gallery.
- **Prompt chrome**: session mode line shows real mode names (e.g. `Agentic & Vision`), dim, ending with a small `emoji Name` tag in the strategist's color.
- **Banners toggle**: `banners` (off by default) opts into full ASCII-banner crew cards in the transcript, replacing the default one-line moments. Cards remain in `/dojo-gallery` preview regardless.

### Removed
- Main-thread tool call badges in transcripts (crew emoji shows in ToolGroup row instead).
- Prompt hint text from the main chrome (moved to /dojo-gallery for discovery).
- Two-card flow for background agent launches (one-line note remains).

## 0.6.0

- Palette mode: new `paletteMode` setting (auto, dark, light; default auto). Auto follows the Claude Code theme (light when its name contains "light"). Light-theme colors meet ≥4.5:1 contrast on white; dark colors are lifted to ≥4.5:1 on black via `legible`, applied across transcript, spinners, band, and all chrome. Colors already account for this in `theme.ts` and `mods/visuals/transcript-lib.ts`.
- Usage line bars shaped per strategist: Shikamaru `≋∙` (density wave), Lelouch `♞⋅` (knight), neutral `▰▱` (block).
- Crew band reformatted: animated glyph, emoji, name, task, short tool name, right-aligned elapsed time and live tokens (input+output, cache excluded). Width fallbacks on narrow terminals.
- `/dojo` pane enhanced: per-crew session stats (runs, time, tokens), most-deployed badge at ≥2 runs, and rank line.
- `/dojo-recap` command: mission report pane showing crew deployed, runs, time, tokens, last `Says:` line, who fell, final context and cost, rank, and strategist sign-off. Command only (a plugin cannot draw at session exit).
- `/dojo-gallery` command: pane previewing each character's banner, colors (dark/light), animation frames, spinner verbs, signature lines, and sample speech bubble. Navigate with `p`/`n`, close with `q` or Esc.
- Rank across sessions: new `rank` setting (on by default). Points = dojo crew agents that return successfully. Shikamaru/neutral ladder: Genin 0 / Chūnin 25 / Jōnin 100 / Kage 300; Lelouch ladder: Pawn / Knight / Rook / King at the same thresholds. Stored in Claude Code's plugin store; falls back to "(this session)" if unavailable. Toast on rank-up.
- `/dojo-recap` and `/dojo-gallery` are gated by the existing `rosterPane` toggle.

## 0.5.1

- Session usage line: one row above the prompt with the context fill (Chakra, a 10-cell bar), the busiest rate-limit window (Stamina, with its window such as 5h) and the session cost (両 $1.42), led by the on-duty strategist's emoji. The bar uses the strategist's color below 60%, the warning color from 60% and the error color from 85%, where a short line in the strategist's voice is added. Segments with no data are left out; under 50 columns the row is compact. The crew band draws below it.
- New `userConfig` toggle `usageLine` (on by default).

## 0.5.0

- dojo-fx plugin merged into the main dojo plugin: all visuals (themed spinners, turn-end flair, crew band, transcript theme, banners, prompt chrome, roster pane, toasts, sounds) are now built-in as a function-hooks module in `mods/`, loaded via `hooks/hooks.json`. No separate installation required; install `dojo` gives everything.
- Visual toggles now in `userConfig`: `spinners`, `turnFlair`, `band`, `toasts`, `neutralMainTheme`, `transcriptTheme`, `banners`, `promptChrome`, `rosterPane`, `sounds` (all on by default).
- New guards and gates in `userConfig`: `commitGate` (Conventional Commits enforcement, always applies), `roleGuard` (delegation budgets for the main thread: 2 files / 6 lines / 3 lookups per turn), `archivist` (keep on-duty and voice level in compaction summaries).
- Three `/slash` commands: `/dojo-duty [shikamaru|lelouch]` (show/set strategist), `/dojo-voice [subtle|medium|full|default|reset|off]` (show/set voice level), `/dojo` (show roster pane).
- Model guard now always on: `agent.spawn` of any `dojo:*` type has `model` stripped.
- **Migration**: if you had `dojo-fx` installed, uninstall it with `/plugin uninstall dojo-fx@dojo`. The merged plugin will not run its visuals twice.

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
