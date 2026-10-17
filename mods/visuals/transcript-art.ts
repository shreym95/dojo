// Art and lines for visuals/transcript.tsx: banners, card lines, bubble shapes, error marks, motifs.
// Every banner is original, plain ASCII, at most BANNER_ROWS rows by BANNER_COLUMNS columns.

export const BANNER_ROWS = 7
export const BANNER_COLUMNS = 40

/**
 * A banner from its drawing and its caption. The drawing is padded to its own widest row, the caption starts three cells
 * after it at row `at`, and every row is padded to the banner width: no ragged edge, no shared left margin.
 */
function banner(art: readonly string[], caption: readonly string[], at = 1): readonly string[] {
  const lead = Math.min(...art.filter(r => r.trim() !== '').map(r => r.length - r.trimStart().length))
  const drawn = art.map(r => r.slice(lead).trimEnd())
  const artWidth = Math.max(...drawn.map(r => r.length))
  const count = Math.max(drawn.length, at + caption.length)
  const rows = Array.from({ length: count }, (_, i) => {
    const left = (drawn[i] ?? '').padEnd(artWidth)
    const text = caption[i - at]
    return text === undefined ? left : `${left}   ${text}`
  })
  const width = Math.max(...rows.map(r => r.length))
  return rows.map(r => r.padEnd(width))
}

/** One banner per character (strategists and crew), keyed like the theme records. Drawings are symmetric about their axis. */
export const BANNERS: Record<string, readonly string[]> = {
  shikamaru: banner(
    [
      String.raw`  \ | /  `,
      String.raw` (-. .-) `,
      String.raw` ( v v ) `,
      String.raw`  '---'  `,
      String.raw` .--.--. `,
      String.raw`(_______)`,
    ],
    ['S H I K A M A R U', '=================', 'what a drag...'],
  ),
  lelouch: banner(
    [
      String.raw`    +    `,
      String.raw`   _|_   `,
      String.raw`  (___)  `,
      String.raw`   | |   `,
      String.raw`  /___\  `,
      String.raw` [_____] `,
    ],
    ['L E L O U C H', '=============', 'checkmate.'],
  ),
  senku: banner(
    [
      String.raw`   | |   `,
      String.raw`   | |   `,
      String.raw`   | |   `,
      String.raw`  /   \  `,
      String.raw` / o o \ `,
      String.raw`(_______)`,
    ],
    ['S E N K U', '=========', 'ten billion percent'],
  ),
  sanji: banner(
    [
      String.raw`   ~ ~ ~   `,
      String.raw` .-------. `,
      String.raw`/  .---.  \ `,
      String.raw`\  '---'  /`,
      String.raw` '-------' `,
    ],
    ['S A N J I', '=========', 'order up'],
  ),
  l: banner(
    [
      String.raw`     o     `,
      String.raw`   .-^-.   `,
      String.raw`  /_____\  `,
      String.raw` |~~~~~~~| `,
      String.raw` |_______| `,
    ],
    ['L', '=================', 'the case is closed'],
  ),
  light: banner(
    [
      String.raw`.-------.`,
      String.raw`| ===== |`,
      String.raw`| ===== |`,
      String.raw`|  ~ ~  |`,
      String.raw`'-------'`,
    ],
    ['L I G H T', '=========', 'just as planned'],
  ),
  levi: banner(
    [
      String.raw`\    /`,
      String.raw` \  / `,
      String.raw`  \/  `,
      String.raw`  /\  `,
      String.raw` /  \ `,
      String.raw`/    \ `,
    ],
    ['L E V I', '=======', 'spotless'],
  ),
  robin: banner(
    [
      String.raw`   (@)   `,
      String.raw` (@)*(@) `,
      String.raw`   (@)   `,
      String.raw`  \ | /  `,
      String.raw`   \|/   `,
      String.raw`    |    `,
    ],
    ['R O B I N', '=========', 'the record stands'],
  ),
}

/** The generic banner of a theme without art of its own (the neutral strategist). */
export const NEUTRAL_BANNER: readonly string[] = banner(
  [String.raw`.-----.`, String.raw`| o o |`, String.raw`'-----'`],
  ['S T R A T E G I S T', '==================='],
)

