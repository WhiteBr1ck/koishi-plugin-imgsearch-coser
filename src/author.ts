import { load } from 'cheerio'
import { authorFromTitle, classifyUrl, cleanText } from './platforms'
import type { SocialResult } from './types'
import type { Network } from './network'

export function extractAuthor(html: string, result: SocialResult): Pick<SocialResult, 'displayName' | 'account'> {
  const $ = load(html)
  const title = $('meta[property="og:title"]').attr('content') || $('title').text()
  const author = authorFromTitle(result.platform, title)
  const conflict = result.account && author.account && result.account.toLowerCase() !== author.account.toLowerCase()
  const output = { displayName: result.displayName || (conflict ? undefined : author.displayName), account: result.account || author.account }
  // Structured author entries are used only if the structured post URL identifies this result.
  $('script[type="application/ld+json"]').each((_, element) => {
    let data: unknown
    try { data = JSON.parse($(element).text()) } catch { return }
    const nodes: unknown[] = Array.isArray(data) ? data : [data]
    for (let index = 0; index < nodes.length && index < 100; index++) {
      const node = nodes[index] as Record<string, unknown> | null
      if (!node || typeof node !== 'object') continue
      if (Array.isArray(node['@graph'])) nodes.push(...node['@graph'])
      const postUrl = typeof node.url === 'string' ? classifyUrl(node.url) : undefined
      if (postUrl?.url !== result.url) continue
      const authors = Array.isArray(node.author) ? node.author : [node.author]
      if (authors.length !== 1 || !authors[0] || typeof authors[0] !== 'object') continue
      const entry = authors[0] as Record<string, unknown>
      const profile = typeof entry.url === 'string' ? classifyUrl(entry.url) : undefined
      if (profile && profile.platform === result.platform && !profile.isPost) {
        if (output.account && profile.account && output.account.toLowerCase() !== profile.account.toLowerCase()) continue
        output.account ||= profile.account
        output.displayName ||= cleanText(entry.name, 100) || undefined
      }
    }
  })
  return output
}

export async function enrichAuthor(result: SocialResult, network: Network): Promise<SocialResult> {
  if (result.account && result.displayName) return result
  try {
    const response = await network.publicGet(result.url, 2 * 1024 * 1024, 8000, url => classifyUrl(url)?.url === result.url)
    if (!response.headers.get('content-type')?.includes('text/html')) return result
    return { ...result, ...extractAuthor(response.data.toString('utf8'), result) }
  } catch {
    // Login, blocked pages, and missing metadata must not discard an otherwise useful post.
    network.signal.throwIfAborted()
    return result
  }
}
