import { CREW } from '../theme'

export type ToastKind = 'commit' | 'backend' | 'frontend' | 'lookups' | 'architect' | 'compact'

/** Who speaks, and what they say, for each guard's user-facing toast. */
export const TOASTS: Record<ToastKind, { who: string; line: string }> = {
  commit: { who: 'levi', line: 'Filthy commit message. Rejected.' },
  backend: { who: 'senku', line: 'That is a lab job. Hand it over, and get excited.' },
  frontend: { who: 'sanji', line: 'The kitchen is mine. Allow me to plate that.' },
  lookups: { who: 'jiraiya', line: 'Too many searches for one head, kid. Send the investigation to my network.' },
  architect: { who: 'kurisu', line: "Writing to the main tree isn't my job. POCs go in the scratchpad; builders build." },
  compact: { who: 'robin', line: 'Fufu. I will keep the thread safe.' },
}

export function toastLine(kind: ToastKind): string {
  const { who, line } = TOASTS[kind]
  const c = CREW[who]
  return `${c?.emoji ?? ''} ${c?.name ?? who}: "${line}"`.trim()
}
