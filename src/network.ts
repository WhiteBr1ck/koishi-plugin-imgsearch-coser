import type { Context, HTTP } from 'koishi'
import { SearchError } from './errors'
import { isGoogleHost } from './platforms'

export class Network {
  constructor(private readonly ctx: Pick<Context, 'http'>, readonly signal: AbortSignal, readonly timeout: number) {}

  async request(url: string, options: HTTP.RequestConfig = {}, limit = 6 * 1024 * 1024): Promise<HTTP.Response<Buffer>> {
    this.signal.throwIfAborted()
    return this.ctx.http<Buffer>(url, {
      ...options,
      signal: this.signal,
      timeout: Math.min(options.timeout || this.timeout, this.timeout),
      redirect: 'manual',
      validateStatus: () => true,
      responseType: async (raw: Response) => {
        if (!raw.body) return Buffer.alloc(0)
        const reader = raw.body.getReader()
        const chunks: Buffer[] = []
        let size = 0
        try {
          if (Number(raw.headers.get('content-length')) > limit) throw new SearchError('TOO_LARGE', '响应体积超过限制，请换一张较小的图片。')
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > limit) throw new SearchError('TOO_LARGE', '响应体积超过限制，请换一张较小的图片。')
            chunks.push(Buffer.from(value))
          }
          return Buffer.concat(chunks)
        } finally {
          await reader.cancel().catch(() => {})
          reader.releaseLock()
        }
      },
    })
  }

  async publicGet(url: string, limit: number, timeout?: number, allowed?: (url: string) => boolean): Promise<HTTP.Response<Buffer>> {
    for (let i = 0; i < 6; i++) {
      let parsed: URL
      try { parsed = new URL(url) } catch { throw new SearchError('IMAGE_URL', '图片网址无效，请直接发送图片。') }
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || (parsed.port && !['80', '443'].includes(parsed.port)) || await this.ctx.http.isLocal(url)) {
        throw new SearchError('IMAGE_URL', '仅支持公开 HTTP 或 HTTPS 图片地址，请直接发送图片。')
      }
      if (allowed && !allowed(url)) throw new SearchError('REDIRECT', '页面跳转到了其他平台。')
      const response = await this.request(url, { timeout, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*,text/html;q=0.8,*/*;q=0.5' } }, limit)
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        url = new URL(response.headers.get('location')!, url).href
        continue
      }
      if (response.status >= 400) throw new SearchError('DOWNLOAD', '无法读取图片或页面，请检查链接是否有效，或重新发送图片。')
      return response
    }
    throw new SearchError('REDIRECT', '链接跳转次数过多，请直接发送图片。')
  }
}

/** A per-search Google-only cookie jar. Never forward cookies to result sites. */
export class GoogleSession {
  private cookies = new Map<string, string>()
  constructor(private readonly network: Network, private readonly userAgent: string, cookie: string) {
    for (const pair of cookie.split(';')) {
      const index = pair.indexOf('=')
      if (index > 0) this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
    }
  }

  async request(url: string, data?: FormData, resolveOutbound = false): Promise<HTTP.Response<Buffer>> {
    for (let i = 0; i < 6; i++) {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password || !isGoogleHost(parsed.hostname)) {
        throw new SearchError('GOOGLE_REDIRECT', 'Lens 返回了不支持的跳转地址，请切换 SerpApi 接口。')
      }
      const response = await this.network.request(url, {
        method: data ? 'POST' : 'GET', data,
        headers: { 'User-Agent': this.userAgent, Accept: 'text/html',
          Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ') },
      })
      for (const raw of response.headers.getSetCookie?.() || []) {
        const pair = raw.split(';')[0]
        const index = pair.indexOf('=')
        if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1))
      }
      const location = response.headers.get('location')
      if (response.status >= 300 && response.status < 400 && location) {
        const next = new URL(location, url)
        if (resolveOutbound && !isGoogleHost(next.hostname)) return { ...response, url: next.href }
        if (response.status === 307 || response.status === 308) {
          // Keep upload body only on Google's own redirect path.
        } else { data = undefined }
        url = next.href
        continue
      }
      if (response.status === 429 || response.status === 403) throw new SearchError('GOOGLE_BLOCKED', 'Google 暂时限制了网页请求，请稍后重试或切换 SerpApi 接口。')
      if (response.status >= 400) throw new SearchError('GOOGLE_HTTP', `Lens 网页请求失败（HTTP ${response.status}），请稍后重试或切换 SerpApi 接口。`)
      return response
    }
    throw new SearchError('GOOGLE_REDIRECT', 'Lens 跳转次数过多，请切换 SerpApi 接口。')
  }
}
