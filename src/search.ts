import { enrichAuthor } from './author'
import { SearchError, userError } from './errors'
import { uploadImage } from './image'
import type { Network } from './network'
import { normalizeResult, platformTargetCount, selectResults } from './platforms'
import { DirectProvider } from './providers/direct'
import { SerpApiProvider } from './providers/serpapi'
import type { Config, ImageInput, MatchKind, SearchResult, SocialResult } from './types'
import type { DiagnosticReporter } from './diagnostics'
import type { GoogleCookieStore } from './google-cookies'
import { SearchRouting } from './routing'

export interface SearchProvider { search(kind: MatchKind): Promise<SearchResult[]> }
export interface FinalResults { results: SocialResult[]; warnings: string[] }

function normalize(results: SearchResult[]): SocialResult[] {
  return results.map(normalizeResult).filter((value): value is SocialResult => !!value)
}

export async function gatherResults(provider: SearchProvider, config: Config, diagnostic?: DiagnosticReporter): Promise<FinalResults> {
  let rows: SearchResult[] = []
  const warnings: string[] = []
  if (config.strategy !== 'visual') {
    try { rows = await provider.search('exact') }
    catch (error) {
      if (config.strategy !== 'auto' || !(error instanceof SearchError) || error.code !== 'EXACT_UNAVAILABLE') throw error
      warnings.push('精确匹配入口不可用，本次仅展示视觉相似结果。')
    }
  }
  const targetCount = platformTargetCount(config.platforms)
  if (config.strategy === 'visual' || (config.strategy === 'auto' && selectResults(normalize(rows), config).length < targetCount)) {
    try { rows.push(...await provider.search('visual')) }
    catch (error) {
      if (!selectResults(normalize(rows), config).length) throw error
      warnings.push('视觉相似结果未能补全。' + userError(error))
    }
  }
  const results = normalize(rows)
  diagnostic?.({ stage: 'filter', rawCount: rows.length, platformCount: results.length, selectedCount: selectResults(results, config).length })
  return { results, warnings }
}

export async function searchImage(input: ImageInput, network: Network, config: Config,
  options: { googleCookies?: GoogleCookieStore; diagnostic?: DiagnosticReporter; routing?: SearchRouting } = {}): Promise<FinalResults> {
  const image = await uploadImage(input)
  network.signal.throwIfAborted()
  const routing = options.routing || new SearchRouting(config)
  const provider = routing.create((endpoint, diagnostic) => endpoint.provider === 'serpapi'
    ? new SerpApiProvider(network, { ...config, apiKey: endpoint.apiKey }, image, diagnostic)
    : new DirectProvider(network, config, input, image, options.googleCookies, diagnostic), network.signal, options.diagnostic)
  const output = await gatherResults(provider, config, options.diagnostic)
  if (config.fetchAuthor) {
    // Visit only selected results. Refill after enrichment merges same-author posts.
    const attempted = new Set<string>()
    for (let count = 0; count < Math.min(platformTargetCount(config.platforms) * 2, 20); count++) {
      const next = selectResults(output.results, config).find(result => !attempted.has(result.url))
      if (!next) break
      attempted.add(next.url)
      const enriched = await enrichAuthor(next, network)
      output.results = output.results.map(result => result.url === next.url ? { ...result, account: enriched.account, displayName: enriched.displayName } : result)
    }
  }
  network.signal.throwIfAborted()
  return { ...output, results: selectResults(output.results, config) }
}
