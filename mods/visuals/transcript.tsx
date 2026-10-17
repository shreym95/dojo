import { atom, read, update } from 'claude-code'
import type { BoxProps, EngineInterface as Engine, ElementConstructor, RenderNode, TextProps } from 'claude-code'

import { isOn } from '../lib/options'
import type { Installer, Options } from '../lib/options'
import { crewKey, strategistKey } from '../lib/persona'
import { CREW, FELL_EMOJI, NEUTRAL, STRATEGISTS } from '../theme'
import type { PaletteMode, Theme } from '../theme'
import { ASKS, BUBBLES, COMMAND_TITLES, DEPLOY_LINES, ERROR_MARKS, FALLEN_LINES, MOTIFS, RETURN_LINES } from './transcript-art'
import {
  FALLEN_STATUSES,
  WIDE,
  agentFacts,
  bannerRows,
  cells,
  columnsOf,
  crewOfInput,
  descriptionOf,
  dojoCommand,
  dutyNameOf,
  extractSays,
  line,
  modeOf,
  paint,
  remember,
  rule,
  statsLine,
} from './transcript-lib'

// Transcript makeover (userConfig `transcriptTheme` for frames, badges, cards and bubbles; `banners` for ASCII art).
// Decoration only: every hook asks the engine for its own drawing first and wraps it. Whatever happens here,
// the engine's drawing is what comes back.

// The module scan reads an atom only from a const of the file that uses it; the {plugin, key} pair is the shared name.
const strategist = atom({ plugin: 'dojo', key: 'strategist' } as const, null)
/** tool_use_id of a call a subagent made -> its crew key, or `-` for any other subagent. The main thread has no entry. */
const callers = atom({ plugin: 'dojo', key: 'callers' } as const, {} as Record<string, string>)
/** tool_use_id of an Agent call -> the crew key it spawns, or `-` for any other agent type. */
const spawns = atom({ plugin: 'dojo', key: 'spawns' } as const, {} as Record<string, string>)
/** The palette in force; the chrome module writes it. Dark until it says otherwise. */
const paletteMode = atom({ plugin: 'dojo', key: 'paletteMode' } as const, 'dark' as PaletteMode)

type UI = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps> }
type CardState = 'deployed' | 'returned' | 'fell' | 'recalled' | 'background'

const motifOf = (key: string) => MOTIFS[key] ?? (MOTIFS.strategist as (typeof MOTIFS)[string])

/** `t` with its colors resolved for the palette in force. Every color this module draws comes from here. */
async function painted($: Engine, t: Theme): Promise<Theme> {
  return paint(t, modeOf(await read($, paletteMode)))
}

async function mainTheme($: Engine, options: Options): Promise<Theme | null> {
  const key = (await read($, strategist)) ?? strategistKey(await $.env.get('DOJO_STRATEGIST'))
  const t = key !== null ? (STRATEGISTS[key] ?? null) : isOn(options, 'neutralMainTheme') ? NEUTRAL : null
  return t === null ? null : painted($, t)
}

/** Who made tool call `id`: a crew member's theme, the strategist's, or null for a subagent that is no dojo crew. */
async function callerTheme($: Engine, options: Options, id: string): Promise<Theme | null> {
  const lane = (await read($, callers))[id]
  if (lane === undefined) return mainTheme($, options)
  const t = lane === '-' ? null : (CREW[lane] ?? null)
  return t === null ? null : painted($, t)
}

/** A one-cell-wide stripe in `color`, as tall as what stands beside it. */
function stripe({ Box }: UI, color: string) {
  return <Box width={1} flexShrink={0} marginRight={1} backgroundColor={color} />
}

/** `inner` beside a stripe. */
function striped(ui: UI, color: string, inner: RenderNode) {
  const { Box } = ui
  return (
    <Box flexDirection="row">
      {stripe(ui, color)}
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {inner}
      </Box>
    </Box>
  )
}

/** `inner` after a small badge on the same row. */
function badged(ui: UI, who: readonly Theme[], cols: number, errored: boolean, inner: RenderNode) {
  const { Box, Text } = ui
  const first = who[0]
  if (first === undefined) return <Box>{inner}</Box>
  const label = who.map(t => (cols >= WIDE ? `${t.emoji} ${t.name}` : t.emoji)).join(' ') + (errored ? ' ✗' : '')
  return (
    <Box flexDirection="row">
      <Box flexShrink={0} marginRight={1}>
        <Text color={who.length === 1 ? first.color : undefined} bold wrap="truncate-end">
          {label}
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {inner}
      </Box>
    </Box>
  )
}

