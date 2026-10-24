export type Provider = 'serpapi' | 'direct'
export type MatchKind = 'exact' | 'visual'
export type Strategy = 'auto' | 'exact' | 'visual'
export type PlatformId = 'x' | 'instagram' | 'weibo' | 'threads' | 'bluesky' | 'facebook' | 'tiktok' | 'douyin' | 'bilibili' | 'pinterest'

export interface PlatformRule {
  platform: PlatformId
  enabled: boolean
  limit: number
  content: 'all' | 'posts'
}

export interface SearchResult {
  url: string
  title?: string
  snippet?: string
  filterText?: string
  match: MatchKind
  position: number
}

export interface SocialResult extends SearchResult {
  platform: PlatformId
  account?: string
  displayName?: string
  isPost: boolean
}

export interface ImageInput {
  data: Buffer
  sourceUrl?: string
}

export interface Config {
  provider: Provider
  apiKey: string
  apiKeys: string[]
  autoFallback: boolean
  strategy: Strategy
  language: string
  directUploadMode: 'file' | 'url'
  googleCookie: string
  userAgent: string
  platforms: PlatformRule[]
  blockedWords: string[]
  sortMode: 'match' | 'platform'
  dedupeAccounts: boolean
  fetchAuthor: boolean
  showTitle: boolean
  showProgress: boolean
  resultTemplate: string
  command: string
  aliases: string[]
  promptTimeout: number
  requestTimeout: number
  totalTimeout: number
  maxImageMB: number
  maxConcurrent: number
  cooldown: number
  cacheMinutes: number
  cacheEntries: number
  logDetails: boolean
}
