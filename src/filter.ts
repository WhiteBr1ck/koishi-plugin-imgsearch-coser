import type { SocialResult } from './types'

export const DEFAULT_BLOCKED_WORDS = ['64', '六四', '六肆', '天安门', '天安門', 'tiananmen', '习近平', '習近平', 'jinping']

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, '')
}

export function isBlocked(result: SocialResult, words: readonly string[] = DEFAULT_BLOCKED_WORDS): boolean {
  let path = ''
  try { path = decodeURIComponent(new URL(result.url).pathname) } catch { /* metadata still checked */ }
  // Exclude numeric post IDs and tracking parameters to avoid incidental matches.
  const fields = [result.title, result.snippet, result.filterText, result.displayName, result.account,
    ...path.split('/').filter(part => part && !/^\d+$/.test(part))].filter((value): value is string => !!value).map(normalize)
  return words.some(word => {
    const term = normalize(word.trim())
    if (!term) return false
    if (/^\d+$/.test(term)) {
      const pattern = new RegExp(`(?:^|[^0-9])${term}(?![0-9])`)
      return fields.some(value => pattern.test(value))
    }
    return fields.some(value => value.includes(term))
  })
}
