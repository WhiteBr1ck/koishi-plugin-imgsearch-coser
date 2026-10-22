import { load } from 'cheerio'
import { SearchError } from '../errors'
import { GoogleSession, type Network } from '../network'
import { cleanText, isGoogleHost, unwrapGoogleUrl } from '../platforms'
import type { Config, ImageInput, MatchKind, SearchResult } from '../types'

export interface LensPage {
  results: SearchResult[]
  exactUrl?: string
  visualUrl?: string
  recognized: boolean
}

function googleSearchLink(value: string, base: string): URL | undefined {
  try {
    const url = new URL(value, base)
    if (url.protocol === 'https:' && !url.port && isGoogleHost(url.hostname) && ['/search', '/v3/results'].includes(url.pathname)) return url
  } catch { /* not a search navigation link */ }
}

/** Extract a JSON array value without evaluating any JavaScript from the page. */
function callbackData(script: string): unknown {
  const start = /\bdata\s*:\s*\[/.exec(script)
  if (!start) return
  const offset = start.index + start[0].lastIndexOf('[')
  let depth = 0, quoted = false, escape = false
  for (let i = offset; i < script.length; i++) {
    const char = script[i]
    if (quoted) {
      if (escape) escape = false
      else if (char === '\\') escape = true
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if (char === '[') depth++
    else if (char === ']' && --depth === 0) {
      try { return JSON.parse(script.slice(offset, i + 1)) } catch { return }
    }
  }
}

export function parseLensPage(html: string, pageUrl: string, kind: MatchKind): LensPage {
  const $ = load(html)
  const visible = $.root().clone()
  visible.find('script, style, noscript').remove()
  const text = cleanText(visible.text(), 200000)
  const host = new URL(pageUrl).hostname
  if (host === 'consent.google.com' || $('form[action*="consent.google"]').length) {
    throw new SearchError('GOOGLE_CONSENT', '请更新 Google Cookie 后重试。')
  }
  if (/\/sorry\//.test(pageUrl) || $('form[action*="sorry"], #captcha, .g-recaptcha').length || /unusual traffic from your computer network|our systems have detected unusual traffic/i.test(text)) {
    throw new SearchError('GOOGLE_CAPTCHA', 'Google 要求验证当前网络请求，请稍后重试或切换 SerpApi 接口。')
  }
  const jsGate = html.includes('/httpservice/retry/enablejs') || html.includes('SG_SS=')
  if (jsGate && !$('#search, #rso').length && !$('h3').length) {
    throw new SearchError('GOOGLE_JS', 'Google 要求 JavaScript 验证，请更新 Cookie 后重试。')
  }

  const results: SearchResult[] = []
  const seen = new Map<string, { result: SearchResult; quality: number }>()
  let exactUrl: string | undefined, visualUrl: string | undefined
  let recognized = /No matches for your search|No matching images|No results found|找不到相符|没有找到.*结果|未找到.*结果/i.test(text)
  const append = (url: string, title: string, snippet?: string, filterText?: string, quality = 3) => {
    const original = cleanText([filterText, title, snippet].filter(Boolean).join('\n'), 10000)
    const previous = seen.get(url)
    if (previous) {
      previous.result.filterText = [previous.result.filterText, original].filter(Boolean).join('\n')
      if (quality > previous.quality) {
        previous.result.title = cleanText(title, 10000) || undefined
        previous.quality = quality
      }
      previous.result.snippet ||= snippet
      return
    }
    // Normalize and trim the title after metadata cleanup, not before it.
    const result: SearchResult = { url, title: cleanText(title, 10000) || undefined, snippet, filterText: original, match: kind, position: results.length + 1 }
    results.push(result)
    seen.set(url, { result, quality })
  }

  $('a[href]').each((_, element) => {
    const a = $(element)
    const href = a.attr('href')!
    const nav = googleSearchLink(href, pageUrl)
    if (nav?.searchParams.get('udm') === '48') exactUrl ||= nav.href
    if (['26', '44'].includes(nav?.searchParams.get('udm') || '')) visualUrl ||= nav!.href
    const url = unwrapGoogleUrl(href, pageUrl)
    if (!url || a.closest('header, footer, nav, [role="navigation"]').length) return
    const isWrapper = isGoogleHost(url.hostname) && url.pathname === '/goto' && !!url.searchParams.get('url')
    if (isGoogleHost(url.hostname) && !isWrapper) return
    if (/(^|\.)(?:gstatic\.com|googleusercontent\.com|google\.com)$/.test(url.hostname) && !isWrapper) return
    // Require a result card feature; do not mine arbitrary URLs from scripts or footers.
    const heading = a.find('h1,h2,h3,[role="heading"]').first().text()
    const label = a.attr('aria-label') || ''
    const textOnly = a.clone()
    textOnly.find('img,svg,script,style').remove()
    // Preserve boundaries between separate card fields in the last-resort fallback.
    textOnly.find('div,time,br').append(' ')
    const title = heading || label || (a.find('img').length ? textOnly.text() : '')
    if (!title && !a.find('img').length) return
    if (a.closest('#top_nav, #foot, #fbar').length) return
    recognized = true
    const snippet = a.parent().find('[data-crb-snippet-text]').first().text()
    append(url.href, title.replace(/\.?\s*Opens in new tab\.?$/i, ''), cleanText(snippet, 500) || undefined, cleanText(a.text(), 10000), heading ? 3 : label ? 2 : 1)
  })

  // Older Lens responses embed visual cards as arrays in AF_initDataCallback.
  $('script').each((_, element) => {
    const script = $(element).text()
    if (!script.includes('AF_initDataCallback')) return
    const data = callbackData(script)
    if (!Array.isArray(data)) return
    const stack: unknown[] = [data]
    let visited = 0
    while (stack.length && visited++ < 50000) {
      const row = stack.pop()
      if (!Array.isArray(row)) continue
      if (Array.isArray(row[0]) && typeof row[3] === 'string' && typeof row[5] === 'string' && /^https?:\/\//.test(row[5])) {
        // A legacy visual card must never be promoted to exact merely because exact was requested.
        if (kind === 'visual') { recognized = true; append(row[5], row[3]) }
      }
      for (let i = row.length - 1; i >= 0; i--) if (Array.isArray(row[i])) stack.push(row[i])
    }
  })
  if (!recognized && jsGate) throw new SearchError('GOOGLE_JS', 'Google 要求 JavaScript 验证，请更新 Cookie 后重试。')
  return { results: results.slice(0, 200), exactUrl, visualUrl, recognized }
}

export class DirectProvider {
  private google: GoogleSession
  private initial?: { html: string; url: string; page: LensPage }
  constructor(private readonly network: Network, private readonly config: Config, private readonly input: ImageInput, private readonly image: Buffer) {
    this.google = new GoogleSession(network, config.userAgent, config.googleCookie)
  }

  private async initialize(): Promise<NonNullable<DirectProvider['initial']>> {
    if (this.initial) return this.initial
    let url: string, form: FormData | undefined
    if (this.config.directUploadMode === 'url' && this.input.sourceUrl) {
      url = 'https://lens.google.com/uploadbyurl?' + new URLSearchParams({ url: this.input.sourceUrl, hl: this.config.language })
    } else {
      url = 'https://lens.google.com/v3/upload?' + new URLSearchParams({ hl: this.config.language })
      form = new FormData()
      form.append('encoded_image', new Blob([new Uint8Array(this.image)], { type: 'image/jpeg' }), 'search.jpg')
      form.append('image_content', '')
    }
    const response = await this.google.request(url, form)
    const html = response.data.toString('utf8')
    this.initial = { html, url: response.url, page: parseLensPage(html, response.url, 'visual') }
    return this.initial
  }

  async search(kind: MatchKind): Promise<SearchResult[]> {
    const initial = await this.initialize()
    let { html, url, page } = initial
    if (kind === 'exact') {
      // Follow the session-bound exact tab generated by Google, never invent its tokens.
      if (new URL(url).searchParams.get('udm') !== '48') {
        if (!page.exactUrl) throw new SearchError('EXACT_UNAVAILABLE', 'Lens 未提供精确匹配入口。可改用视觉相似模式或 SerpApi。')
        const response = await this.google.request(page.exactUrl)
        html = response.data.toString('utf8'); url = response.url
        if (new URL(url).searchParams.get('udm') !== '48') {
          parseLensPage(html, url, 'visual') // Surface challenge pages before generic tab errors.
          throw new SearchError('EXACT_UNAVAILABLE', 'Lens 未能打开精确匹配页面。可改用视觉相似模式或 SerpApi。')
        }
      }
      page = parseLensPage(html, url, 'exact')
    } else if (new URL(url).searchParams.get('udm') === '48') {
      if (!page.visualUrl) throw new SearchError('LENS_FORMAT', 'Lens 未提供视觉匹配入口，请切换 SerpApi 接口。')
      const response = await this.google.request(page.visualUrl)
      page = parseLensPage(response.data.toString('utf8'), response.url, 'visual')
    }
    if (!page.recognized) throw new SearchError('LENS_FORMAT', 'Lens 页面结构无法解析，请切换 SerpApi 接口，或更新插件后重试。')
    const resolved: SearchResult[] = []
    let wrapperCount = 0
    for (const result of page.results) {
      const parsed = new URL(result.url)
      if (isGoogleHost(parsed.hostname) && parsed.pathname === '/goto') {
        if (wrapperCount++ >= 20) continue
        const response = await this.google.request(result.url, undefined, true)
        if (!isGoogleHost(new URL(response.url).hostname)) resolved.push({ ...result, url: response.url })
      } else { resolved.push(result) }
    }
    return resolved
  }
}
