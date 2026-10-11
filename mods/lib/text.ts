export function hash(text: string): number {
  let h = 0
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

/** Rotates per turn; `salt` (an agent id) keeps concurrent agents from marching in step. */
export function pick<T>(pool: readonly T[], turn: number, salt = ''): T {
  return pool[(turn + hash(salt)) % pool.length] as T
}

export function truncate(text: string, max: number): string {
  const chars = [...text]
  if (max <= 0) return ''
  return chars.length <= max ? text : chars.slice(0, Math.max(0, max - 1)).join('') + '…'
}

/** `Bash: npm test` from a tool.call event's tool name and arguments. */
export function summarizeTool(tool: string, args: Record<string, unknown>): string {
  const preferred = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description']
  const field = preferred.find(k => typeof args[k] === 'string')
  const value =
    field !== undefined
      ? (args[field] as string)
      : Object.values(args).find((v): v is string => typeof v === 'string')
  const short = tool.replace(/^mcp__/, '')
  return value === undefined ? short : `${short}: ${value.replace(/\s+/g, ' ').trim()}`
}
