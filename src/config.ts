import { Schema } from 'koishi'
import { DEFAULT_RULES, PLATFORM_LABELS } from './platforms'
import { DEFAULT_BLOCKED_WORDS } from './filter'
import { DEFAULT_RESULT_TEMPLATE } from './template'
import type { Config } from './types'

// Keep stored keys stable and use the standard key + description layout.
const field = (schema: Schema, label: string, role?: string) => schema.description(label).role(role || 'imgsearch-field', { role, imgsearchField: true })

export const ConfigSchema: Schema<Config> = Schema.intersect([
  Schema.object({
    provider: field(Schema.union([
      Schema.const('serpapi').description('SerpApi'),
      Schema.const('direct').description('Google Lens 网页'),
    ]).default('serpapi'), '首选搜索引擎'),
    autoFallback: field(Schema.boolean().default(true).comment('所选接口失败时，使用已配置的另一接口重试。'), '自动切换接口'),
    language: field(Schema.union([
      Schema.const('zh-CN').description('简体中文'),
      Schema.const('zh-TW').description('繁體中文'),
      Schema.const('en').description('English'),
      Schema.const('ja').description('日本語'),
      Schema.const('ko').description('한국어'),
      Schema.const('de').description('Deutsch'),
      Schema.const('fr').description('Français'),
      Schema.const('es').description('Español'),
      Schema.const('ru').description('Русский'),
    ]).default('zh-CN'), '搜索语言'),
  }).description('搜索引擎设置'),
  Schema.object({
    apiKey: field(Schema.string().default('').comment('使用前请填写 API Key。登录 serpapi.com，在 https://serpapi.com/manage-api-key 复制 Key 后粘贴到此处。'), 'API Key', 'secret'),
    apiKeys: Schema.array(Schema.string().role('secret')).max(20).default([]).description('更多 API Key').comment('与 apiKey 一起轮换，额度不足或出错时尝试下一个。'),
  }).description('SerpApi 接口设置'),
  Schema.object({
    googleCookie: field(Schema.string().default('').comment('默认上传图片，使用前请填写 Cookie。在 Google Lens 按 F12 打开 Network，上传图片完成搜索，选择 Google 搜索结果页面请求，在 Headers → Request Headers 中复制 Cookie 完整值，不含 Cookie: 前缀。过期后重新获取，详细步骤见 README。'), 'Cookie', 'secret'),
  }).description('Google Lens 网页接口设置'),
  Schema.object({
    platforms: Schema.array(Schema.object({
      platform: Schema.union(Object.entries(PLATFORM_LABELS).map(([id, label]) => Schema.const(id).description(label))).required(),
      enabled: Schema.boolean().default(true),
      limit: Schema.number().min(1).max(10).step(1).default(1).description('返回数量'),
      content: Schema.union([
        Schema.const('all').description('帖子及主页'),
        Schema.const('posts').description('仅帖子'),
      ]).default('all'),
    })).role('imgsearch-platforms').default(DEFAULT_RULES).description('平台及每个平台的返回数量。'),
    blockedWords: Schema.array(Schema.string().max(100)).max(500).default(DEFAULT_BLOCKED_WORDS).role('imgsearch-blocked-words').collapse().description('过滤词。'),
  }).description('搜索结果'),
  Schema.object({
    command: field(Schema.string().default('找coser'), '指令'),
    aliases: Schema.array(Schema.string()).default(['搜coser']).role('imgsearch-aliases').description('指令别名。'),
  }).description('指令设置'),
  Schema.object({
    showProgress: field(Schema.boolean().default(true), '搜索时发送“⏳ 搜索中，请稍候……”提示。'),
    resultTemplate: Schema.string().max(4000).default(DEFAULT_RESULT_TEMPLATE).role('imgsearch-result-template').description('返回消息模板，可恢复默认。'),
  }).description('消息设置'),
  Schema.object({
    logDetails: field(Schema.boolean().default(false), '调试日志'),
  }).description('调试设置'),
  // Retain advanced settings for existing configurations, but hide them from the form.
  Schema.object({
    strategy: Schema.union(['auto', 'exact', 'visual']).default('auto'),
    directUploadMode: Schema.union(['file', 'url']).default('file'),
    userAgent: Schema.string().default('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'),
    sortMode: Schema.union(['match', 'platform']).default('match'),
    dedupeAccounts: Schema.boolean().default(true),
    fetchAuthor: Schema.boolean().default(true),
    showTitle: Schema.boolean().default(true),
    promptTimeout: Schema.number().min(5).max(180).default(30),
    requestTimeout: Schema.number().min(5).max(120).default(30),
    totalTimeout: Schema.number().min(15).max(300).default(100),
    maxImageMB: Schema.number().min(1).max(30).default(10),
    maxConcurrent: Schema.number().min(1).max(5).step(1).default(2),
    cooldown: Schema.number().min(0).max(300).default(10),
    cacheMinutes: Schema.number().min(0).max(1440).default(10),
    cacheEntries: Schema.number().min(1).max(1000).step(1).default(100),
  }).hidden(),
]) as Schema<Config>
