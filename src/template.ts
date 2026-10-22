export const DEFAULT_RESULT_TEMPLATE = `🖼️ 搜图结果

{results}
📱 平台：{platform}
🧩 匹配：{match}
🏷️ 用户：{name}
📇 账号：{account}
📝 标题：{title}
📎 {linkLabel}：{url}
{/results}`

export const TEMPLATE_FIELDS = ['platform', 'match', 'name', 'account', 'title', 'linkLabel', 'url', 'index', 'count'] as const

export function templateError(template: string): string | undefined {
  if (template.length > 4000) return '模板最多 4000 字。'
  if ((template.match(/\{results\}/g) || []).length !== 1 || (template.match(/\{\/results\}/g) || []).length !== 1 || !/\{results\}[\s\S]*\{\/results\}/.test(template)) {
    return '请保留一组 {results} 和 {/results}。'
  }
  const outside = template.replace(/\{results\}[\s\S]*?\{\/results\}/, '')
  if (/\{(?:platform|match|name|account|title|linkLabel|url|index)\}/.test(outside)) return '结果字段请放在 {results} 和 {/results} 之间。'
  for (const token of template.matchAll(/\{(\/?[A-Za-z][A-Za-z0-9]*)\}/g)) {
    if (!['results', '/results', ...TEMPLATE_FIELDS].includes(token[1])) return `不支持占位符 {${token[1]}}。`
  }
  if (!/\{results\}[\s\S]*\{(?:platform|match|name|account|title|linkLabel|url|index)\}[\s\S]*\{\/results\}/.test(template)) return '结果区至少保留一个结果字段。'
}