/** A decorative mark above an errored tool result; the error text itself is the engine's. */
function errorMark({ Text }: UI, who: Theme) {
  const mark = ERROR_MARKS[who.key] ?? ERROR_MARKS.strategist
  return (
    <Text color="error" wrap="truncate-end">
      {`${who.emoji} ✗ ${mark}`}
    </Text>
  )
}

type Card = {
  theme: Theme
  state: CardState
  description: string
  cols: number
  banners: boolean
  salt: string
  stats?: string
}

const STATE_LABEL: Record<CardState, string> = {
  deployed: '▸ deployed',
  returned: '✓ returned',
  fell: '✗ fell',
  recalled: '↩ recalled',
  background: '… running in background',
}

function cardLine(c: Card): string {
  const pool = c.state === 'deployed' ? DEPLOY_LINES : c.state === 'returned' ? RETURN_LINES : c.state === 'fell' ? FALLEN_LINES : undefined
  return line(pool?.[c.theme.key], c.salt)
}

/** A crew member's card: banner, header, task, signature. One compact line when the width is short. */
function crewCard(ui: UI, c: Card) {
  const { Box, Text } = ui
  const t = c.theme
  const fell = c.state === 'fell'
  const emoji = fell ? FELL_EMOJI : t.emoji
  const label = STATE_LABEL[c.state]
  if (c.cols < WIDE) {
    const task = c.description === '' ? '' : ` · ${c.description}`
    return (
      <Text color={t.color} bold={!fell} dimColor={fell} wrap="truncate-end">
        {`${emoji} ${t.name} · ${label}${task}`}
      </Text>
    )
  }
  const width = Math.min(c.cols - 2, 46)
  const art = c.banners ? bannerRows(t.key, width - 4) : []
  const said = cardLine(c)
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={fell ? 'error' : t.color} borderDimColor={fell} paddingX={1} width={width}>
      {art.map((row, i) => (
        <Text key={`art-${i}`} color={t.color} dimColor={fell} wrap="truncate-end">
          {row}
        </Text>
      ))}
      <Text wrap="truncate-end">
        <Text color={t.color} bold>
          {`${emoji} ${t.name}`}
        </Text>
        <Text dimColor>{` · ${t.role} · `}</Text>
        <Text color={fell ? 'error' : t.color}>{label}</Text>
      </Text>
      {c.description === '' ? null : <Text wrap="wrap">{`task  ${c.description}`}</Text>}
      {c.stats === undefined || c.stats === '' ? null : (
        <Text dimColor wrap="truncate-end">
          {c.stats}
        </Text>
      )}
      {said === '' ? null : (
        <Text color={t.color} italic dimColor={fell} wrap="wrap">
          {`“${said}”`}
        </Text>
      )}
    </Box>
  )
}

/** The `Says:` line as a speech bubble in the character's colour. */
function bubble(ui: UI, t: Theme, says: string, cols: number) {
  const { Box, Text } = ui
  if (cols < WIDE) {
    return (
      <Text color={t.color} italic wrap="wrap">
        {`${t.emoji} “${says}”`}
      </Text>
    )
  }
  const shape = BUBBLES[t.key] ?? { borderStyle: 'round', tail: '<' }
  const prefix = `${t.emoji} ${shape.tail}`
  const avail = cols - cells(prefix) - 2
  const width = Math.max(10, Math.min(avail, cells(says) + 4))
  return (
    <Box flexDirection="row" alignItems="center">
      <Box flexShrink={0}>
        <Text color={t.color}>{prefix}</Text>
      </Box>
      <Box borderStyle={shape.borderStyle} borderColor={t.color} paddingX={1} width={width}>
        <Text color={t.color} italic wrap="wrap">
          {says}
        </Text>
      </Box>
    </Box>
  )
}

