import { SearchError } from './errors'
import type { DiagnosticReporter } from './diagnostics'
import type { Config, MatchKind, SearchResult } from './types'

type RoutingConfig = Pick<Config, 'provider' | 'autoFallback' | 'apiKey' | 'apiKeys' | 'googleCookie'>

export function configuredKeys(config: Pick<Config, 'apiKey' | 'apiKeys'>): string[] {
  return [...new Set([config.apiKey, ...(config.apiKeys || [])].map(key => key.trim()).filter(Boolean))]
}

export function searchConfigurationError(config: RoutingConfig): string | undefined {
  const serpapi = configuredKeys(config).length > 0
  const direct = !!config.googleCookie.trim()
  if (config.autoFallback && (serpapi || direct)) return
  if (config.provider === 'serpapi' && !serpapi) return '请先填写 SerpApi API Key，或在插件配置中选择 Lens 网页接口。'
  if (config.provider === 'direct' && !direct) return '请先在 Google Lens 网页接口设置中填写 Cookie。'
}

export type SearchEndpoint = { provider: 'serpapi'; apiKey: string; keyIndex: number } | { provider: 'direct' }
interface SearchProvider { search(kind: MatchKind): Promise<SearchResult[]> }
export type ProviderFactory = (endpoint: SearchEndpoint, diagnostic?: DiagnosticReporter) => SearchProvider

function retryable(error: unknown): boolean {
  if (!(error instanceof SearchError)) return error instanceof Error
  return /^(?:SERP_|GOOGLE_)/.test(error.code) || error.code === 'LENS_FORMAT'
}

function cooldown(error: unknown): number {
  if (error instanceof SearchError) {
    if (['SERP_KEY', 'SERP_QUOTA'].includes(error.code)) return 30 * 60_000
    if (['GOOGLE_JS', 'GOOGLE_CAPTCHA', 'GOOGLE_CONSENT', 'GOOGLE_BLOCKED'].includes(error.code)) return 5 * 60_000
  }
  return 60_000
}

/** Shared health and key rotation for one plugin instance, with no background requests. */
export class SearchRouting {
  private readonly keys: Extract<SearchEndpoint, { provider: 'serpapi' }>[]
  private readonly webpage: SearchEndpoint | undefined
  private readonly blockedUntil = new Map<SearchEndpoint, number>()
  private cursor = 0
  private closed = false

  constructor(private readonly config: RoutingConfig, private readonly now = Date.now) {
    this.keys = configuredKeys(config).map((apiKey, index) => ({ provider: 'serpapi', apiKey, keyIndex: index + 1 }))
    this.webpage = config.googleCookie.trim() ? { provider: 'direct' } : undefined
  }

  private plan(): SearchEndpoint[] {
    const keys = [...this.keys.slice(this.cursor), ...this.keys.slice(0, this.cursor)]
    const webpage = this.webpage ? [this.webpage] : []
    if (!this.config.autoFallback) return this.config.provider === 'serpapi' ? keys : webpage
    return this.config.provider === 'serpapi' ? [...keys, ...webpage] : [...webpage, ...keys]
  }

  create(factory: ProviderFactory, signal: AbortSignal, diagnostic?: DiagnosticReporter): SearchProvider {
    // Plan lazily so concurrent searches reserve different first keys before awaiting I/O.
    let endpoints: SearchEndpoint[] | undefined
    let current = 0, attempts = 0
    const failed = new Set<SearchEndpoint>()
    const instances = new Map<SearchEndpoint, SearchProvider>()
    return { search: async kind => {
      signal.throwIfAborted()
      if (this.closed) throw new SearchError('CLOSED', '插件已停止，请重新启用后重试。')
      endpoints ||= this.plan()
      let lastError: unknown
      for (let index = current; index < endpoints.length; index++) {
        signal.throwIfAborted()
        const endpoint = endpoints[index]
        const context = { provider: endpoint.provider, ...(endpoint.provider === 'serpapi' ? { keyIndex: endpoint.keyIndex } : {}) }
        if (failed.has(endpoint)) continue
        const remaining = (this.blockedUntil.get(endpoint) || 0) - this.now()
        if (remaining > 0) {
          diagnostic?.({ ...context, stage: 'routing', outcome: 'skipped', cooldownSeconds: Math.ceil(remaining / 1000) })
          continue
        }
        attempts++
        diagnostic?.({ ...context, stage: 'routing', outcome: 'attempt', attempt: attempts })
        const report: DiagnosticReporter | undefined = diagnostic ? event => diagnostic({ ...event, ...context }) : undefined
        try {
          let provider = instances.get(endpoint)
          if (!provider) {
            if (endpoint.provider === 'serpapi') this.cursor = endpoint.keyIndex % this.keys.length
            provider = factory(endpoint, report)
            instances.set(endpoint, provider)
          }
          const rows = await provider.search(kind)
          signal.throwIfAborted()
          current = index
          return rows
        } catch (error) {
          signal.throwIfAborted()
          if (!retryable(error)) throw error
          failed.add(endpoint)
          const delay = cooldown(error)
          if (!this.closed) this.blockedUntil.set(endpoint, this.now() + delay)
          diagnostic?.({ ...context, stage: 'routing', outcome: 'retry', error: error instanceof SearchError ? error.code : 'REQUEST_FAILED',
            cooldownSeconds: delay / 1000 })
          lastError = error
        }
      }
      if (lastError) throw lastError
      if (!endpoints.length) throw new SearchError('SEARCH_CONFIG', searchConfigurationError(this.config) || '请先配置搜索接口。')
      const earliest = Math.min(...endpoints.map(endpoint => this.blockedUntil.get(endpoint) || this.now()))
      throw new SearchError('SEARCH_COOLDOWN', `搜索接口暂不可用，请约 ${Math.max(1, Math.ceil((earliest - this.now()) / 1000))} 秒后重试，或更新接口配置。`)
    } }
  }

  clear() {
    this.closed = true
    this.blockedUntil.clear()
  }
}
