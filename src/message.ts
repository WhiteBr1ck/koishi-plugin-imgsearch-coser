import { PLATFORM_LABELS, cleanText } from './platforms'
import type { SocialResult } from './types'
import { DEFAULT_RESULT_TEMPLATE, templateError } from './template'

export const PROGRESS_MESSAGE = '⏳ 搜索中，请稍候……'

export function formatResults(results: SocialResult[], showTitle: boolean, warnings: string[] = [], template = DEFAULT_RESULT_TEMPLATE): string {
  const source = templateError(template) ? DEFAULT_RESULT_TEMPLATE : template
  const block = /\{results\}([\s\S]*?)\{\/results\}/.exec(source)!
  const rendered = results.map((result, index) => {
    const values: Record<string, string> = {
      platform: PLATFORM_LABELS[result.platform], match: result.match === 'exact' ? '精确匹配' : '视觉相似',
      name: cleanText(result.displayName, 100), account: cleanText(result.account, 100),
      title: showTitle ? cleanText(result.title) : '', url: result.url,
      linkLabel: result.isPost ? '帖子' : '主页', index: String(index + 1), count: String(results.length),
    }
    return block[1].split(/\r?\n/).filter(line => !['name', 'account', 'title'].some(key => line.includes(`{${key}}`) && !values[key]))
      .map(line => line.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (token, key: string) => values[key] ?? token)).join('\n').trim()
  }).join('\n\n')
  if (results.length && !rendered.trim() && source !== DEFAULT_RESULT_TEMPLATE) return formatResults(results, showTitle, warnings)
  // Slice the original template rather than reprocessing substituted external text.
  const outside = (text: string) => text.replace(/\{count\}/g, String(results.length))
  const body = results.length ? (outside(source.slice(0, block.index)) + rendered + outside(source.slice(block.index + block[0].length))).trim()
    : '没有找到符合当前平台设置的结果，可以换一张更清晰的图片再试。'
  return body + (warnings.length ? '\n\n' + [...new Set(warnings)].join('\n') : '')
}
