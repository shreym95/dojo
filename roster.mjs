// dojo roster — the single config file. `npm run build` turns it into agents/*.md.
//
// Swap a character:  change `personas` (e.g. ['senku'] -> ['kakashi']), add the key to
//                    `displayNames`, and create personas/<key>.md (a plain markdown voice sheet).
//                    More than one persona on an agent => the SessionStart hook picks one per session
//                    (currently only wired for the strategist).
// Swap a model:      edit `model` / `effort` on the agent.
// Change tools:      edit the `tools` array (Claude Code tool names; Agent(a, b) limits spawnable agents).
// Change duties:     edit roles/<role>.md. Shared rules live in shared/house-rules.md.
// Then run:          npm run build   (CI runs `npm run check` and fails if agents/ has drifted)

export default {
  plugin: 'dojo',

  displayNames: {
    shikamaru: 'Shikamaru',
    lelouch: 'Lelouch',
    senku: 'Senku',
    sanji: 'Sanji',
    l: 'L',
    light: 'Light',
    levi: 'Levi',
    robin: 'Robin',
  },

  agents: {
    strategist: {
      personas: ['shikamaru', 'lelouch'],
      role: 'strategist',
      summary: 'orchestrator and integrator',
      model: 'claude-opus-5-5',
      effort: 'high',
      color: 'purple',
      tools: [
        'Agent(dojo:senku, dojo:sanji, dojo:l, dojo:light, dojo:levi, dojo:robin)',
        'Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write',
      ],
      description:
        'Orchestrator/integrator (Shikamaru or Lelouch). Main-thread agent: run via `claude --agent dojo:strategist`. ' +
        'Plans, splits work, dispatches the dojo crew, integrates, reviews. Not for use as a subagent.',
    },
    senku: {
      personas: ['senku'],
      role: 'backend',
      summary: 'backend builder',
      model: 'claude-sonnet-5-5',
      effort: 'high',
      color: 'green',
      tools: ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'],
      description:
        'Backend builder. Use for server-side code: APIs, data models, DB, pipelines, CLIs, infra scripts, backend tests. ' +
        'Do NOT use for UI/styling, web research, or QA sign-off.',
    },
    sanji: {
      personas: ['sanji'],
      role: 'frontend',
      summary: 'frontend builder',
      model: 'claude-sonnet-5-5',
      effort: 'high',
      color: 'yellow',
      tools: ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'],
      description:
        'Frontend builder. Use for UI: components, styling, layout, accessibility, client state, frontend tests. ' +
        'Do NOT use for backend/APIs, web research, or QA sign-off.',
    },
    l: {
      personas: ['l'],
      role: 'research-deep',
      summary: 'deep web researcher',
      model: 'claude-haiku-4-5-20251001',
      effort: 'high',
      color: 'blue',
      tools: ['WebSearch', 'WebFetch', 'Read', 'Grep', 'Glob'],
      description:
        'Deep web researcher. Use for multi-source investigation: comparing libraries/approaches, root-causing obscure errors, ' +
        'reading docs/changelogs, with confidence levels and citations. Read-only. ' +
        'Do NOT use for quick single facts (use dojo:light) or writing code.',
    },
    light: {
      personas: ['light'],
      role: 'research-quick',
      summary: 'quick fact-finder',
      model: 'claude-haiku-4-5-20251001',
      effort: 'high',
      color: 'red',
      tools: ['WebSearch', 'WebFetch'],
      description:
        'Quick fact-finder. Use for one fast answer from one authoritative source: a version number, an API signature, a flag name, a date. ' +
        'Do NOT use for comparisons or deep investigation (use dojo:l) or code.',
    },
    levi: {
      personas: ['levi'],
      role: 'qa',
      summary: 'QA inspector',
      model: 'claude-haiku-4-5-20251001',
      effort: 'high',
      color: 'cyan',
      tools: ['Read', 'Grep', 'Glob', 'Bash'],
      description:
        'QA inspector. Use to run tests, verify a change, review a diff for defects, check edge cases and regressions. ' +
        'Reports defects with file:line and repro; never edits code. Do NOT use to implement fixes.',
    },
    robin: {
      personas: ['robin'],
      role: 'docs',
      summary: 'documentation writer',
      model: 'claude-haiku-4-5-20251001',
      effort: 'high',
      color: 'pink',
      tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write'],
      description:
        'Documentation writer. Use to write or update docs in any format (Markdown, HTML, README, changelog, API reference, docstrings) ' +
        'from existing code or decisions already made. Do NOT use for planning, design decisions, code changes, or research.',
    },
  },
};