/** Per-character motif glyphs (single width) for header rules and gutters. */
export const MOTIFS: Record<string, { glyph: string; rule: string; gutter: string }> = {
  shikamaru: { glyph: '☁', rule: '~', gutter: '▏' },
  lelouch: { glyph: '♚', rule: '═', gutter: '▌' },
  strategist: { glyph: '◆', rule: '─', gutter: '▏' },
  senku: { glyph: '⚗', rule: '·', gutter: '▏' },
  sanji: { glyph: '♨', rule: '~', gutter: '▏' },
  l: { glyph: '◔', rule: '·', gutter: '▏' },
  light: { glyph: '✎', rule: '─', gutter: '▏' },
  levi: { glyph: '⚔', rule: '─', gutter: '▏' },
  robin: { glyph: '❀', rule: '·', gutter: '▏' },
}

/** Deployment signature lines (shown on the crew card), rotated by call id. */
export const DEPLOY_LINES: Record<string, readonly string[]> = {
  senku: ['Ten billion percent doable.', 'Get excited!', 'Let\'s get building.'],
  sanji: ['Allow me.', 'Leave the rest to me.', 'Order up.'],
  l: ['Hm. A suspect with two alibis.', 'Let\'s eliminate the suspects.', 'I have a lead.'],
  light: ['Just as planned.', 'A step ahead.', 'Naturally.'],
  levi: ['Chi. Show me the mess.', 'Tch. Let me see the damage.', 'Wipe it down.'],
  robin: ["Fufu. I'll decipher it.", 'How interesting.', 'Shall we read on?'],
}

/** Return-card lines, shown with the header when a crew member reports back. */
export const RETURN_LINES: Record<string, readonly string[]> = {
  senku: ['Experiment succeeded.', 'Science wins.'],
  sanji: ['Served.', 'Bon appetit.'],
  l: ['The case is closed.', 'Interesting.'],
  light: ['Done. Cleanly.', 'Exactly as expected.'],
  levi: ['Acceptable.', 'Spotless.'],
  robin: ['The record stands.', 'The record is complete.'],
}

/** Fallen-card lines, shown when a crew member failed or was killed. */
export const FALLEN_LINES: Record<string, readonly string[]> = {
  senku: ['Failed experiment. That is data.'],
  sanji: ['Spoiled ingredient.'],
  l: ['I suspected as much.'],
  light: ['An unexpected variable.'],
  levi: ['Filthy.'],
  robin: ['A worn inscription.'],
}

/** Decorative mark next to a tool error, by whoever made the call. Never replaces the error text. */
export const ERROR_MARKS: Record<string, string> = {
  shikamaru: 'A hole in the formation.',
  lelouch: 'A breach in the line.',
  strategist: 'Error.',
  senku: 'Failed experiment.',
  sanji: 'Spoiled ingredient.',
  l: 'Suspicious.',
  light: 'An unexpected variable.',
  levi: 'Filthy.',
  robin: 'A forged inscription.',
}

/** Speech-bubble shape per crew member: the border style and the tail drawn before the bubble. */
export const BUBBLES: Record<string, { borderStyle: string; tail: string }> = {
  senku: { borderStyle: 'round', tail: '<' },
  sanji: { borderStyle: 'round', tail: '~<' },
  l: { borderStyle: 'single', tail: '.<' },
  light: { borderStyle: 'double', tail: '=<' },
  levi: { borderStyle: 'bold', tail: '-<' },
  robin: { borderStyle: 'round', tail: '*<' },
}

/** Strategist header lines and the speaker label of an AskUserQuestion. */
export const ASKS: Record<string, string> = {
  shikamaru: 'has a question. Troublesome, but necessary.',
  lelouch: 'requires your answer.',
  strategist: 'has a question.',
}

/** Shown in the frame of a /dojo-duty or /dojo-voice output. */
export const COMMAND_TITLES: Record<string, string> = {
  'dojo-duty': 'on duty',
  'dojo-voice': 'voice',
}
