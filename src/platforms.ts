import type { Config, PlatformId, PlatformRule, SearchResult, SocialResult } from './types'
import { isBlocked } from './filter'
import { cleanSearchTitle, stripLensMetadata } from './title'

export const PLATFORM_LABELS: Record<PlatformId, string> = {
  x: 'X / Twitter', instagram: 'Instagram', weibo: '微博', threads: 'Threads',
  bluesky: 'Bluesky', facebook: 'Facebook', tiktok: 'TikTok', douyin: '抖音',
  bilibili: 'Bilibili', pinterest: 'Pinterest',
}

export const DEFAULT_RULES: PlatformRule[] = (Object.keys(PLATFORM_LABELS) as PlatformId[]).map(platform => ({
  platform, enabled: ['x', 'instagram', 'weibo'].includes(platform), limit: 1, content: 'all',
}))

export function cleanText(value: unknown, max = 220): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

export function isGoogleHost(host: string): boolean {
  return ['google.com', 'www.google.com', 'lens.google.com', 'consent.google.com'].includes(host.toLowerCase())
}

export function unwrapGoogleUrl(value: string, base = 'https://www.google.com'): URL | undefined {
  try {
    let url = new URL(value, base)
    for (let n = 0; n < 3; n++) {
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return
      if (!isGoogleHost(url.hostname) || !['/url', '/imgres', '/goto'].includes(url.pathname)) return url
      const target = url.searchParams.get('imgrefurl') || url.searchParams.get('q') || url.searchParams.get('url')
      if (!target || !/^https?:\/\//i.test(target)) return url
      url = new URL(target)
    }
  } catch { /* malformed result URL */ }
}

const hosts: Record<PlatformId, string[]> = {
  x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com', 'mobile.x.com'],
  instagram: ['instagram.com', 'www.instagram.com', 'm.instagram.com'],
  weibo: ['weibo.com', 'www.weibo.com', 'm.weibo.cn', 'weibo.cn', 'www.weibo.cn'],
  threads: ['threads.net', 'www.threads.net', 'threads.com', 'www.threads.com'],
  bluesky: ['bsky.app'],
  facebook: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com'],
  douyin: ['douyin.com', 'www.douyin.com'],
  bilibili: ['bilibili.com', 'www.bilibili.com', 'm.bilibili.com', 't.bilibili.com', 'space.bilibili.com'],
  pinterest: ['pinterest.com', 'www.pinterest.com', 'www.pinterest.jp', 'www.pinterest.co.uk'],
}

/** Recognize concrete posts/profiles, never platform search/login/tag pages. */
export function classifyUrl(value: string): { url: string; platform: PlatformId; account?: string; isPost: boolean } | undefined {
  const url = unwrapGoogleUrl(value)
  if (!url || url.port) return
  const platform = (Object.keys(hosts) as PlatformId[]).find(key => hosts[key].includes(url.hostname.toLowerCase()))
  if (!platform) return
  const p = url.pathname.replace(/\/+$/, '') || '/'
  let account: string | undefined
  let isPost = false
  let accepted = false
  let m: RegExpMatchArray | null
  const keepQuery: string[] = []
  switch (platform) {
    case 'x':
      url.hostname = 'x.com'
      if ((m = p.match(/^\/([A-Za-z0-9_]{1,15})(?:\/status\/(\d+)(?:\/(?:photo|video)\/\d+)?)?$/)) && !/^(home|search|explore|settings|messages|notifications|login|signup|intent|i|compose)$/i.test(m[1])) {
        account = '@' + m[1]; isPost = !!m[2]; accepted = true
        url.pathname = '/' + m[1].toLowerCase() + (m[2] ? '/status/' + m[2] : '')
      } else if (/^\/i\/status\/\d+$/.test(p)) { accepted = isPost = true }
      break
    case 'instagram':
      url.hostname = 'www.instagram.com'
      if (/^\/(p|reel|tv)\/[\w-]+$/.test(p)) { accepted = isPost = true }
      else if ((m = p.match(/^\/([\w.]{1,30})$/)) && !/^(accounts|explore|direct|about|legal|reels|stories|developer|p|reel|tv)$/i.test(m[1])) { account = '@' + m[1]; accepted = true }
      break
    case 'weibo':
      if ((m = p.match(/^\/(?:u\/)?(\d+)(?:\/([A-Za-z0-9]+))?$/))) { account = m[1]; isPost = !!m[2]; accepted = true }
      else if (/^\/(?:detail|status|comment)\/[A-Za-z0-9]+$/.test(p)) { accepted = isPost = true }
      break
    case 'threads':
      url.hostname = 'www.threads.com'
      if ((m = p.match(/^\/@([\w.]+)(?:\/post\/([\w-]+))?$/))) { account = '@' + m[1]; isPost = !!m[2]; accepted = true }
      break
    case 'bluesky':
      if ((m = p.match(/^\/profile\/([^/]+)(?:\/post\/([\w]+))?$/))) { account = m[1].startsWith('did:') ? m[1] : '@' + m[1]; isPost = !!m[2]; accepted = true }
      break
    case 'facebook':
      url.hostname = 'www.facebook.com'
      if (['/story.php', '/permalink.php', '/photo.php', '/watch'].includes(p)) {
        keepQuery.push('story_fbid', 'id', 'fbid', 'v', 'set')
        isPost = accepted = !!(url.searchParams.get('story_fbid') || url.searchParams.get('fbid') || url.searchParams.get('v'))
        // id on photo.php can be an album/page context, not proven authorship.
        if (['/story.php', '/permalink.php'].includes(p)) account = url.searchParams.get('id') || undefined
      } else if (p === '/profile.php' && /^\d+$/.test(url.searchParams.get('id') || '')) {
        keepQuery.push('id'); account = url.searchParams.get('id')!; accepted = true
      } else if ((m = p.match(/^\/([\w.]+)(?:\/(posts|photos|videos)\/.+)?$/)) && !/^(groups|share|reel|watch|login|help|search|marketplace|gaming|photo|pages|events)$/i.test(m[1])) {
        account = m[1]; isPost = !!m[2]; accepted = true
      } else if (/^\/reel\/\d+$/.test(p) || /^\/groups\/[^/]+\/(posts|permalink)\/\d+$/.test(p)) { accepted = isPost = true }
      break
    case 'tiktok':
      url.hostname = 'www.tiktok.com'
      if ((m = p.match(/^\/@([\w.]+)(?:\/(video|photo)\/(\d+))?$/))) { account = '@' + m[1]; isPost = !!m[3]; accepted = true }
      break
    case 'douyin':
      if (/^\/(video|note)\/\d+$/.test(p)) { accepted = isPost = true }
      else if ((m = p.match(/^\/user\/([\w-]+)$/))) { account = m[1]; accepted = true }
      break
    case 'bilibili':
      if ((url.hostname === 't.bilibili.com' && /^\/\d+$/.test(p)) || /^\/(?:video\/(?:BV[\w]+|av\d+)|opus\/\d+)$/.test(p)) { accepted = isPost = true }
      else if (url.hostname === 'space.bilibili.com' && (m = p.match(/^\/(\d+)$/))) { account = m[1]; accepted = true }
      break
    case 'pinterest':
      if (/^\/pin\/\d+$/.test(p)) { accepted = isPost = true }
      else if ((m = p.match(/^\/([\w]+)$/)) && !/^(search|ideas|login|business|settings|today|pin)$/i.test(m[1])) { account = '@' + m[1]; accepted = true }
  }
  if (!accepted) return
  url.protocol = 'https:'
  url.hash = ''
  if (platform !== 'x') url.pathname = p
  for (const key of [...url.searchParams.keys()]) if (!keepQuery.includes(key)) url.searchParams.delete(key)
  return { url: url.href, platform, account, isPost }
}

/** Only explicit author-shaped title patterns. A random @mention is not an author. */
export function authorFromTitle(platform: PlatformId, rawTitle: string): { displayName?: string; account?: string } {
  const title = cleanText(rawTitle, 500)
  let m: RegExpMatchArray | null
  if (platform === 'x') {
    if ((m = title.match(/^(.{1,100}?)\s*\(@([A-Za-z0-9_]{1,15})\)\s*(?:\/\s*(?:X|Twitter)|on\s+(?:X|Twitter))/i))) return { displayName: m[1].trim(), account: '@' + m[2] }
    if ((m = title.match(/^(.{1,100}?)\s+on\s+(?:X|Twitter)\s*:/i))) return { displayName: m[1].trim() }
  }
  if (platform === 'instagram' || platform === 'threads') {
    if ((m = title.match(/^(.{1,100}?)\s*\(@([\w.]+)\)\s*(?:[•|·]|on\s+(?:Instagram|Threads))/i))) return { displayName: m[1].trim(), account: '@' + m[2] }
    if ((m = title.match(/^(.{1,100}?)\s+on\s+(?:Instagram|Threads)\s*:/i))) return { displayName: m[1].trim() }
  }
  if (platform === 'weibo' && (m = title.match(/^(.{1,100}?)的微博(?:[_\s]|$)/))) return { displayName: m[1].trim() }
  return {}
}

export function normalizeResult(result: SearchResult): SocialResult | undefined {
  const classified = classifyUrl(result.url)
  if (!classified) return
  const rawTitle = typeof result.title === 'string' ? result.title : ''
  const title = cleanText(cleanSearchTitle(rawTitle, classified.platform))
  const author = authorFromTitle(classified.platform, stripLensMetadata(rawTitle, classified.platform))
  const conflict = classified.account && author.account && classified.account.toLowerCase() !== author.account.toLowerCase()
  return { ...result, ...classified, title: title || undefined, displayName: conflict ? undefined : author.displayName,
    filterText: [result.filterText, result.title, result.snippet].filter(Boolean).join('\n'),
    account: classified.account || author.account }
}

export function platformLimit(rule: PlatformRule): number {
  return Number.isFinite(rule.limit) ? Math.max(1, Math.min(10, Math.trunc(rule.limit))) : 1
}

export function platformTargetCount(platforms: PlatformRule[]): number {
  const unique = new Map<PlatformId, PlatformRule>()
  for (const rule of platforms) if (!unique.has(rule.platform)) unique.set(rule.platform, rule)
  return [...unique.values()].reduce((count, rule) => count + (rule.enabled ? platformLimit(rule) : 0), 0)
}

export function selectResults(results: SocialResult[], config: Pick<Config, 'platforms' | 'sortMode' | 'dedupeAccounts'> & Partial<Pick<Config, 'blockedWords'>>): SocialResult[] {
  const rules = new Map<PlatformId, { rule: PlatformRule; index: number }>()
  config.platforms.forEach((rule, index) => { if (!rules.has(rule.platform)) rules.set(rule.platform, { rule, index }) })
  const keyFor = (item: SocialResult) => item.platform === 'x' && /\/status\/(\d+)/.test(item.url) ? 'x:' + item.url.match(/\/status\/(\d+)/)![1] : item.url
  const blockedUrls = new Set(results.filter(result => isBlocked(result, config.blockedWords)).map(keyFor))
  const candidates = results.filter(result => {
    const rule = rules.get(result.platform)?.rule
    return rule?.enabled && (rule.content === 'all' || result.isPost) && !blockedUrls.has(keyFor(result))
  }).sort((a, b) => {
    const match = Number(a.match !== 'exact') - Number(b.match !== 'exact')
    const platform = rules.get(a.platform)!.index - rules.get(b.platform)!.index
    return (config.sortMode === 'platform' ? platform || match : match || platform) || a.position - b.position
  })
  const seenUrls = new Map<string, SocialResult>()
  const seenAccounts = new Set<string>()
  const counts = new Map<PlatformId, number>()
  const selected: SocialResult[] = []
  for (const item of candidates) {
    const urlKey = keyFor(item)
    const duplicate = seenUrls.get(urlKey)
    if (duplicate) {
      duplicate.displayName ||= item.displayName
      duplicate.account ||= item.account
      duplicate.title ||= item.title
      continue
    }
    seenUrls.set(urlKey, { ...item })
  }
  // Merge identical URLs before applying account limits so late author information
  // cannot let another post from the same account slip through.
  for (const item of seenUrls.values()) {
    if (isBlocked(item, config.blockedWords)) continue
    const accountKey = item.account ? item.platform + ':' + item.account.toLowerCase() : undefined
    if (config.dedupeAccounts && accountKey && seenAccounts.has(accountKey)) continue
    if ((counts.get(item.platform) || 0) >= platformLimit(rules.get(item.platform)!.rule)) continue
    if (accountKey) seenAccounts.add(accountKey)
    counts.set(item.platform, (counts.get(item.platform) || 0) + 1)
    selected.push(item)
  }
  return selected
}
