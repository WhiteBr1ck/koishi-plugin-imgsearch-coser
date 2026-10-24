import { Context, h } from 'koishi'
import type {} from '@koishijs/plugin-console'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { ConfigSchema } from './config'
import { ExpiringCache } from './cache'
import { SearchError, userError } from './errors'
import { imageSource, loadImage, resolveSessionImage } from './image'
import { formatResults, PROGRESS_MESSAGE } from './message'
import { Network } from './network'
import { searchImage, type FinalResults } from './search'
import type { Config as PluginConfig } from './types'
import { registerImageCommandParser } from './command'
import { GoogleCookieStore } from './google-cookies'
import type { DiagnosticReporter } from './diagnostics'
import { SearchRouting, searchConfigurationError } from './routing'

export const name = 'imgsearch-coser'
export const inject = { required: ['http'], optional: ['console'] }
export type Config = PluginConfig
export const Config = ConfigSchema
export const usage = '使用方法：\n\n发送「找coser」并附图，或引用图片后发送指令。\n\n可在配置中修改指令、指令别名和返回消息格式。'

export function apply(ctx: Context, config: Config) {
  if (!/^[^\s<>\[\]]+$/.test(config.command) || config.aliases.some(alias => !/^[^\s<>\[\]]+$/.test(alias))) {
    throw new Error('搜图指令及别名不能为空，也不能包含空格、尖括号或方括号。')
  }
  const logger = ctx.logger(name)
  ctx.inject(['console'], ctx => {
    ctx.console.addEntry({ dev: resolve(__dirname, '../client/index.ts'), prod: resolve(__dirname, '../dist') })
  })
  const cache = new ExpiringCache<FinalResults>(config.cacheEntries, config.cacheMinutes * 60000)
  const googleCookies = new GoogleCookieStore(config.googleCookie)
  const routing = new SearchRouting(config)
  const cooldown = new Map<string, number>()
  const pending = new Set<string>()
  const controllers = new Set<AbortController>()
  let active = 0
  let disposed = false
  ctx.on('dispose', () => {
    disposed = true
    for (const controller of controllers) controller.abort()
    controllers.clear(); pending.clear(); cooldown.clear(); cache.clear()
    googleCookies.clear()
    routing.clear()
  })

  const command = ctx.command(`${config.command} [image:text]`, '通过 Google Lens 搜图并汇总社交平台帖子')
  for (const alias of new Set(config.aliases)) if (alias !== config.command) command.alias(alias)
  registerImageCommandParser(ctx, [config.command, ...config.aliases])
  command.action(async ({ session }, argument) => {
    if (!session || disposed) return
    if (!config.platforms.some(rule => rule.enabled)) return '请先在插件配置的结果平台表格中启用至少一个平台。'
    const configError = searchConfigurationError(config)
    if (configError) return configError
    const user = `${session.platform}:${session.userId || session.channelId}`
    const key = `${session.bot.sid}:${session.channelId}:${user}`
    const now = Date.now()
    for (const [id, expires] of cooldown) if (expires <= now) cooldown.delete(id)
    if (pending.has(key)) return '你已经有一个搜图请求在处理中，请等待结果。'
    if ((cooldown.get(user) || 0) > now) return `请等待 ${Math.ceil((cooldown.get(user)! - now) / 1000)} 秒后再搜索。`
    if (active >= config.maxConcurrent || pending.size >= 100) return '当前搜图请求较多，请稍后重试。'
    pending.add(key)
    let controller: AbortController | undefined
    let clearTimer: (() => void) | undefined
    let acquired = false
    const start = Date.now()
    try {
      let source = await resolveSessionImage(session, argument)
      if (disposed) return
      if (!source) {
        await session.send('请发送要搜索的图片。')
        const reply = await session.prompt(config.promptTimeout * 1000)
        if (disposed) return
        if (!reply) return '等待图片超时，请重新发送搜图指令。'
        source = imageSource(reply) || (/^https?:\/\/\S+$/i.test(reply.trim()) ? reply.trim() : undefined)
        if (!source) return '没有收到可读取的图片，请重新发送指令并附带图片。'
      }
      if (disposed) return
      if (active >= config.maxConcurrent) return '当前搜图请求较多，请稍后重试。'
      active++; acquired = true
      // Bound user tracking even on busy public bots.
      if (cooldown.size >= 10000) cooldown.delete(cooldown.keys().next().value!)
      cooldown.set(user, Date.now() + config.cooldown * 1000)
      controller = new AbortController()
      controllers.add(controller)
      clearTimer = ctx.setTimeout(() => controller!.abort(new SearchError('TIMEOUT', '搜索超时，请稍后重试。')), config.totalTimeout * 1000)
      if (config.showProgress) await session.send(h.text(PROGRESS_MESSAGE))
      if (config.logDetails) logger.info('preferredProvider=%s stage=start', config.provider)
      const network = new Network(ctx, controller.signal, config.requestTimeout * 1000)
      const input = await loadImage(source, network, config.maxImageMB)
      if (config.logDetails) logger.info('preferredProvider=%s stage=image_ready bytes=%d', config.provider, input.data.length)
      const hash = createHash('sha256').update(input.data).digest('hex')
      let output = cache.get(hash)
      const cached = !!output
      if (!output) {
        const diagnostic: DiagnosticReporter | undefined = config.logDetails ? event => {
          const { provider, ...details } = event
          if (!disposed) logger.info(provider ? 'provider=%s %s' : 'preferredProvider=%s %s', provider || config.provider,
            Object.entries(details).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}=${value}`).join(' '))
        } : undefined
        output = await searchImage(input, network, config, { googleCookies, diagnostic, routing })
        if (!output.warnings.length && output.results.length) cache.set(hash, output)
      }
      if (disposed) return
      if (config.logDetails) logger.info('preferredProvider=%s count=%d cached=%s elapsedMs=%d', config.provider, output.results.length, cached, Date.now() - start)
      return h.text(formatResults(output.results, config.showTitle, output.warnings, config.resultTemplate))
    } catch (error) {
      if (disposed) return
      const actual = controller?.signal.aborted ? controller.signal.reason : error
      if (config.logDetails) logger.warn('preferredProvider=%s error=%s elapsedMs=%d', config.provider, actual instanceof SearchError ? actual.code : 'REQUEST_FAILED', Date.now() - start)
      return h.text(userError(actual))
    } finally {
      clearTimer?.()
      if (controller) controllers.delete(controller)
      if (acquired) active--
      pending.delete(key)
    }
  })
}
