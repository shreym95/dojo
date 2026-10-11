// Art and lines for visuals/transcript.tsx: banners, card lines, bubble shapes, error marks, motifs.
// Every banner is original, plain ASCII, at most BANNER_ROWS rows by BANNER_COLUMNS columns.

export const BANNER_ROWS = 7
export const BANNER_COLUMNS = 40

/** One banner per character (strategists and crew), keyed like the theme records. */
export const BANNERS: Record<string, readonly string[]> = {
  shikamaru: [
    String.raw`  Y     Y`,
    String.raw`   \   /       S H I K A M A R U`,
    String.raw`   (-. .-)     ==================`,
    String.raw`   ( v v )     what a drag...`,
    String.raw`   '-----'     .--.  .---.`,
    String.raw`               (    )(     )  clouds`,
  ],
  lelouch: [
    String.raw`      +`,
    String.raw`     _|_`,
    String.raw`    (___)       L E L O U C H`,
    String.raw`     | |        ==============`,
    String.raw`    /___\       checkmate.`,
    String.raw`   [_____]`,
  ],
  senku: [
    String.raw`     _`,
    String.raw`    | |      S E N K U`,
    String.raw`    | |      ===========`,
    String.raw`   /o  \     ten billion percent`,
    String.raw`  (_.o__)`,
  ],
  sanji: [
    String.raw`    ) ) )`,
    String.raw`  .-------.   S A N J I`,
    String.raw` /  .---.  \  ===========`,
    String.raw` \  '---'  /=== order up`,
    String.raw`  '-------'`,
  ],
  l: [
    String.raw`      ____`,
    String.raw`     /__/ |     L`,
    String.raw`    |~~~~ |     ===========`,
    String.raw`    |_____|/    the case is closed`,
  ],
  light: [
    String.raw`   .-------.`,
    String.raw`   | ===== |    L I G H T`,
    String.raw`   | ===== |    ===========`,
    String.raw`   |  ~ ~  |    just as planned`,
    String.raw`   '-------'`,
  ],
  levi: [
    String.raw`   \    /`,
    String.raw`    \  /       L E V I`,
    String.raw`     \/        ===========`,
    String.raw`     /\        spotless`,
    String.raw`    _/  \_`,
  ],
  robin: [
    String.raw`      (@)`,
    String.raw`    (@)*(@)    R O B I N`,
    String.raw`      (@)      ===========`,
    String.raw`       |       the record stands`,
    String.raw`      -+-`,
  ],
}

/** The generic banner of a theme without art of its own (the neutral strategist). */
export const NEUTRAL_BANNER: readonly string[] = [
  String.raw`   .-----.`,
  String.raw`   | o o |     S T R A T E G I S T`,
  String.raw`   '-----'     =====================`,
]

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
