import { SearchError } from '../errors'
import type { Network } from '../network'
import type { Config, MatchKind, SearchResult } from '../types'
import type { DiagnosticReporter, SearchStage } from '../diagnostics'

function noResults(error: unknown): boolean {
  return typeof error === 'string' && /^(?:Google(?: Lens)? (?:has(?:n't| not) returned|did(?:n't| not) return) any results(?: for this query)?|No (?:exact |visual )?(?:matches|results)(?: (?:were )?found)?(?: for this query)?)[.!]?$/i.test(error.trim())
}

function apiError(error: unknown): SearchError {
  const text = typeof error === 'string' ? error : ''
  if (/invalid (?:serpapi )?api[_ -]?key|(?:api[_ -]?key).*(?:invalid|missing)|not authorized|unauthorized/i.test(text)) {
    return new SearchError('SERP_KEY', 'SerpApi API Key 无效或无权访问，请检查插件配置。')
  }
  if (/run out of searches|out of credits|quota|search(?:es)? (?:limit|credits).*(?:exceeded|exhausted|reached)|plan.*limit/i.test(text)) {
    return new SearchError('SERP_QUOTA', 'SerpApi 搜索额度不足，请检查账户额度。')
  }
  if (/rate limit|too many requests|throughput/i.test(text)) {
    return new SearchError('SERP_RATE', 'SerpApi 请求过于频繁，请稍后重试。')
  }
  if (/invalid.*(?:parameter|image[_ -]?id)|(?:parameter|image[_ -]?id).*(?:invalid|required|missing|expired)/i.test(text)) {
    return new SearchError('SERP_PARAMETERS', 'SerpApi 拒绝了搜索参数或图片凭据，请查看调试日志中的搜索 ID。')
  }
  return new SearchError('SERP_ERROR', 'SerpApi 未能完成本次搜索，请查看调试日志中的搜索 ID 和错误分类。')
}

function metadata(data: Record<string, unknown>) {
  const raw = data.search_metadata && typeof data.search_metadata === 'object' ? data.search_metadata as Record<string, unknown> : {}
  return {
    searchId: typeof raw.id === 'string' && /^[a-f0-9]{16,64}$/i.test(raw.id) ? raw.id : undefined,
    status: typeof raw.status === 'string' && ['Success', 'Error', 'Processing'].includes(raw.status)
      ? raw.status as 'Success' | 'Error' | 'Processing' : 'Unknown' as const,
  }
}

export function parseSerpApi(data: unknown, kind: MatchKind): SearchResult[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SearchError('SERP_FORMAT', 'SerpApi 返回格式异常，请稍后重试。')
  const object = data as Record<string, unknown>
  const rows = object[kind === 'exact' ? 'exact_matches' : 'visual_matches']
  if (object.error) {
    if (noResults(object.error) && (rows === undefined || Array.isArray(rows) && rows.length === 0)) return []
    throw apiError(object.error)
  }
  if (metadata(object).status === 'Error') throw apiError(undefined)
  // An otherwise successful search may omit the result array when it is empty.
  if (rows === undefined && (object.search_metadata as { status?: string })?.status === 'Success') return []
  if (!Array.isArray(rows)) throw new SearchError('SERP_FORMAT', 'SerpApi 未返回可识别的搜索结果，请稍后重试。')
  return rows.slice(0, 200).flatMap((row, index) => {
    if (!row || typeof row !== 'object' || typeof row.link !== 'string') return []
    return [{ url: row.link, title: typeof row.title === 'string' ? row.title : undefined,
      snippet: typeof row.snippet === 'string' ? row.snippet : undefined,
      // visual_matches[].exact_matches only indicates an available exact-search link.
      // It does not prove this individual result matches the query image exactly.
      match: kind, position: typeof row.position === 'number' ? row.position : index + 1 }]
  })
}

export class SerpApiProvider {
  private imageId?: string
  constructor(private readonly network: Network, private readonly config: Config, private readonly image: Buffer,
    private readonly diagnostic?: DiagnosticReporter) {}

  private async json(url: string, stage: SearchStage, data?: FormData): Promise<Record<string, unknown>> {
    let response
    try { response = await this.network.request(url, { method: data ? 'POST' : 'GET', data }) }
    catch (error) {
      this.diagnostic?.({ stage, outcome: 'error', error: error instanceof SearchError ? error.code : 'REQUEST_FAILED' })
      throw error
    }
    let parsed: Record<string, unknown> | undefined
    try {
      const value = JSON.parse(response.data.toString('utf8'))
      if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value
    } catch { /* HTTP errors can return a non-JSON body. */ }
    const details = { stage, httpStatus: response.status, ...metadata(parsed || {}) }
    let error: SearchError | undefined
    if (response.status === 401 || response.status === 403) error = new SearchError('SERP_KEY', 'SerpApi API Key 无效或无权访问，请检查插件配置。')
    else if (response.status === 429 || response.status === 402) error = new SearchError('SERP_QUOTA', 'SerpApi 额度已用完或请求过多，请检查额度后重试。')
    else if (response.status >= 300) error = new SearchError('SERP_HTTP', `SerpApi 请求失败（HTTP ${response.status}），请稍后重试。`)
    else if (!parsed) error = new SearchError('SERP_FORMAT', 'SerpApi 返回格式异常，请稍后重试。')
    if (error) {
      this.diagnostic?.({ ...details, outcome: 'error', error: error.code })
      throw error
    }
    this.diagnostic?.(details)
    return parsed!
  }

  async search(kind: MatchKind): Promise<SearchResult[]> {
    if (!this.config.apiKey.trim()) throw new SearchError('SERP_KEY', '请先在插件配置中填写 SerpApi API Key，或选择 Lens 网页接口。')
    if (!this.imageId) {
      const form = new FormData()
      form.append('image', new Blob([new Uint8Array(this.image)], { type: 'image/jpeg' }), 'search.jpg')
      form.append('api_key', this.config.apiKey)
      const upload = await this.json('https://serpapi.com/image', 'upload', form)
      if (upload.error) {
        const error = apiError(upload.error)
        this.diagnostic?.({ stage: 'upload', ...metadata(upload), outcome: 'error', error: error.code })
        throw error
      }
      if (typeof upload.image_id !== 'string' || !upload.image_id) {
        this.diagnostic?.({ stage: 'upload', ...metadata(upload), outcome: 'error', error: 'SERP_UPLOAD' })
        throw new SearchError('SERP_UPLOAD', 'SerpApi 图片上传失败，请稍后重试或查看调试日志。')
      }
      this.imageId = upload.image_id
    }
    const params = new URLSearchParams({ engine: 'google_lens', image_id: this.imageId,
      type: kind === 'exact' ? 'exact_matches' : 'visual_matches', hl: this.config.language, api_key: this.config.apiKey })
    const data = await this.json('https://serpapi.com/search.json?' + params, kind)
    try {
      const rows = parseSerpApi(data, kind)
      this.diagnostic?.({ stage: kind, ...metadata(data), outcome: rows.length ? 'results' : 'empty', count: rows.length })
      return rows
    } catch (error) {
      this.diagnostic?.({ stage: kind, ...metadata(data), outcome: 'error', error: error instanceof SearchError ? error.code : 'SERP_FORMAT' })
      throw error
    }
  }
}
