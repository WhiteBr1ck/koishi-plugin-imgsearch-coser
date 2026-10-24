import { Argv } from 'koishi'
import type { Context } from 'koishi'

export function registerImageCommandParser(ctx: Context, names: string[]) {
  ctx.before('parse', (content, session) => {
    const { prefix, appel } = session.stripped
    // Keep Koishi's normal prefix and mention requirements.
    // Koishi supports undefined to continue this bail hook, but its event type omits it.
    if (!session.isDirect && typeof prefix !== 'string' && !appel) return undefined!
    for (const name of names) {
      if (content.slice(0, name.length).toLowerCase() !== name.toLowerCase()) continue
      const rest = content.slice(name.length).trimStart()
      if (!/^<img(?:\s|\/?>)/.test(rest)) continue
      return Argv.parse(content.slice(0, name.length) + ' ' + rest)
    }
    return undefined!
  })
}
