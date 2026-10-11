// A small shell lexer: enough to find `git commit` in a Bash command.

export type Word = { text: string; dynamic: boolean }
export type Cmd = Word[]

export function base(path: string | undefined): string {
  return (path ?? '').split('/').pop() ?? ''
}

function skipParen(src: string, open: number): number {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === '\\') {
      i++
    } else if (c === "'") {
      const j = src.indexOf("'", i + 1)
      if (j < 0) return src.length
      i = j
    } else if (c === '"') {
      i++
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') i++
        i++
      }
    } else if (c === '(') {
      depth++
    } else if (c === ')') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return src.length
}

function readHeredocBody(src: string, from: number, delim: string, tabs: boolean): { body: string; end: number } | null {
  const lines: string[] = []
  let pos = from
  for (;;) {
    const nl = src.indexOf('\n', pos)
    const lineEnd = nl === -1 ? src.length : nl
    const raw = src.slice(pos, lineEnd)
    const line = tabs ? raw.replace(/^\t+/, '') : raw
    if (line === delim) return { body: lines.join('\n'), end: lineEnd }
    lines.push(line)
    if (nl === -1) return null
    pos = nl + 1
  }
}

const CAT_HEREDOC = /\$\(\s*cat\s+<<(-?)[ \t]*(?:'([A-Za-z_]\w*)'|"([A-Za-z_]\w*)"|\\?([A-Za-z_]\w*))[ \t]*\n/y
const EXPANSION_IN_BODY = /\$[A-Za-z_{(0-9@*#?!$]|`/

/** `$(cat <<'EOF' ... EOF )` at `at`: its literal body and the index after the closing paren. */
function matchCatHeredoc(src: string, at: number): { body: string; dynamic: boolean; end: number } | null {
  CAT_HEREDOC.lastIndex = at
  const m = CAT_HEREDOC.exec(src)
  if (m === null) return null
  const delim = m[2] ?? m[3] ?? m[4] ?? ''
  const body = readHeredocBody(src, CAT_HEREDOC.lastIndex, delim, m[1] === '-')
  if (body === null) return null
  const close = /\s*\)/y
  close.lastIndex = body.end
  if (close.exec(src) === null) return null
  const quoted = m[2] !== undefined || m[3] !== undefined
  return { body: body.body, dynamic: !quoted && EXPANSION_IN_BODY.test(body.body), end: close.lastIndex }
}

const ANSI_ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' }

/** Splits a shell command into simple commands of words. Unresolvable expansions mark a word `dynamic`. */
export function lex(src: string): Cmd[] {
  const cmds: Cmd[] = []
  let cur: Cmd = []
  let text = ''
  let dynamic = false
  let inWord = false
  let skipNext = false
  const pending: { delim: string; tabs: boolean }[] = []

  const endWord = () => {
    if (!inWord) return
    if (skipNext) skipNext = false
    else cur.push({ text, dynamic })
    text = ''
    dynamic = false
    inWord = false
  }
  const endCmd = () => {
    endWord()
    if (cur.length > 0) cmds.push(cur)
    cur = []
  }

  let i = 0
  while (i < src.length) {
    const c = src[i] as string
    const next = src[i + 1]

    if (c === '\n') {
      endCmd()
      i++
      for (const h of pending) {
        const r = readHeredocBody(src, i, h.delim, h.tabs)
        i = r === null ? src.length : r.end
      }
      pending.length = 0
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      endWord()
      i++
      continue
    }
    if (c === '\\') {
      if (next === '\n') {
        i += 2
      } else {
        text += next ?? ''
        inWord = true
        i += 2
      }
      continue
    }
    if (c === "'") {
      const j = src.indexOf("'", i + 1)
      text += src.slice(i + 1, j < 0 ? src.length : j)
      inWord = true
      i = j < 0 ? src.length : j + 1
      continue
    }
    if (c === '$' && next === "'") {
      i += 2
      while (i < src.length && src[i] !== "'") {
        if (src[i] === '\\' && i + 1 < src.length) {
          text += ANSI_ESCAPES[src[i + 1] as string] ?? (src[i + 1] as string)
          i += 2
        } else {
          text += src[i]
          i++
        }
      }
      inWord = true
      i++
      continue
    }
    if (c === '"') {
      inWord = true
      i++
      while (i < src.length && src[i] !== '"') {
        const ch = src[i] as string
        const nx = src[i + 1]
        if (ch === '\\') {
          if (nx === '"' || nx === '\\' || nx === '$' || nx === '`') {
            text += nx
            i += 2
          } else if (nx === '\n') {
            i += 2
          } else {
            text += ch
            i++
          }
        } else if (ch === '$' && nx === '(') {
          const heredoc = matchCatHeredoc(src, i)
          if (heredoc !== null) {
            text += heredoc.body
            dynamic ||= heredoc.dynamic
            i = heredoc.end
          } else {
            dynamic = true
            i = skipParen(src, i + 1)
          }
        } else if (ch === '`') {
          dynamic = true
          const j = src.indexOf('`', i + 1)
          i = j < 0 ? src.length : j + 1
        } else if (ch === '$' && nx !== undefined && /[A-Za-z_{0-9@*#?!$]/.test(nx)) {
          dynamic = true
          i += 2
        } else {
          text += ch
          i++
        }
      }
      i++
      continue
    }
    if (c === '$' && next === '(') {
      dynamic = true
      inWord = true
      i = skipParen(src, i + 1)
      continue
    }
    if (c === '`') {
      dynamic = true
      inWord = true
      const j = src.indexOf('`', i + 1)
      i = j < 0 ? src.length : j + 1
      continue
    }
    if (c === '$' && next !== undefined && /[A-Za-z_{0-9@*#?!$]/.test(next)) {
      dynamic = true
      inWord = true
      i += 2
      continue
    }
    if (c === '#' && !inWord) {
      const j = src.indexOf('\n', i)
      i = j < 0 ? src.length : j
      continue
    }
    if (c === '<' || c === '>' || (c === '&' && next === '>')) {
      if (inWord && /^\d+$/.test(text)) {
        text = ''
        inWord = false
      } else {
        endWord()
      }
      if (c === '<' && next === '<' && src[i + 2] === '<') {
        i += 3
        skipNext = true
      } else if (c === '<' && next === '<') {
        const tabs = src[i + 2] === '-'
        i += tabs ? 3 : 2
        while (src[i] === ' ' || src[i] === '\t') i++
        let delim = ''
        const q = src[i]
        if (q === "'" || q === '"') {
          const j = src.indexOf(q, i + 1)
          delim = src.slice(i + 1, j < 0 ? src.length : j)
          i = j < 0 ? src.length : j + 1
        } else {
          const m = /^[^\s;&|<>()]+/.exec(src.slice(i))
          delim = (m?.[0] ?? '').replace(/\\/g, '')
          i += m?.[0].length ?? 0
        }
        if (delim !== '') pending.push({ delim, tabs })
      } else if (next === '&' || (c === '&' && next === '>')) {
        i += c === '&' ? (src[i + 2] === '>' ? 3 : 2) : 2
        const fd = /^(\d+-?|-)/.exec(src.slice(i))
        if (c !== '&' && fd !== null) i += fd[0].length
        else skipNext = true
      } else {
        i += next === '>' || next === '|' || next === '<' ? 2 : 1
        skipNext = true
      }
      continue
    }
    if (c === ';' || c === '|' || c === '&' || c === '(' || c === ')') {
      endCmd()
      i += (c === '&' && next === '&') || (c === '|' && (next === '|' || next === '&')) ? 2 : 1
      continue
    }
    text += c
    inWord = true
    i++
  }
  endCmd()
  return cmds
}

const KEYWORDS = new Set(['!', '{', '}', 'if', 'then', 'else', 'elif', 'do', 'while', 'until'])
const WRAPPERS = new Set(['env', 'command', 'exec', 'builtin', 'nohup', 'time'])
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash'])

/** The command proper: leading keywords, `VAR=value` words, wrappers (env, time, timeout...) dropped. */
export function head(cmd: Cmd): Cmd {
  let k = 0
  for (;;) {
    const w = cmd[k]
    if (w === undefined) break
    if (KEYWORDS.has(w.text) || /^[A-Za-z_]\w*=/.test(w.text)) {
      k++
    } else if (WRAPPERS.has(w.text)) {
      k++
      while (cmd[k]?.text.startsWith('-')) k++
    } else if (w.text === 'timeout') {
      k++
      while (cmd[k]?.text.startsWith('-')) k++
      k++
    } else {
      break
    }
  }
  return cmd.slice(k)
}

/** Every simple command in `src`, including those inside `bash -c '...'` (two levels deep at most). */
export function parseShell(src: string, depth = 0): Cmd[] {
  const out: Cmd[] = []
  for (const cmd of lex(src)) {
    out.push(cmd)
    if (depth >= 2) continue
    const h = head(cmd)
    if (!SHELLS.has(base(h[0]?.text))) continue
    const at = h.findIndex((w, k) => k > 0 && /^-[a-z]*c[a-z]*$/.test(w.text))
    const script = at < 0 ? undefined : h[at + 1]
    if (script !== undefined && !script.dynamic) out.push(...parseShell(script.text, depth + 1))
  }
  return out
}
