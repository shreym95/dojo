import type { Register } from 'claude-code'

import { installArchivist } from './features/archivist'
import { installCommands } from './features/commands'
import { installCommitGate } from './features/commit-gate'
import { installModelGuard } from './features/model-guard'
import { installRoleGuard } from './features/role-guard'
import { installPersona } from './lib/persona'
import { installChrome } from './visuals/chrome'
import { installTranscript } from './visuals/transcript'

// What `claude plugin validate` enforces on this module graph, and so on every installer:
// - an event has at most one hook without a matcher (today: session.append, prompt.submit, agent.spawn in the
//   model guard, tool.call in chrome); any further hook on it needs a distinct matcher: on(event, matcher, hook)
// - `$` is passed only to functions declared in the same file, never across an import
// - an atom is read and updated only through a const of the file that uses it (the {plugin, key} pair is the shared name)
// - events are spelled literally: on('<event>', ...)
export const register: Register = (on, options) => {
  installPersona(on, options)
  installModelGuard(on, options)
  installCommitGate(on, options)
  installRoleGuard(on, options)
  installArchivist(on, options)
  installCommands(on, options)
  installChrome(on, options)
  installTranscript(on, options)
}
