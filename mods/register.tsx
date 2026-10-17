import type { Register } from 'claude-code'

import { installArchitectGuard } from './features/architect-guard'
import { installArchivist } from './features/archivist'
import { installCommands } from './features/commands'
import { installCommitGate } from './features/commit-gate'
import { installModelGuard } from './features/model-guard'
import { installRoleGuard } from './features/role-guard'
import { installPersona } from './lib/persona'
import { installRecorders } from './state/recorders'
import { installChrome } from './visuals/chrome'
import { installTranscript } from './visuals/transcript'

// What `claude plugin validate` enforces on this module graph, and so on every installer:
// - an event has at most one hook without a matcher (today: session.append, prompt.submit, agent.spawn in the
//   model guard, tool.call in the state recorders); every further hook on it needs a matcher: on(event, matcher, hook),
//   and several hooks may share one matcher (each runs)
// - `$` is passed only to functions declared in the same file, never across an import
// - an atom is read and updated only through a const of the file that uses it (the {plugin, key} pair is the shared name)
// - events are spelled literally: on('<event>', ...)
export const register: Register = (on, options) => {
  installPersona(on, options)
  installModelGuard(on, options)
  installCommitGate(on, options)
  installRoleGuard(on, options)
  installArchitectGuard(on, options)
  installArchivist(on, options)
  installCommands(on, options)
  installChrome(on, options)
  installTranscript(on, options)
  // Registered after the visuals on purpose: the first hook registered is the outermost, and a hook acts on what `next(e)`
  // returned, so the recorders (innermost) have written their state by the time the visuals' hooks read it (the deploy toast
  // reads the run count that the agent.spawn recorder has just bumped).
  installRecorders(on, options)
}
