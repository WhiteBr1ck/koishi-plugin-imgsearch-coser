import { SearchError } from '../errors'
import type { Network } from '../network'
import type { Config, MatchKind, SearchResult } from '../types'

export function parseSerpApi(data: unknown, kind: MatchKind): SearchResult[] {
  if (!data || typeof data !== 'object') throw new SearchError('SERP_FORMAT', 'SerpApi 返回格式异常，请稍后重试。')
  const object = data as Record<string, unknown>
  if (object.error) throw new SearchError('SERP_ERROR', 'SerpApi 未能完成搜索，请检查 API Key、剩余额度和服务状态。')
  const rows = object[kind === 'exact' ? 'exact_matches' : 'visual_matches']
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
  constructor(private readonly network: Network, private readonly config: Config, private readonly image: Buffer) {}

  private async json(url: string, data?: FormData): Promise<Record<string, unknown>> {
    const response = await this.network.request(url, { method: data ? 'POST' : 'GET', data })
    if (response.status === 401 || response.status === 403) throw new SearchError('SERP_KEY', 'SerpApi API Key 无效或无权访问，请检查插件配置。')
    if (response.status === 429 || response.status === 402) throw new SearchError('SERP_QUOTA', 'SerpApi 额度已用完或请求过多，请检查额度后重试。')
    if (response.status >= 300) throw new SearchError('SERP_HTTP', `SerpApi 请求失败（HTTP ${response.status}），请稍后重试。`)
    try { return JSON.parse(response.data.toString('utf8')) } catch { throw new SearchError('SERP_FORMAT', 'SerpApi 返回格式异常，请稍后重试。') }
  }

  async search(kind: MatchKind): Promise<SearchResult[]> {
    if (!this.config.apiKey.trim()) throw new SearchError('SERP_KEY', '请先在插件配置中填写 SerpApi API Key，或选择 Lens 网页接口。')
    if (!this.imageId) {
      const form = new FormData()
      form.append('image', new Blob([new Uint8Array(this.image)], { type: 'image/jpeg' }), 'search.jpg')
      form.append('api_key', this.config.apiKey)
      const upload = await this.json('https://serpapi.com/image', form)
      if (typeof upload.image_id !== 'string' || !upload.image_id) throw new SearchError('SERP_UPLOAD', 'SerpApi 图片上传失败，请检查 API Key 后重试。')
      this.imageId = upload.image_id
    }
    const params = new URLSearchParams({ engine: 'google_lens', image_id: this.imageId,
      type: kind === 'exact' ? 'exact_matches' : 'visual_matches', hl: this.config.language, api_key: this.config.apiKey })
    return parseSerpApi(await this.json('https://serpapi.com/search.json?' + params), kind)
  }
}
