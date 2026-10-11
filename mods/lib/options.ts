import type { On, PluginOptions } from 'claude-code'

export type Options = PluginOptions

/** A feature installer: registers its hooks on `on`, reading its toggles from `options`. */
export type Installer = (on: On, options: Options) => void

/** Every feature is a `userConfig` toggle: on unless explicitly false. */
export const isOn = (options: Options, name: string): boolean => options[name] !== false