export const installTranscript: Installer = (on, options) => {
  const themed = () => isOn(options, 'transcriptTheme')
  const bannersOn = () => isOn(options, 'banners')

  // Remember which subagent made each tool call, so a row can be badged by the crew member behind it.
  on('tool.call', { agentId: /./ }, async ($, e, next) => {
    if (themed()) {
      try {
        const id = String(e.tool_use_id)
        const loop = String(e.agentId)
        const found = (await $.agent.list()).find(a => a.id === loop)
        const key = found === undefined ? null : crewKey(found.type)
        await update($, callers, table => remember(table, id, key ?? '-'))
      } catch {
        // bookkeeping only
      }
    }
    return next(e)
  })

  // Remember which agent type each Agent call spawns, so its result can be drawn as that character's return card.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (themed()) {
      try {
        const type = (e as unknown as { subagent_type?: unknown }).subagent_type
        const key = typeof type === 'string' ? crewKey(type) : null
        await update($, spawns, table => remember(table, String(e.tool_use_id), key ?? '-'))
      } catch {
        // bookkeeping only
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const base = await next(e)
    if (!themed()) return base
    try {
      const t = await mainTheme($, options)
      if (t === null) return base
      const ui = $.ui.resolve(e)
      const { Box, Text } = ui
      const cols = columnsOf(e.viewport)
      const m = motifOf(t.key)
      const body = striped(ui, t.color, base)
      if (e.props.isFirstOfReply !== true) return body
      const head = cols >= WIDE ? `${t.emoji} ${m.glyph} ${t.name} ${m.glyph} ` : `${t.emoji} ${t.name}`
      const tail = cols >= WIDE ? rule(m.rule, cols, cells(head)) : ''
      return (
        <Box flexDirection="column">
          <Text wrap="truncate-end">
            <Text color={t.color} bold>
              {head}
            </Text>
            <Text color={t.accent}>{tail}</Text>
          </Text>
          {body}
        </Box>
      )
    } catch {
      return base
    }
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const base = await next(e)
    if (!themed()) return base
    try {
      const kind = e.props.origin.kind
      if (kind !== 'composer' && kind !== 'bridge') return base
      const t = await mainTheme($, options)
      if (t === null) return base
      const { Box, Text } = $.ui.resolve(e)
      const m = motifOf(t.key)
      const seal = columnsOf(e.viewport) >= WIDE ? `${m.glyph} you ${m.rule.repeat(6)}` : `${m.glyph} you`
      return (
        <Box flexDirection="column">
          <Text color={t.accent} dimColor wrap="truncate-end">
            {seal}
          </Text>
          {base}
        </Box>
      )
    } catch {
      return base
    }
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const base = await next(e)
    if (!themed()) return base
    try {
      const ui = $.ui.resolve(e)
      const { Box } = ui
      const cols = columnsOf(e.viewport)
      const p = e.props
      const who = await callerTheme($, options, p.tool_use_id)
      const row = who === null ? base : badged(ui, [who], cols, p.isErrored, base)
      const spawned = p.tool === 'Agent' ? crewOfInput(p.input) : null
      const crewBase = spawned === null ? undefined : CREW[spawned]
      if (crewBase === undefined) return row
      const crew = await painted($, crewBase)
      const state: CardState = p.isErrored ? 'fell' : p.isInterrupted ? 'recalled' : 'deployed'
      const card = crewCard(ui, {
        theme: crew,
        state,
        description: descriptionOf(p.input),
        cols,
        banners: bannersOn(),
        salt: p.tool_use_id,
      })
      return (
        <Box flexDirection="column">
          {card}
          {row}
        </Box>
      )
    } catch {
      return base
    }
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const base = await next(e)
    if (!themed()) return base
    try {
      const ui = $.ui.resolve(e)
      const { Box } = ui
      const cols = columnsOf(e.viewport)
      const p = e.props
      if (p.tool === 'Agent') {
        const facts = agentFacts(p.output)
        const lane = (await read($, spawns))[p.tool_use_id]
        let key = lane !== undefined && lane !== '-' ? lane : null
        if (lane === undefined && facts.agentType !== null) key = crewKey(facts.agentType)
        const crewBase = key === null ? undefined : CREW[key]
        if (crewBase !== undefined) {
          const crew = await painted($, crewBase)
          let fell = p.isErrored || (facts.status !== null && FALLEN_STATUSES.has(facts.status))
          if (!fell && facts.agentId !== null) {
            try {
              const found = (await $.agent.list()).find(a => a.id === facts.agentId)
              fell = found !== undefined && FALLEN_STATUSES.has(found.status)
            } catch {
              // the roster is a second opinion only: the result itself decides
            }
          }
          const background = !fell && facts.status === 'async_launched'
          const state: CardState = fell ? 'fell' : background ? 'background' : 'returned'
          const says = fell || background ? null : extractSays(facts.text)
          const card = crewCard(ui, {
            theme: crew,
            state,
            description: '',
            cols,
            banners: bannersOn(),
            salt: p.tool_use_id,
            stats: statsLine(facts),
          })
          return (
            <Box flexDirection="column">
              {card}
              {says === null ? null : bubble(ui, crew, says, cols)}
              {base}
            </Box>
          )
        }
      }
      if (!p.isErrored) return base
      const who = await callerTheme($, options, p.tool_use_id)
      if (who === null) return base
      return (
        <Box flexDirection="column">
          {errorMark(ui, who)}
          {base}
        </Box>
      )
    } catch {
      return base
    }
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const base = await next(e)
    if (!themed()) return base
    try {
      const ui = $.ui.resolve(e)
      const cols = columnsOf(e.viewport)
      const lanes = await read($, callers)
      const main = await mainTheme($, options)
      const who: Theme[] = []
      for (const call of e.props.calls) {
        const lane = call.tool_use_id === undefined ? undefined : lanes[call.tool_use_id]
        const known = lane === undefined || lane === '-' ? null : (CREW[lane] ?? null)
        const t = lane === undefined ? main : known === null ? null : await painted($, known)
        if (t !== null && !who.some(w => w.key === t.key)) who.push(t)
      }
      if (who.length === 0) return base
      return badged(ui, who, cols, e.props.calls.some(c => c.isErrored), base)
    } catch {
      return base
    }
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    const base = await next(e)
    if (!themed()) return base
    try {
      const ui = $.ui.resolve(e)
      const who = await callerTheme($, options, e.props.tool_use_id)
      if (who === null) return base
      return badged(ui, [who], 0, false, base)
    } catch {
      return base
    }
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const base = await next(e)
    if (!themed()) return base
    try {
      const command = dojoCommand(e.props.command)
      if (command === null || e.props.isErrored) return base
      let t = await mainTheme($, options)
      let art: string | null = null
      if (command === 'dojo-duty') {
        const named = dutyNameOf(e.props.text, Object.keys(STRATEGISTS))
        if (named !== null) {
          const picked = STRATEGISTS[named]
          t = picked === undefined ? t : await painted($, picked)
          art = named
        }
      }
      if (t === null) return base
      const { Box, Text } = $.ui.resolve(e)
      const cols = columnsOf(e.viewport)
      const m = motifOf(t.key)
      const rows = bannersOn() && art !== null && cols >= WIDE ? bannerRows(art, cols - 4) : []
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={t.color} paddingX={1}>
          {rows.map((row, i) => (
            <Text key={`art-${i}`} color={t.color} wrap="truncate-end">
              {row}
            </Text>
          ))}
          <Text wrap="truncate-end">
            <Text color={t.color} bold>
              {`${t.emoji} ${m.glyph} ${t.name}`}
            </Text>
            <Text color={t.accent}>{` · ${COMMAND_TITLES[command]}`}</Text>
          </Text>
          {base}
        </Box>
      )
    } catch {
      return base
    }
  })

  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const base = await next(e)
    if (!themed()) return base
    try {
      const t = await mainTheme($, options)
      if (t === null) return base
      const { Box, Text } = $.ui.resolve(e)
      const m = motifOf(t.key)
      return (
        <Box flexDirection="column">
          <Text wrap="truncate-end">
            <Text color={t.color} bold>
              {`${t.emoji} ${m.glyph} ${t.name} `}
            </Text>
            <Text color={t.accent}>{ASKS[t.key] ?? ASKS.strategist}</Text>
          </Text>
          {base}
        </Box>
      )
    } catch {
      return base
    }
  })

  on('ui.render', { component: 'InfoNotice' }, async ($, e, next) => {
    const base = await next(e)
    if (!themed()) return base
    try {
      const t = await mainTheme($, options)
      if (t === null) return base
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="row">
          <Box flexShrink={0} marginRight={1}>
            <Text color={t.color}>{motifOf(t.key).glyph}</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            {base}
          </Box>
        </Box>
      )
    } catch {
      return base
    }
  })
}
