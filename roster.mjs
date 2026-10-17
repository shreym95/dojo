// dojo roster — the single config file. `npm run build` turns it into agents/*.md.
//
// Swap a character:  change `personas` (e.g. ['senku'] -> ['kakashi']), add the key to
//                    `displayNames`, and create personas/<key>.md (a plain markdown voice sheet).
//                    More than one persona on an agent => the SessionStart hook picks one per session
//                    (currently only wired for the strategist).
// Swap a model:      edit `model` / `effort` on the agent.
// Change tools:      edit the `tools` array (Claude Code tool names; Agent(a, b) limits spawnable agents).
// Change duties:     edit roles/<role>.md. Shared rules live in shared/house-rules.md.
// Voice intensity:   `defaults.voice` sets the level for every agent; an agent's own `voice` overrides it.
//                    Levels: 'subtle' (one opening line) | 'medium' (default) | 'full' (the character speaks freely).
//                    Each level is a rule file, shared/voice/<level>.md; the build inserts only the selected one.
// Then run:          npm run build   (CI runs `npm run check` and fails if agents/ has drifted)

export default {
  plugin: 'dojo',

  defaults: { voice: 'medium' },

  displayNames: {
    shikamaru: 'Shikamaru',
    lelouch: 'Lelouch',
    senku: 'Senku',
    sanji: 'Sanji',
    jiraiya: 'Jiraiya',
    kurisu: 'Kurisu',
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
      effort: 'medium',
      color: 'purple',
      tools: [
        'Agent(dojo:senku, dojo:sanji, dojo:kurisu, dojo:jiraiya, dojo:light, dojo:levi, dojo:robin)',
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
      model: 'claude-haiku-5-5',
      effort: 'medium',
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
      model: 'claude-haiku-5-5',
      effort: 'medium',
      color: 'yellow',
      tools: ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'],
      description:
        'Frontend builder. Use for UI: components, styling, layout, accessibility, client state, frontend tests. ' +
        'Do NOT use for backend/APIs, web research, or QA sign-off.',
    },
    kurisu: {
      personas: ['kurisu'],
      role: 'architect',
      summary: 'solutions architect',
      model: 'claude-sonnet-5-5',
      effort: 'medium',
      color: 'orange',
      tools: ['WebSearch', 'WebFetch', 'Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write'],
      description:
        'Solutions architect. Use for options and trade-offs, solution designs, hypotheses and test methodology, and small POCs ' +
        'in scratch or an isolated worktree, as input to the strategist\'s decision. ' +
        'Does NOT decide, implement final code, or do broad web research (use dojo:jiraiya).',
    },
    jiraiya: {
      personas: ['jiraiya'],
      role: 'research-deep',
      summary: 'web researcher',
      model: 'claude-haiku-5-5',
      effort: 'medium',
      color: 'blue',
      tools: ['WebSearch', 'WebFetch', 'Read', 'Grep', 'Glob'],
      description:
        'Pure multi-source web researcher. Use for investigations across several sources: docs, changelogs, issue trackers, comparisons of facts, ' +
        'with citations and confidence levels. Read-only. Makes no recommendations, designs or code. ' +
        'Do NOT use for quick single facts (use dojo:light) or for options and designs (use dojo:kurisu).',
    },
    light: {
      personas: ['light'],
      role: 'research-quick',
      summary: 'quick fact-finder',
      model: 'claude-haiku-5-5',
      effort: 'low',
      color: 'red',
      tools: ['WebSearch', 'WebFetch'],
      description:
        'Quick fact-finder. Use for one fast answer from one authoritative source: a version number, an API signature, a flag name, a date. ' +
        'Do NOT use for comparisons or deep investigation (use dojo:jiraiya) or code.',
    },
    levi: {
      personas: ['levi'],
      role: 'qa',
      summary: 'QA inspector',
      model: 'claude-haiku-5-5',
      effort: 'medium',
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
      model: 'claude-haiku-5-5',
      effort: 'low',
      color: 'pink',
      tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write'],
      description:
        'Documentation writer. Use to write or update docs in any format (Markdown, HTML, README, changelog, API reference, docstrings) ' +
        'from existing code or decisions already made. Do NOT use for planning, design decisions, code changes, or research.',
    },
  },
};
