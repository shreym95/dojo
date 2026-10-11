import { isDojoType } from '../lib/persona'
import type { Installer } from '../lib/options'

// A caller's "always pass model: sonnet" must not override a dojo agent's own frontmatter model;
// undefined lets the agent decide. Ships regardless of every toggle.
export const installModelGuard: Installer = on => {
  on('agent.spawn', async ($, e, next) => {
    if (!isDojoType(e.subagentType)) return next(e)
    return next(e.model === undefined ? e : { ...e, model: undefined })
  })
}
