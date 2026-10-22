import type { PlatformId } from './types'

const sites: Record<PlatformId, string> = {
  x: '(?:X|Twitter)', instagram: 'Instagram', weibo: '(?:微博|Weibo)',
  threads: 'Threads', bluesky: 'Bluesky', facebook: 'Facebook', tiktok: 'TikTok',
  douyin: '(?:抖音|Douyin)', bilibili: '(?:Bilibili|哔哩哔哩)', pinterest: 'Pinterest',
}
const dimension = '(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,5})'
const date = '(?:[0-9]{4}年[0-9]{1,2}月[0-9]{1,2}日|[0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.? [0-9]{1,2},? [0-9]{4})'

/** Strip only an anchored Lens metadata signature, never arbitrary numbers in prose. */
export function stripLensMetadata(raw: string, platform: PlatformId): string {
  let title = raw.replace(/\s+/g, ' ').trim()
  const tail = new RegExp(`\\s+(?:${date}\\s*[·•|]\\s*)?${dimension}\\s*[x×ｘ]\\s*${dimension}\\s+${sites[platform]}\\s*$`, 'i')
  const stripped = title.replace(tail, '').trim()
  if (stripped !== title) {
    title = stripped.replace(new RegExp(`\\s+${date}\\s*[·•|]?\\s*$`, 'i'), '').trim()
    // Ellipsis plus a repeated source label is a card fragment, not part of the caption.
    title = title.replace(new RegExp(`((?:\\.\\.\\.|…))\\s+${sites[platform]}$`, 'i'), '$1')
  }
  return title
}

export function cleanSearchTitle(raw: string, platform: PlatformId): string {
  let title = stripLensMetadata(raw, platform)
  // Standard webpage title suffix, with an explicit separator.
  title = title.replace(new RegExp(`\\s+[-/|]\\s*${sites[platform]}$`, 'i'), '').trim()
  if (platform === 'x' || platform === 'instagram' || platform === 'threads') {
    // Some Lens titles omit whitespace between a CJK author name and "on".
    const wrapper = new RegExp(`^.{1,100}?(?:\\s+|(?<=[^\\x00-\\x7f]))on\\s+${sites[platform]}\\s*[:：]\\s*([\\s\\S]+)$`, 'i')
    const match = wrapper.exec(title)
    if (match) {
      title = match[1].trim()
      if ((title.startsWith('"') && title.endsWith('"')) || (title.startsWith('“') && title.endsWith('”'))) title = title.slice(1, -1).trim()
    } else {
      title = title.replace(new RegExp(`(?:\\s+|(?<=[^\\x00-\\x7f]))on\\s+${sites[platform]}$`, 'i'), '').trim()
    }
  }
  return title
}
